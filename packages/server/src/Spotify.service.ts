import { AsyncEndoFunction, envConfig } from "@cascateer/lib";
import { createTable } from "@cascateer/lib/database";
import { LazyPromise } from "@cascateer/lib/promise";
import { readFile, writeFile } from "fs/promises";
import { StatusCodes } from "http-status-codes";
import { isObject, maxBy, property, thru } from "lodash";
import { Ora } from "ora";
import { firstValueFrom, Subject, UnaryFunction } from "rxjs";
import SpotifyWebApi from "spotify-web-api-node";
import { v4 } from "uuid";
import { chainFunctions, openChrome, tapPromise } from "./lib";
import { DocumentFileTable } from "./tables";
import { SpotifyAlbum, SpotifyGrant } from "./types";

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_GRANT_PATH = "spotify-grant.json",
} = envConfig();

export class SpotifyService {
  public static codes = new Subject<string>();

  private static readonly readGrant = () =>
    readFile(SPOTIFY_GRANT_PATH, "utf-8")
      .then<SpotifyGrant | null>(JSON.parse)
      .catch(() => null);

  private static readonly writeGrant = (grant: SpotifyGrant) =>
    writeFile(SPOTIFY_GRANT_PATH, JSON.stringify(grant, null, "\t")).then(
      () => grant,
    );

  private static SpotifyAlbumTable = createTable<SpotifyAlbum, "id">(
    "spotify-albums",
    "id",
    (ids) => new SpotifyService().getAlbums(ids),
  );

  private static lock = new Subject<AsyncEndoFunction<SpotifyWebApi>>();

  static {
    this.lock
      .pipe(
        chainFunctions(() =>
          this.readGrant().then(
            (grant) =>
              new SpotifyWebApi({
                clientId: SPOTIFY_CLIENT_ID,
                clientSecret: SPOTIFY_CLIENT_SECRET,
                redirectUri: SPOTIFY_REDIRECT_URI,
                accessToken: grant?.access_token,
                refreshToken: grant?.refresh_token,
              }),
          ),
        ),
      )
      .subscribe();
  }

  private async chain(
    predicate: AsyncEndoFunction<SpotifyWebApi>,
  ): Promise<SpotifyWebApi> {
    return new Promise<SpotifyWebApi>((finish) =>
      SpotifyService.lock.next((api) =>
        tapPromise(Promise.resolve(predicate(api)), { finish }),
      ),
    );
  }

  private async refreshAccessToken() {
    return new Promise<SpotifyWebApi>((resolve) => {
      void this.chain((api) =>
        api
          .refreshAccessToken()
          .then(async ({ body: grant }) => {
            await SpotifyService.writeGrant(grant);

            api.setAccessToken(grant.access_token);

            if (grant.refresh_token != null) {
              api.setRefreshToken(grant.refresh_token);
            }

            return api;
          })
          .catch((error) => {
            console.log(error);

            void this.codeGrantAuthorization().then(resolve);

            return api;
          }),
      );
    });
  }

  private async codeGrantAuthorization(): Promise<SpotifyWebApi> {
    return this.chain((api) =>
      firstValueFrom(
        SpotifyService.codes.pipe(
          openChrome(
            api.createAuthorizeURL(
              /**
               * https://developer.spotify.com/documentation/web-api/concepts/scopes
               */
              ["user-library-read", "user-read-email", "user-read-private"],
              v4(),
            ),
          ),
        ),
      ).then((code) =>
        api.authorizationCodeGrant(code).then(async ({ body: grant }) => {
          await SpotifyService.writeGrant(grant);

          api.setAccessToken(grant.access_token);
          api.setRefreshToken(grant.refresh_token);

          return api;
        }),
      ),
    );
  }

  private async request<T>(
    predicate: UnaryFunction<SpotifyWebApi, Promise<T>>,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      void this.chain((api) =>
        predicate(api)
          .then(resolve)
          .catch((error) => {
            if (
              isObject(error) &&
              "statusCode" in error &&
              error.statusCode === StatusCodes.UNAUTHORIZED
            ) {
              void (api.getRefreshToken() != null
                ? this.refreshAccessToken()
                : this.codeGrantAuthorization());

              void this.request(predicate).then(resolve);

              return;
            }

            throw error;
          })
          .then(() => api),
      );
    });
  }

  private async getAlbums(ids: string[]): Promise<SpotifyAlbum[]> {
    return this.request((api) =>
      LazyPromise.concatAll(
        ids.map(
          (id) =>
            new LazyPromise(() =>
              api.getAlbum(id).then(async ({ body }) => {
                let next = body.tracks.next;

                while (next != null) {
                  const { body: tracks } = await api.getAlbumTracks(id, {
                    offset: thru(
                      new URL(next).searchParams.get("offset"),
                      (offset) => {
                        if (offset != null) {
                          return +offset;
                        }
                      },
                    ),
                  });

                  next = tracks.next;
                  body.tracks.items.push(...tracks.items);
                }

                return body;
              }),
            ),
        ),
      ),
    );
  }

  get albums() {
    return new SpotifyService.SpotifyAlbumTable();
  }

  public async searchAlbums(
    query: string,
    maxResults = Infinity,
  ): Promise<SpotifyApi.AlbumObjectSimplified[]> {
    return query
      ? this.request((api) => {
          const searchAlbums = (
            query: string,
            offset?: number,
          ): Promise<SpotifyApi.AlbumObjectSimplified[]> =>
            api
              .searchAlbums(query, { limit: 10, offset })
              .then(async ({ body }) => {
                const nextOffset = thru(body.albums?.next, (next) => {
                  if (next != null) {
                    return new URL(next).searchParams.get("offset");
                  }
                });

                return (body.albums?.items ?? []).concat(
                  nextOffset != null && +nextOffset < maxResults
                    ? await searchAlbums(query, +nextOffset)
                    : [],
                );
              });

          return searchAlbums(query);
        })
      : [];
  }

  public async getThumbnail(id: string, spinner?: Ora) {
    return this.albums
      .getsertOne(id)
      .then((album) => maxBy(album.images, property("height"))?.url)
      .then((url) => {
        if (url != null) {
          return new DocumentFileTable().getFile(url, spinner);
        }
      });
  }
}
