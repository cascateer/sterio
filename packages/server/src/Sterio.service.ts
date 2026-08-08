import { nonNullable, property, Snippet } from "@cascateer/lib";
import { createTable, File } from "@cascateer/lib/database";
import { LazyPromise } from "@cascateer/lib/promise";
import assert from "assert";
import filenamify from "filenamify";
import { youtube_v3 } from "googleapis";
import {
  at,
  compact,
  groupBy,
  isNil,
  mapValues,
  memoize,
  reject,
  tap,
  thru,
} from "lodash";
import NodeID3 from "node-id3";
import objectHash from "object-hash";
import { Ora } from "ora";
import { relative, resolve } from "path";
import { pageIndex } from "./lib";
import { SpotifyService } from "./Spotify.service";
import { StreamFileTable } from "./tables";
import {
  SterioAlbum,
  SterioAlbumFull,
  SterioDuration,
  SterioPlaylist,
  SterioSongFull,
} from "./types";
import { YoutubeService } from "./Youtube.service";
import { YoutubeMusicService } from "./YoutubeMusic.service";

export class SterioService {
  private static SterioAlbumTable = createTable<SterioAlbum, "youtubeMusicId">(
    "sterio-albums",
    "youtubeMusicId",
    (albumIds) => albumIds.map((albumId) => ({ youtubeMusicId: albumId })),
  );

  private static SterioPlaylistTable = createTable<SterioPlaylist, "id">(
    "sterio-playlists",
    "id",
    (ids) => ids.map((id) => ({ id })),
  );

  get albums() {
    return new SterioService.SterioAlbumTable();
  }

  get playlists() {
    return new SterioService.SterioPlaylistTable();
  }

  public async getAlbumFull(
    youtubeMusicId: string,
    spinner?: Ora,
  ): Promise<SterioAlbumFull> {
    return this.albums.getsertOne(youtubeMusicId, spinner).then((sterioAlbum) =>
      new YoutubeMusicService().albums
        .getsertOne(sterioAlbum.youtubeMusicId, spinner)
        .then(async (youtubeMusicAlbum) => {
          const youtubeMusicKeyGenerator =
            await SterioKeyGenerator.fromYoutubeMusic(
              sterioAlbum.youtubeMusicId,
            );

          const youtubeKeyGenerator = await SterioKeyGenerator.fromYoutube(
            sterioAlbum.youtubeMusicId,
          );

          return {
            youtubeMusicAlbum,
            patchedYoutubeMusicAlbum: {
              ...youtubeMusicAlbum,
              // FIXME assuming youtubeMusicKeyGenerator.resource.items to equal youtubeMusicAlbum.songs
              songs: youtubeMusicKeyGenerator.resource.items.map((song) => ({
                ...song,
                videoId: youtubeKeyGenerator.resource.items.find(
                  (youtubeItem) =>
                    (youtubeMusicKeyGenerator.uid(song) ?? false) ===
                    youtubeKeyGenerator.uid(youtubeItem),
                )?.contentDetails?.videoId,
              })),
            },
          };
        })
        .then(
          ({
            youtubeMusicAlbum,
            patchedYoutubeMusicAlbum: {
              albumId,
              artist,
              name,
              playlistId,
              songs,
              thumbnails,
              year,
            },
          }) =>
            new YoutubeService().videos
              .getsertMany(
                songs.flatMap((song) => song.videoId ?? []),
                spinner,
              )
              .then((videos) =>
                LazyPromise.concatAll(
                  songs
                    .map((song) => ({
                      song,
                      video: videos.find((video) => video.id === song.videoId),
                    }))
                    .map(
                      ({ song, video }, songIndex, { length }) =>
                        new LazyPromise(async () => {
                          if (song.videoId == null) {
                            return [];
                          }

                          const albumArtworkFile =
                            await new YoutubeMusicService().getThumbnail(
                              albumId,
                              spinner,
                            );

                          const patched =
                            song.videoId !==
                            youtubeMusicAlbum.songs[songIndex]?.videoId;

                          const included = thru(
                            sterioAlbum?.songs,
                            (include) =>
                              include == null || include.includes(songIndex),
                          );

                          const songArtworkFile =
                            await new YoutubeService().getVideoThumbnail(
                              song.videoId,
                              spinner,
                            );

                          const duration = SterioDuration.fromPeriodOfTime(
                            video?.contentDetails?.duration,
                          );

                          return {
                            youtubeMusicId: sterioAlbum.youtubeMusicId,
                            index: songIndex,
                            videoId: song.videoId,
                            patched,
                            included,
                            channel:
                              video?.snippet?.channelId != null ||
                              video?.snippet?.channelTitle != null
                                ? {
                                    id: video?.snippet?.channelId ?? void 0,
                                    title:
                                      video?.snippet?.channelTitle ?? void 0,
                                  }
                                : void 0,
                            artwork: await [
                              {
                                key: "album" as const,
                                file: albumArtworkFile,
                              },
                              {
                                key: "song" as const,
                                file: songArtworkFile,
                              },
                            ].reduce(
                              (artwork, { key, file }) =>
                                artwork.then(async (artwork) => {
                                  if (file != null) {
                                    artwork[key] = {
                                      path: `file://${file.path.replace(/\\/g, "/")}`,
                                      checksum: await file.hash(),
                                    };
                                  }

                                  return artwork;
                                }),
                              Promise.resolve<SterioSongFull["artwork"]>({}),
                            ),
                            duration,
                            tags: {
                              title: song.name,
                              artist: artist.name,
                              performerInfo: artist.name,
                              album: name,
                              trackNumber: pageIndex(songIndex + 1, length),
                              year: year?.toString() ?? void 0,
                              image: albumArtworkFile?.toString(),
                              audioSourceUrl: `https://youtube.com/watch?v=${song.videoId}`,
                              length:
                                duration != null
                                  ? `${(duration.minutes * 60 + duration.seconds) * 1e3}`
                                  : void 0,
                            },
                            playlists: await new SterioService().playlists
                              .getAll()
                              .then((playlists) =>
                                playlists.flatMap(({ id, name, items }) =>
                                  items?.[sterioAlbum.youtubeMusicId]?.includes(
                                    songIndex,
                                  )
                                    ? { id, name }
                                    : [],
                                ),
                              ),
                          } satisfies SterioSongFull;
                        }),
                    ),
                ),
              )
              .then((songs) => ({
                youtubeMusicId: sterioAlbum.youtubeMusicId,
                youtubeId: sterioAlbum.youtubeId,
                spotifyId: sterioAlbum.spotifyId,
                artist,
                name,
                playlistId,
                songs: songs.flat(),
                thumbnails,
                year,
              })),
        ),
    );
  }

  public async getAlbumFolder(
    youtubeMusicId: string,
    OUT_URL: string,
    spinner?: Ora,
  ) {
    type SterioSongPartial = {
      included: boolean;
      totalSeconds: number;
      tags: NodeID3.Tags;
      playlists: SterioSongFull["playlists"];
    };

    const {
      source,
      sourceChecksum,
      target: { albumName, albumArtistName, songs },
    } = thru(
      await this.getAlbumFull(youtubeMusicId, spinner).then((album) => ({
        source: album,
        target: {
          youtubeMusicId,
          OUT_URL,
          albumName: album.name,
          albumArtistName: album.artist.name,
          songs: album.songs.map(
            (song): SterioSongPartial => ({
              included: song.included,
              totalSeconds: song.duration?.totalSeconds ?? 0,
              tags: song.tags,
              playlists: song.playlists,
            }),
          ),
        },
      })),
      ({ source, target }) => ({
        source,
        sourceChecksum: objectHash(target),
        target,
      }),
    );

    const albumPath = resolve(
      OUT_URL,
      filenamify([albumArtistName, albumName].join(" - "), {
        replacement: "",
      }),
    );

    const files = new Array<{
      song: SterioSongPartial;
      sourcePath: string;
      targetPath: string;
    }>();

    for (const song of songs) {
      if (!song.included) {
        continue;
      }

      const sourceFile = await new StreamFileTable().getFile(
        nonNullable(song.tags.audioSourceUrl),
        spinner,
      );

      const targetFile = resolve(
        albumPath,
        filenamify(
          `${compact([song.tags.trackNumber?.split("/")[0], song.tags.title]).join(" ")}${sourceFile.extname}`,
          { replacement: "" },
        ),
      );

      files.push({
        song,
        sourcePath: sourceFile.path,
        targetPath: targetFile,
      });
    }

    const playlistItems = mapValues(
      groupBy(
        files.flatMap(({ song, targetPath }) =>
          song.playlists.map((playlist) => ({
            playlistId: playlist.id,
            item: `#EXTINF:${song.totalSeconds},${song.tags.artist} - ${song.tags.title}\n${relative(OUT_URL, targetPath)}`,
          })),
        ),
        property("playlistId"),
      ),
      (playlist) => playlist.map(property("item")),
    );

    return {
      source,
      sourceChecksum,
      path: albumPath,
      files,
      playlistItems,
    };
  }

  public async updateAlbum(albumPatch: SterioAlbum) {
    return this.albums.dispatch(
      "update",
      albumPatch.youtubeMusicId,
      (album: SterioAlbum): SterioAlbum => ({
        ...album,
        ...albumPatch,
        songs: albumPatch.songs,
      }),
    );
  }

  public async updatePlaylist(playlistPatch: SterioPlaylist) {
    return this.playlists.dispatch(
      "update",
      playlistPatch.id,
      (playlist: SterioPlaylist): SterioPlaylist =>
        Object.assign({}, playlist, playlistPatch, {
          items: Object.assign({}, playlist.items, playlistPatch.items),
        }),
    );
  }
}

export class SterioKeyGenerator<T> {
  constructor(
    public resource: {
      url: string;
      thumbnail?: File;
      items: T[];
    },
    public iteratees: {
      uid?: string;
      name: string;
    },
  ) {}

  static async fromYoutubeMusic(sterioAlbumId: string) {
    const { youtubeMusicId, youtubeMusicIteratee } =
      await new SterioService().albums.getsertOne(sterioAlbumId);

    return new SterioKeyGenerator(
      await new YoutubeMusicService().albums
        .getsertOne(youtubeMusicId)
        .then(async (album) => ({
          url: `https://music.youtube.com/playlist?list=${album.playlistId}`,
          thumbnail: await new YoutubeMusicService().getThumbnail(
            album.albumId,
          ),
          items: album.songs.map((song, songIndex) => ({
            ...song,
            index: songIndex,
          })),
        })),
      {
        uid: youtubeMusicIteratee,
        name: "${$.name}",
      },
    );
  }

  static async fromYoutube(
    sterioAlbumId: string,
  ): Promise<SterioKeyGenerator<youtube_v3.Schema$PlaylistItem>> {
    const { youtubeMusicId, youtubeId, youtubeIteratee } =
      await new SterioService().albums.getsertOne(sterioAlbumId);

    return new SterioKeyGenerator(
      await new YoutubeService().playlists
        .getsertOne(
          youtubeId ??
            (await new YoutubeMusicService().albums.getsertOne(youtubeMusicId))
              .playlistId,
        )
        .then(async (playlist) => ({
          url: `https://www.youtube.com/playlist?list=${playlist.id}`,
          thumbnail: await new YoutubeService().getPlaylistThumbnail(
            playlist.id,
          ),
          items: playlist.items,
        })),
      {
        uid: youtubeIteratee,
        name: "${$.snippet.title}",
      },
    );
  }

  static async fromSpotify(
    sterioAlbumId: string,
  ): Promise<SterioKeyGenerator<SpotifyApi.TrackObjectSimplified>> {
    const { spotifyId, spotifyIteratee } =
      await new SterioService().albums.getsertOne(sterioAlbumId);

    return new SterioKeyGenerator(
      await new SpotifyService().albums
        .getsertOne(nonNullable(spotifyId))
        .then(async (album) => ({
          url: `https://open.spotify.com/intl-de/album/${album.id}`,
          thumbnail: await new SpotifyService().getThumbnail(album.id),
          items: album.tracks.items.map((track, trackIndex) => ({
            ...track,
            index: trackIndex,
          })),
        })),
      {
        uid: spotifyIteratee,
        name: "${$.name}",
      },
    );
  }

  key = (item: T, type?: keyof typeof this.iteratees): string => {
    try {
      return tap(
        thru(
          Snippet.parseAll(
            item,
            type === "name"
              ? this.iteratees.name
              : this.iteratees.uid || this.iteratees.name,
          ),
          (key) => (type === "name" ? key : key.toUpperCase().trim()),
        ),
        assert,
      );
    } catch (error) {
      console.log(`Error in key generator: ${error}`);

      return "";
    }
  };

  isUid = (item: T, type: keyof typeof this.iteratees) =>
    this.key(item) === this.key(item, type).toUpperCase();

  keys = memoize((type?: keyof typeof this.iteratees) =>
    this.resource.items.map((item) => this.key(item, type)),
  );

  uid = (item: T) =>
    thru(this.key(item), (key) => {
      if (key && groupBy(this.keys())[key]?.length === 1) {
        return key;
      }
    });

  uids = () => this.resource.items.map(this.uid);

  at = <U>(mask: SterioKeyGenerator<U>, type?: keyof typeof this.iteratees) =>
    reject(
      at(
        this.keys(type),
        mask.keys().map((key) => this.keys().indexOf(key)),
      ),
      isNil,
    );
}
