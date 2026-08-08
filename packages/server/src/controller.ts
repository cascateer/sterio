import { nonNullable, property, split } from "@cascateer/lib";
import { File } from "@cascateer/lib/database";
import { find, last, pull, range, sortBy } from "lodash";
import { lastValueFrom } from "rxjs";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Route,
} from "tsoa";
import { AlbumDetailed, ArtistDetailed, SongDetailed } from "ytmusic-api";
import { compile } from "./compiler";
import { SpotifyService } from "./Spotify.service";
import { SterioKeyGenerator, SterioService } from "./Sterio.service";
import {
  ApiResponse,
  SpotifyAlbum,
  SpotifyAlbumResponse,
  SterioAlbum,
  SterioAlbumFull,
  SterioCompilerConfig,
  SterioPlaylist,
  YoutubeMusicAlbum,
  YoutubeMusicAlbumResponse,
  YoutubeMusicArtistResponse,
  YoutubeMusicSongResponse,
  YoutubePlaylist,
} from "./types";
import { YoutubeService } from "./Youtube.service";
import { YoutubeMusicService } from "./YoutubeMusic.service";

const STERIO_ALBUMS_TAG = () => ["sterio/albums"];
const STERIO_ALBUM_TAG = (id: string) => [`sterio/album/${id}`];
const STERIO_PLAYLISTS_TAG = () => ["sterio/playlists"];
const STERIO_PLAYLIST_TAG = (id: string) => [`sterio/playlist/${id}`];

@Route("sterio")
export class SterioController extends Controller {
  @Get("album/{id}")
  async getAlbum(@Path() id: string): Promise<ApiResponse<SterioAlbum>> {
    const album = (await new SterioService().albums.getAll()).find(
      (album) => album.youtubeMusicId === id,
    );

    if (album != null) {
      return { data: album, tags: STERIO_ALBUM_TAG(album.youtubeMusicId) };
    }

    return new SterioService().albums.getsertOne(id).then((album) => ({
      data: album,
      tags: STERIO_ALBUM_TAG(album.youtubeMusicId),
      invalidatesTags: STERIO_ALBUMS_TAG(),
    }));
  }

  @Get("albumFull/{id}")
  async getAlbumFull(
    @Path() id: string,
  ): Promise<ApiResponse<SterioAlbumFull>> {
    return new SterioService().getAlbumFull(id).then((album) => ({
      data: album,
      tags: STERIO_ALBUM_TAG(album.youtubeMusicId).concat(
        STERIO_PLAYLISTS_TAG(),
      ),
    }));
  }

  @Post("album/{id}/resource/conflicts")
  async getAlbumResourceConflicts(
    @Path() id: string,
  ): Promise<ApiResponse<string>> {
    const data = await (async function () {
      const rows = [];

      const youtubeMusicKeyGenerator =
        await SterioKeyGenerator.fromYoutubeMusic(id);

      const youtubeKeyGenerator = await SterioKeyGenerator.fromYoutube(id);

      rows.push(
        `<td><img src="${await File.fromName("b24c59c285c106f69195a57d5b00c3e22bac5f2e.png").dataUrl()}"></td><td><a target="_blank" href="${youtubeMusicKeyGenerator.resource.url}"><img height="100" src="${await youtubeMusicKeyGenerator.resource.thumbnail?.dataUrl()}"></a></td>`,
      );

      rows.push(
        `<td><img src="${await File.fromName("68305261843e17f73c92e28faff6de8c527aa339.png").dataUrl()}"></td><td><a target="_blank" href="${youtubeKeyGenerator.resource.url}"><img height="100" src="${await youtubeKeyGenerator.resource.thumbnail?.dataUrl()}"></a></td>`,
      );

      let spotifyKeyGenerator:
        SterioKeyGenerator<SpotifyApi.TrackObjectSimplified> | undefined;

      try {
        spotifyKeyGenerator = await SterioKeyGenerator.fromSpotify(id);

        rows.push(
          `<td><img src="${await File.fromName(
            "7800c7705b6c17912a600e03dfe0d7e4b1441f5e.png",
          ).dataUrl()}"></td><td><a target="_blank" href="${spotifyKeyGenerator.resource.url}"><img height="100" src="${await spotifyKeyGenerator.resource.thumbnail?.dataUrl()}"></a></td>`,
        );
      } catch {
        rows.push(`<td>⛔</td><td>Missing Spotify resource</td>`);
      }

      const youtubeMusicItems = youtubeMusicKeyGenerator.resource.items.slice();
      const youtubeItems = youtubeKeyGenerator.resource.items.slice();
      const spotifyItems = spotifyKeyGenerator?.resource.items.slice();

      const tableRows = [];

      for (const youtubeMusicItem of youtubeMusicItems) {
        const uid = youtubeMusicKeyGenerator.uid(youtubeMusicItem);

        const tableRow = [
          { value: uid ?? null },
          {
            value: youtubeMusicKeyGenerator.key(youtubeMusicItem, "name"),
            isUid: youtubeMusicKeyGenerator.isUid(youtubeMusicItem, "name"),
          },
        ];

        const youtubeItem = youtubeItems.find(
          (youtubeItem) => youtubeKeyGenerator.uid(youtubeItem) === uid,
        );

        if (youtubeItem != null) {
          pull(youtubeItems, youtubeItem);

          tableRow.push({
            value: youtubeKeyGenerator.key(youtubeItem, "name"),
            isUid: youtubeKeyGenerator.isUid(youtubeItem, "name"),
          });
        } else {
          tableRow.push({ value: null });
        }

        if (spotifyKeyGenerator != null && spotifyItems != null) {
          const spotifyItem = spotifyItems.find(
            (spotifyItem) => spotifyKeyGenerator.uid(spotifyItem) === uid,
          );

          if (spotifyItem != null) {
            pull(spotifyItems, spotifyItem);

            tableRow.push({
              value: spotifyKeyGenerator.key(spotifyItem, "name"),
              isUid: spotifyKeyGenerator.isUid(spotifyItem, "name"),
            });
          } else {
            tableRow.push({ value: null });
          }
        }

        tableRows.push(tableRow);
      }

      for (const youtubeItem of youtubeItems) {
        const uid = youtubeKeyGenerator.uid(youtubeItem);

        const tableRow = [
          { value: uid ?? null },
          { value: null },
          {
            value: youtubeKeyGenerator.key(youtubeItem, "name"),
            isUid: youtubeKeyGenerator.isUid(youtubeItem, "name"),
          },
        ];

        if (spotifyKeyGenerator != null && spotifyItems != null) {
          const spotifyItem = spotifyItems.find(
            (spotifyItem) => spotifyKeyGenerator.uid(spotifyItem) === uid,
          );

          if (spotifyItem != null) {
            pull(spotifyItems, spotifyItem);

            tableRow.push({
              value: spotifyKeyGenerator.key(spotifyItem, "name"),
              isUid: spotifyKeyGenerator.isUid(spotifyItem, "name"),
            });
          } else {
            tableRow.push({ value: null });
          }
        }

        tableRows.push(tableRow);
      }

      if (spotifyKeyGenerator != null && spotifyItems != null) {
        for (const spotifyItem of spotifyItems) {
          const uid = spotifyKeyGenerator.uid(spotifyItem);

          const tableRow = [
            { value: uid ?? null },
            { value: null },
            { value: null },
            {
              value: spotifyKeyGenerator.key(spotifyItem, "name"),
              isUid: spotifyKeyGenerator.isUid(spotifyItem, "name"),
            },
          ];

          tableRows.push(tableRow);
        }
      }

      return `
      <div>
        <table style="white-space: pre;">
          ${rows
            .concat(
              ["", "🔑", "YoutubeMusic", "Youtube", "Spotify"]
                .map(
                  (tableHeader) =>
                    `<th style="text-align: left">${tableHeader}</th>`,
                )
                .join(""),
              tableRows.map(
                (tableRow, tableRowIndex) =>
                  `<td style="text-align: center">${tableRowIndex + 1}.</td>${tableRow.map(({ value, isUid }) => `<td style="color: ${isUid === false ? "orange" : "inherit"}">${(value ?? "❌") || "⠀"}</td>`).join("")}`,
              ),
            )
            .map((row) => `<tr>${row}</tr>`)
            .join("\n")}
        </table>
        <hr>
        <table>
          ${range(
            Math.max(
              youtubeMusicKeyGenerator.resource.items.length,
              youtubeKeyGenerator.resource.items.length,
              spotifyKeyGenerator?.resource.items.length ?? 0,
            ),
          )
            .map((index) =>
              [
                youtubeMusicKeyGenerator.uids()[index],
                youtubeKeyGenerator.uids()[index],
                spotifyKeyGenerator?.uids()[index],
              ]
                .map(
                  (song, i) =>
                    `<tr>${!i ? `<td rowspan="3" style="vertical-align: top;">${index + 1}.</td>` : ""}<td>${(song ?? "❌") || "⠀"}</td></tr>`,
                )
                .join("\n"),
            )
            .join("\n")}
        </table>
      </div>`;
    })();

    return {
      data,
      tags: STERIO_ALBUM_TAG(id),
    };
  }

  @Patch("album")
  async updateAlbum(
    @Body()
    albumPatch: SterioAlbum,
  ): Promise<ApiResponse<void>> {
    return new SterioService().updateAlbum(albumPatch).then(() => ({
      data: void 0,
      invalidatesTags: STERIO_ALBUM_TAG(albumPatch.youtubeMusicId),
    }));
  }

  @Delete("album/{id}")
  async deleteAlbum(
    @Path() id: string,
  ): Promise<ApiResponse<string | undefined>> {
    return new SterioService().albums
      .dispatch("delete", id)
      .then((tableIndex) => ({
        data: last(tableIndex.getAllIds()),
        invalidatesTags: STERIO_ALBUMS_TAG(),
      }));
  }

  @Get("albumsIds")
  async getAlbumIds(): Promise<ApiResponse<string[]>> {
    return new SterioService().albums.getAll().then((albums) => ({
      data: albums.map(property("youtubeMusicId")),
      tags: STERIO_ALBUMS_TAG(),
    }));
  }

  @Post("albums/compilation")
  async compileAlbums(
    @Body() config: SterioCompilerConfig,
  ): Promise<ApiResponse<string>> {
    return compile(config).then(({ html }) => ({
      data: html,
    }));
  }

  @Get("playlist/{id}")
  async getPlaylist(@Path() id: string): Promise<ApiResponse<SterioPlaylist>> {
    const playlist = (await new SterioService().playlists.getAll()).find(
      (playlist) => playlist.id === id,
    );

    if (playlist != null) {
      return {
        data: playlist,
        tags: STERIO_PLAYLIST_TAG(playlist.id),
      };
    }

    return new SterioService().playlists.getsertOne(id).then((playlist) => ({
      data: playlist,
      tags: STERIO_PLAYLIST_TAG(playlist.id),
      invalidatesTags: STERIO_PLAYLISTS_TAG(),
    }));
  }

  @Patch("playlist")
  async updatePlaylist(
    @Body()
    playlistPatch: SterioPlaylist,
  ): Promise<ApiResponse<void>> {
    return new SterioService().updatePlaylist(playlistPatch).then(() => ({
      data: void 0,
      invalidatesTags: STERIO_PLAYLIST_TAG(playlistPatch.id).concat(
        STERIO_PLAYLISTS_TAG(),
      ),
    }));
  }

  @Get("playlists")
  async getPlaylists(): Promise<ApiResponse<SterioPlaylist[]>> {
    return new SterioService().playlists.getAll().then((playlists) => ({
      data: playlists,
      tags: STERIO_PLAYLISTS_TAG(),
    }));
  }

  async toYoutubeMusicAlbumResponse({
    albumId,
    artist,
    name,
    year,
  }: AlbumDetailed | YoutubeMusicAlbum): Promise<YoutubeMusicAlbumResponse> {
    return new SterioService().albums.getAll().then((sterioAlbums) => ({
      albumId,
      artist,
      name,
      year,
      isSaved: find(sterioAlbums, { youtubeMusicId: albumId }) != null,
    }));
  }

  async toYoutubeMusicArtistResponse({
    artistId,
    name,
  }: ArtistDetailed): Promise<YoutubeMusicArtistResponse> {
    return {
      artistId,
      name,
    };
  }

  async toYoutubeMusicSongResponse({
    videoId,
    name,
    album,
    artist,
  }: SongDetailed): Promise<YoutubeMusicSongResponse> {
    return new SterioService().albums.getAll().then((sterioAlbums) => ({
      videoId,
      name,
      album,
      artist,
      isSaved: find(sterioAlbums, { youtubeMusicId: album?.albumId }) != null,
    }));
  }

  @Get("youtube-music/album/{id}")
  async getYoutubeMusicAlbum(
    @Path() id: string,
  ): Promise<ApiResponse<YoutubeMusicAlbumResponse>> {
    return new YoutubeMusicService().albums
      .getsertOne(id)
      .then(async (album) => ({
        data: await this.toYoutubeMusicAlbumResponse(album),
      }));
  }

  @Get("youtube-music/albums/search")
  async searchYoutubeMusicAlbums(
    @Query("q") query: string,
  ): Promise<ApiResponse<YoutubeMusicAlbumResponse[]>> {
    return lastValueFrom(new YoutubeMusicService().searchAlbums(query)).then(
      async (albums) => ({
        data: await Promise.all(
          albums.map((album) => this.toYoutubeMusicAlbumResponse(album)),
        ),
        tags: STERIO_ALBUMS_TAG(),
      }),
    );
  }

  @Get("youtube-music/artists/search")
  async searchYoutubeMusicArtists(
    @Query("q") query: string,
  ): Promise<ApiResponse<YoutubeMusicArtistResponse[]>> {
    return lastValueFrom(new YoutubeMusicService().searchArtists(query)).then(
      async (artists) => ({
        data: await Promise.all(
          artists.map((artist) => this.toYoutubeMusicArtistResponse(artist)),
        ),
      }),
    );
  }

  @Get("youtube-music/artist/{id}/songs")
  async searchYoutubeMusicArtistSongs(
    @Path() id: string,
  ): Promise<ApiResponse<YoutubeMusicSongResponse[]>> {
    return {
      data: await new YoutubeMusicService()
        .initialize()
        .then((api) =>
          api
            .getArtistSongs(id)
            .then((songs) =>
              Promise.all(
                sortBy(songs, [
                  (song) => song.artist.name,
                  (song) => song.album?.name,
                  (song) => song.name,
                ]).map((song) => this.toYoutubeMusicSongResponse(song)),
              ),
            ),
        ),
      tags: STERIO_ALBUMS_TAG(),
    };
  }

  @Get("youtube/playlists")
  async getYoutubePlaylists(
    @Query() ids: string,
  ): Promise<ApiResponse<YoutubePlaylist[]>> {
    return {
      data: await new YoutubeService().playlists.getsertMany(split(ids)),
    };
  }

  async toSpotifyAlbumResponse({
    id,
    name,
    artists,
    release_date,
  }:
    | SpotifyApi.AlbumObjectSimplified
    | SpotifyApi.AlbumObjectFull
    | SpotifyAlbum): Promise<SpotifyAlbumResponse> {
    return {
      id,
      name,
      artists,
      release_date,
    };
  }

  @Get("spotify/album/{id}")
  async getSpotifyAlbum(
    @Path() id: string,
  ): Promise<ApiResponse<SpotifyAlbumResponse>> {
    return {
      data: await new SpotifyService().albums
        .getsertOne(id)
        .then((album) => this.toSpotifyAlbumResponse(album)),
    };
  }

  @Get("spotify/albums")
  async getSpotifyAlbums(
    @Query("q") query: string,
  ): Promise<ApiResponse<SpotifyAlbumResponse[]>> {
    return {
      data: await (() => {
        try {
          const url = new URL(query);

          return new SpotifyService().albums
            .getsertOne(nonNullable(url.pathname.match(/album\/(\w+)$/)?.[1]))
            .then(async (album) => [await this.toSpotifyAlbumResponse(album)]);
        } catch {
          return new SpotifyService()
            .searchAlbums(query, 10)
            .then((albums) =>
              Promise.all(
                albums.map((album) => this.toSpotifyAlbumResponse(album)),
              ),
            );
        }
      })(),
    };
  }
}
