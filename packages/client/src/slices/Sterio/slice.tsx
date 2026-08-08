import { ApiProvider, createSlice } from "@cascateer/core";
import { EndoFunction, nonNullable, property } from "@cascateer/lib";
import { modulo } from "@cascateer/lib/math";
import {
  ApiResponseSpotifyAlbumResponse,
  ApiResponseSpotifyAlbumResponseArray,
  ApiResponseSterioAlbum,
  ApiResponseSterioAlbumFull,
  ApiResponseSterioPlaylist,
  ApiResponseSterioPlaylistArray,
  ApiResponseString,
  ApiResponseStringArray,
  ApiResponseStringOrUndefined,
  ApiResponseVoid,
  ApiResponseYoutubeMusicAlbumResponse,
  ApiResponseYoutubeMusicAlbumResponseArray,
  ApiResponseYoutubeMusicArtistResponseArray,
  ApiResponseYoutubeMusicSongResponseArray,
  ApiResponseYoutubePlaylistArray,
  CreateYoutubePlaylistRequest,
  DefaultApi,
  SpotifyAlbumResponse,
  SterioAlbum,
  SterioCompilerConfig,
  SterioPlaylist,
  SterioSongFull,
  YoutubeMusicAlbumResponse,
  YoutubeMusicArtistResponse,
  YoutubeMusicSongResponse,
  YoutubePlaylist,
} from "@cascateer/sterio-server/api";
import { compact, constant, sortBy, sortedUniq, tap, thru, uniq } from "lodash";
import { combineLatest, firstValueFrom, map, of, switchMap } from "rxjs";

export const sterioSlice = createSlice("sterio")
  .withData<{
    sterioAlbumId: string;
    youtubeMusicArtistId?: string;
    youtubeMusicVideoId?: string;
    youtubePlaylistQueries: string[];
  }>({
    sterioAlbumId: localStorage.getItem("sterioAlbumId") ?? "MPREb_1qFzKUtprRu",
    youtubePlaylistQueries: [],
  })
  .withStore(({ StoreProvider }) =>
    new StoreProvider()
      .provideEffects(({ effect }) => ({
        sterioAlbumId: effect(({ data }) => data.property("sterioAlbumId")),
        youtubeMusicArtistId: effect(({ data }) =>
          data.property("youtubeMusicArtistId"),
        ),
        youtubeMusicVideoId: effect(({ data }) =>
          data.property("youtubeMusicVideoId"),
        ),
        youtubePlaylistQueries: effect(({ data }) =>
          data.property("youtubePlaylistQueries"),
        ),
      }))
      .provideActions(({ action }) => ({
        updateSterioAlbumId: action<string>(({ sterioAlbumId }) =>
          sterioAlbumId.update(
            (id) => () =>
              tap(id, (id) => localStorage.setItem("sterioAlbumId", id)),
          ),
        ),
        updateYoutubeMusicArtistId: action<string>(({ youtubeMusicArtistId }) =>
          youtubeMusicArtistId.update(constant),
        ),
        updateYoutubeMusicVideoId: action<string>(({ youtubeMusicVideoId }) =>
          youtubeMusicVideoId.update(constant),
        ),
        addYoutubePlaylistQuery: action<string>(({ youtubePlaylistQueries }) =>
          youtubePlaylistQueries.update(
            (query) => (queries) => uniq(queries.concat(query)),
          ),
        ),
      }))
      .complete(),
  )
  .withApi(
    new ApiProvider(new DefaultApi())
      .provideEffects(({ effect }) => ({
        sterioAlbum: effect<string, ApiResponseSterioAlbum>((api) => ({
          predicate: (id) => api.getAlbum({ id }),
          tags: (_, { tags }) => tags,
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
        })),
        sterioAlbumFull: effect<string, ApiResponseSterioAlbumFull>((api) => ({
          predicate: (id) => api.getAlbumFull({ id }),
          tags: (_, { tags }) => tags,
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          persist: false,
        })),
        sterioAlbumResourceConflicts: effect<string, ApiResponseString>(
          (api) => ({
            predicate: (id) => api.getAlbumResourceConflicts({ id }),
            tags: (_, { tags }) => tags,
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
        sterioAlbumIds: effect<void, ApiResponseStringArray>((api) => ({
          predicate: () => api.getAlbumIds(),
          tags: (_, { tags }) => tags,
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
        })),
        sterioPlaylist: effect<string, ApiResponseSterioPlaylist>((api) => ({
          predicate: (id) => api.getPlaylist({ id }),
          tags: (_, { tags }) => tags,
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
        })),
        sterioPlaylists: effect<void, ApiResponseSterioPlaylistArray>(
          (api) => ({
            predicate: () => api.getPlaylists(),
            tags: (_, { tags }) => tags,
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
        youtubeMusicAlbum: effect<string, ApiResponseYoutubeMusicAlbumResponse>(
          (api) => ({
            predicate: (id) => api.getYoutubeMusicAlbum({ id }),
            tags: (_, { tags }) => tags,
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
        youtubeMusicAlbums: effect<
          string,
          ApiResponseYoutubeMusicAlbumResponseArray
        >((api) => ({
          predicate: (q) => api.searchYoutubeMusicAlbums({ q }),
          tags: (_, { tags }) => tags,
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
        })),
        youtubeMusicArtists: effect<
          string,
          ApiResponseYoutubeMusicArtistResponseArray
        >((api) => ({
          predicate: (q) => api.searchYoutubeMusicArtists({ q }),
          tags: (_, { tags }) => tags,
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
        })),
        youtubeMusicArtistSongs: effect<
          string,
          ApiResponseYoutubeMusicSongResponseArray
        >((api) => ({
          predicate: (id) => api.searchYoutubeMusicArtistSongs({ id }),
          tags: (_, { tags }) => tags,
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
        })),
        youtubePlaylists: effect<string[], ApiResponseYoutubePlaylistArray>(
          (api) => ({
            predicate: (ids) =>
              api.getYoutubePlaylists({ ids: `${sortedUniq(sortBy(ids))}` }),
            tags: (_, { tags }) => tags,
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
        spotifyAlbum: effect<string, ApiResponseSpotifyAlbumResponse>(
          (api) => ({
            predicate: (id) => api.getSpotifyAlbum({ id }),
            tags: (_, { tags }) => tags,
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
        spotifyAlbums: effect<string, ApiResponseSpotifyAlbumResponseArray>(
          (api) => ({
            predicate: (q) => api.getSpotifyAlbums({ q }),
            tags: (_, { tags }) => tags,
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
      }))
      .provideActions(({ action }) => ({
        createYoutubePlaylist: action((api) => ({
          predicate: (req: CreateYoutubePlaylistRequest) =>
            api.createYoutubePlaylist(req),
        })),
        updateSterioAlbum: action<SterioAlbum, ApiResponseVoid>((api) => ({
          predicate: (sterioAlbum) => api.updateAlbum({ sterioAlbum }),
          invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
        })),
        deleteSterioAlbum: action<string, ApiResponseStringOrUndefined>(
          (api) => ({
            predicate: (id) => api.deleteAlbum({ id }),
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
        compileSterioAlbums: action<SterioCompilerConfig, ApiResponseString>(
          (api) => ({
            predicate: (sterioCompilerConfig) =>
              api.compileAlbums({ sterioCompilerConfig }),
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
        updateSterioPlaylist: action<SterioPlaylist, ApiResponseVoid>(
          (api) => ({
            predicate: (sterioPlaylist) =>
              api.updatePlaylist({ sterioPlaylist }),
            invalidatesTags: (_, { invalidatesTags }) => invalidatesTags,
          }),
        ),
      }))
      .complete(),
  )
  .withTerminal(({ TerminalProvider }) =>
    new TerminalProvider()
      .provideEffects(({ effect }) => ({
        sterioAlbum: effect<void, SterioAlbum>(
          ({ store, api }) =>
            () =>
              store.effects
                .sterioAlbumId()
                .pipe(
                  switchMap((id) =>
                    api.effects.sterioAlbum(id).pipe(map(property("data"))),
                  ),
                ),
        ),
        sterioAlbumSongs: effect<void, SterioSongFull[]>(
          ({ store, api }) =>
            () =>
              store.effects.sterioAlbumId().pipe(
                switchMap((id) => api.effects.sterioAlbumFull(id)),
                map(({ data }) => data.songs),
              ),
        ),
        sterioAlbumResourceConflicts: effect<void, string>(
          ({ store, api }) =>
            () =>
              store.effects.sterioAlbumId().pipe(
                switchMap((id) => api.effects.sterioAlbumResourceConflicts(id)),
                map(property("data")),
              ),
        ),
        sterioAlbumIds: effect<void, string[]>(
          ({ api }) =>
            () =>
              api.effects.sterioAlbumIds().pipe(map(property("data"))),
        ),
        sterioPlaylist: effect<string, SterioPlaylist>(
          ({ api }) =>
            (id) =>
              api.effects.sterioPlaylist(id).pipe(map(property("data"))),
        ),
        sterioPlaylists: effect<void, SterioPlaylist[]>(
          ({ api }) =>
            () =>
              api.effects.sterioPlaylists().pipe(map(property("data"))),
        ),
      }))
      .provideEffects(({ effect }) => ({
        sterioAlbumIndex: effect<void, number>(
          ({ terminal }) =>
            () =>
              combineLatest([
                terminal.effects.sterioAlbum(),
                terminal.effects.sterioAlbumIds(),
              ]).pipe(
                map(([album, albumIds]) =>
                  albumIds.findIndex(
                    (albumId) => albumId === album.youtubeMusicId,
                  ),
                ),
              ),
        ),
        youtubeMusicAlbums: effect<
          string | undefined,
          YoutubeMusicAlbumResponse[]
        >(
          ({ api, terminal }) =>
            (q) =>
              q != null
                ? api.effects.youtubeMusicAlbums(q).pipe(map(property("data")))
                : terminal.effects.sterioAlbum().pipe(
                    switchMap(({ youtubeMusicId }) =>
                      api.effects.youtubeMusicAlbum(youtubeMusicId),
                    ),
                    map(({ data: album }) => [album]),
                  ),
        ),
        youtubeMusicArtists: effect<
          string | undefined,
          YoutubeMusicArtistResponse[]
        >(
          ({ api }) =>
            (q) =>
              q != null
                ? api.effects.youtubeMusicArtists(q).pipe(map(property("data")))
                : of([]),
        ),
        youtubeMusicArtistSongs: effect<void, YoutubeMusicSongResponse[]>(
          ({ store, api }) =>
            () =>
              store.effects.youtubeMusicArtistId().pipe(
                switchMap((artistId) =>
                  artistId != null
                    ? api.effects.youtubeMusicArtistSongs(artistId)
                    : of({ data: [] }),
                ),
                map(property("data")),
              ),
        ),
        youtubePlaylistIds: effect<void, string[]>(
          ({ store }) =>
            () =>
              store.effects.youtubePlaylistQueries().pipe(
                map((queries) =>
                  queries
                    .map((query) => query.trim())
                    .flatMap((query) => {
                      const id = (() => {
                        try {
                          return new URL(query).searchParams.get("list");
                        } catch {
                          return query;
                        }
                      })();

                      if (id != null && /^[\w-]+$/.test(id)) {
                        return id;
                      }

                      return [];
                    }),
                ),
              ),
        ),
        spotifyAlbums: effect<string | undefined, SpotifyAlbumResponse[]>(
          ({ api, terminal }) =>
            (q) =>
              q != null
                ? api.effects.spotifyAlbums(q).pipe(map(property("data")))
                : terminal.effects.sterioAlbum().pipe(
                    switchMap(({ spotifyId }) =>
                      spotifyId != null
                        ? api.effects.spotifyAlbum(spotifyId)
                        : of({ data: null }),
                    ),
                    map(({ data: album }) => compact([album])),
                  ),
        ),
      }))
      .provideEffects(({ effect }) => ({
        youtubePlaylists: effect<void, YoutubePlaylist[]>(
          ({ api, terminal }) =>
            () =>
              terminal.effects
                .youtubePlaylistIds()
                .pipe(
                  switchMap(api.effects.youtubePlaylists),
                  map(property("data")),
                ),
        ),
      }))
      .provideActions(({ action }) => ({
        stepSterioAlbum: action<number, void>(
          ({ store, terminal }) =>
            (step) =>
              firstValueFrom(
                combineLatest([
                  terminal.effects.sterioAlbum(),
                  terminal.effects.sterioAlbumIds(),
                ]),
              ).then(([album, albumIds]) =>
                thru(
                  albumIds[
                    modulo(
                      Math.max(
                        Math.min(
                          albumIds.indexOf(album.youtubeMusicId) + step,
                          albumIds.length - 1,
                        ),
                        0,
                      ),
                      albumIds.length,
                    )
                  ],
                  async (albumId) => {
                    if (albumId != null) {
                      await store.actions.updateSterioAlbumId(albumId);
                    }
                  },
                ),
              ),
        ),
        updateSterioAlbum: action<EndoFunction<SterioAlbum>, void>(
          ({ api, terminal }) =>
            (patch) =>
              firstValueFrom(terminal.effects.sterioAlbum())
                .then((album) => api.actions.updateSterioAlbum(patch(album)))
                .then(property("data")),
        ),
        deleteSterioAlbum: action<void, void>(
          ({ store, api }) =>
            () =>
              firstValueFrom(store.effects.sterioAlbumId())
                .then((id) => api.actions.deleteSterioAlbum(id))
                .then(async ({ data }) => {
                  await store.actions.updateSterioAlbumId(nonNullable(data));
                }),
        ),
        compileSterioAlbums: action<boolean, string>(
          ({ api, terminal }) =>
            (out) =>
              firstValueFrom(terminal.effects.sterioAlbumIndex())
                .then((index) =>
                  api.actions.compileSterioAlbums({
                    limit: index + 1,
                    out,
                  }),
                )
                .then(property("data")),
        ),
        updateSterioPlaylist: action<
          { id: string; patch: EndoFunction<SterioPlaylist> },
          void
        >(
          ({ api, terminal }) =>
            ({ id, patch }) =>
              firstValueFrom(terminal.effects.sterioPlaylist(id))
                .then((playlist) =>
                  api.actions.updateSterioPlaylist(patch(playlist)),
                )
                .then(property("data")),
        ),
      }))
      .complete(),
  );
