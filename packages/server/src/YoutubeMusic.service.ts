import { findDupeBy, keyMapBy, nonNullable, property } from "@cascateer/lib";
import { createTable } from "@cascateer/lib/database";
import { maxBy, once, uniq } from "lodash";
import { Ora } from "ora";
import { defer, identity, Observable, of, UnaryFunction } from "rxjs";
import YTMusic, {
  AlbumDetailed,
  ArtistDetailed,
  SongDetailed,
} from "ytmusic-api";
import { DocumentFileTable } from "./tables";
import { YoutubeMusicAlbum } from "./types";
import { YoutubeService } from "./Youtube.service";

export class YoutubeMusicService {
  private static initialize = once(async (): Promise<YTMusic> =>
    new YTMusic().initialize().then(nonNullable),
  );

  public initialize = YoutubeMusicService.initialize;

  private static YoutubeMusicAlbumTable = createTable<
    YoutubeMusicAlbum,
    "albumId"
  >("youtube-music-albums", "albumId", (albumIds) =>
    Promise.all(
      uniq(albumIds).map((albumId) =>
        new YoutubeMusicService().getAlbum(albumId),
      ),
    ),
  );

  get albums() {
    return new YoutubeMusicService.YoutubeMusicAlbumTable();
  }

  private async getAlbum(albumId: string) {
    return this.initialize().then((api) =>
      api.getAlbum(albumId).then(async (album) => {
        const dupe = findDupeBy(album.songs, property("videoId"));

        if (dupe != null) {
          console.warn(
            `Duplicate videoId ${dupe.videoId} in album ${JSON.stringify(album.albumId)}`,
          );
        }

        const videoMap = keyMapBy(album.songs, property("videoId"), identity);

        for (const video of await new YoutubeService().videos.getsertMany(
          album.songs.flatMap((song) => (song.name ? [] : song.videoId)),
        )) {
          if (video.id != null) {
            videoMap.get(video.id)!.name = video.snippet?.title ?? "";
          }
        }

        return album;
      }),
    );
  }

  public searchAlbums: UnaryFunction<string, Observable<AlbumDetailed[]>> = (
    query,
  ) =>
    query
      ? defer(() => this.initialize().then((api) => api.searchAlbums(query)))
      : of([]);

  public searchArtists: UnaryFunction<string, Observable<ArtistDetailed[]>> = (
    query,
  ) =>
    query
      ? defer(() => this.initialize().then((api) => api.searchArtists(query)))
      : of([]);

  public searchSongs: UnaryFunction<string, Observable<SongDetailed[]>> = (
    query,
  ) =>
    query
      ? defer(() => this.initialize().then((api) => api.searchSongs(query)))
      : of([]);

  public async getThumbnail(albumId: string, spinner?: Ora) {
    return this.albums
      .getsertOne(albumId)
      .then((album) => maxBy(album.thumbnails, property("height"))?.url)
      .then((url) => {
        if (url != null) {
          return new DocumentFileTable().getFile(url, spinner);
        }
      });
  }
}
