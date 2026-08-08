import { envConfig, nonNullable, property } from "@cascateer/lib";
import { createTable } from "@cascateer/lib/database";
import { LazyPromise } from "@cascateer/lib/promise";
import { randomBytes } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { Credentials } from "google-auth-library";
import { google, youtube_v3 } from "googleapis";
import { StatusCodes } from "http-status-codes";
import {
  chunk,
  compact,
  Function1,
  intersectionWith,
  isEmpty,
  maxBy,
  tap,
  uniq,
} from "lodash";
import { Ora } from "ora";
import { defer, firstValueFrom, lastValueFrom, retry, Subject } from "rxjs";
import { openChrome } from "./lib";
import { DocumentFileTable } from "./tables";
import { YoutubePlaylist, YoutubeVideo } from "./types";

const {
  YOUTUBE_DATA_API_KEY,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REDIRECT_URI,
  YOUTUBE_GRANT_PATH = "youtube-grant.json",
} = envConfig();

export class YoutubeService {
  public static codes = new Subject<string>();

  private static readonly readGrant = () =>
    readFile(YOUTUBE_GRANT_PATH, "utf-8")
      .then<Credentials | null>(JSON.parse)
      .catch(() => null);

  private static readonly writeGrant = (grant: Credentials) =>
    writeFile(YOUTUBE_GRANT_PATH, JSON.stringify(grant, null, "\t")).then(
      () => grant,
    );

  private api = google.youtube("v3");
  private oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI,
  );

  private async codeGrantAuthorization(): Promise<Credentials> {
    return firstValueFrom(
      YoutubeService.codes.pipe(
        openChrome(
          tap(
            this.oauth2Client.generateAuthUrl({
              access_type: "offline",
              scope: ["https://www.googleapis.com/auth/youtube.force-ssl"],
              include_granted_scopes: true,
              state: randomBytes(20).toString("hex"),
              redirect_uri: YOUTUBE_REDIRECT_URI,
            }),
            (url) => {
              const { pathname, searchParams } = new URL(url);

              console.log(`${pathname}\n\t${[...searchParams].join("\n\t")}`);
            },
          ),
        ),
      ),
    ).then((code) =>
      this.oauth2Client
        .getToken(code)
        .then(({ tokens }) => YoutubeService.writeGrant(tokens)),
    );
  }

  private request<T>(predicate: Function1<youtube_v3.Youtube, Promise<T>>) {
    return defer(async () => {
      if (isEmpty(this.oauth2Client.credentials)) {
        const credentials = await YoutubeService.readGrant();

        if (credentials != null) {
          this.oauth2Client.setCredentials(credentials);
        } else {
          await this.codeGrantAuthorization();
        }
      }

      return predicate(this.api);
    }).pipe(
      retry({
        delay: (error, retryCount) => {
          if (error.status === StatusCodes.UNAUTHORIZED) {
            return defer(() => this.codeGrantAuthorization());
          }

          throw error;
        },
      }),
    );
  }

  private static YoutubeVideoTable = createTable<YoutubeVideo, "id">(
    "youtube-videos",
    "id",
    (ids) => new YoutubeService().getVideos(compact(ids)),
  );

  private static YoutubePlaylistTable = createTable<YoutubePlaylist, "id">(
    "youtube-playlists",
    "id",
    (ids) =>
      LazyPromise.concatAll(
        ids.map(
          (id) => new LazyPromise(() => new YoutubeService().getPlaylist(id)),
        ),
      ),
  );

  private async getPlaylist(id: string): Promise<YoutubePlaylist> {
    const getPlaylistItems = (
      playlistId: string,
      pageToken?: string,
    ): Promise<youtube_v3.Schema$PlaylistItem[]> =>
      this.api.playlistItems
        .list({
          auth: YOUTUBE_DATA_API_KEY,
          playlistId,
          part: ["contentDetails", "snippet"],
          fields:
            "items(id,contentDetails(videoId),snippet(title,position,description)),nextPageToken",
          pageToken,
          maxResults: 50,
        })
        .then(async ({ data: { items, nextPageToken } }) =>
          (items ?? []).concat(
            nextPageToken != null
              ? await getPlaylistItems(playlistId, nextPageToken)
              : [],
          ),
        );

    return this.api.playlists
      .list({
        auth: YOUTUBE_DATA_API_KEY,
        id: [id],
        part: ["snippet"],
        fields: "items(id,snippet(title,thumbnails))",
      })
      .then(({ data }) => nonNullable(data.items?.[0]))
      .then((playlist) => ({
        id: nonNullable(playlist.id),
        title: playlist.snippet?.title ?? void 0,
        thumbnails: playlist.snippet?.thumbnails,
      }))
      .then(({ id, title, thumbnails }) =>
        getPlaylistItems(id).then((items) => ({
          id,
          title,
          thumbnails,
          items,
        })),
      );
  }

  private async getVideos(ids: string[]): Promise<YoutubeVideo[]> {
    if (ids.length === 0) {
      return [];
    }

    const getVideos = (
      ids: string[],
      pageToken?: string,
    ): Promise<YoutubeVideo[]> =>
      this.api.videos
        .list({
          auth: YOUTUBE_DATA_API_KEY,
          id: ids,
          part: ["contentDetails", "snippet"],
          fields: "items(id,contentDetails,snippet),nextPageToken",
          pageToken,
          maxResults: 50,
        })
        .then(async ({ data: { items, nextPageToken } }) =>
          intersectionWith(
            (items ?? []).concat(
              nextPageToken != null ? await getVideos(ids, nextPageToken) : [],
            ),
            ids,
            (video, id) => video.id === id,
          ),
        );

    return chunk(uniq(ids), 50).reduce(
      (videos, idsChunk) =>
        videos.then((videos) =>
          getVideos(idsChunk).then((videosChunk) => videos.concat(videosChunk)),
        ),
      Promise.resolve(new Array<YoutubeVideo>()),
    );
  }

  get videos() {
    return new YoutubeService.YoutubeVideoTable();
  }

  get playlists() {
    return new YoutubeService.YoutubePlaylistTable();
  }

  private async search(
    query: { q?: string; channelId?: string },
    pageToken?: string,
  ): Promise<youtube_v3.Schema$SearchResult[]> {
    return this.api.search
      .list({
        auth: YOUTUBE_DATA_API_KEY,
        q: query.q,
        channelId: query.channelId,
        part: ["snippet"],
        fields: "items(id,snippet),nextPageToken",
        pageToken,
        maxResults: 50,
      })
      .then(async ({ data: { items, nextPageToken } }) =>
        (items ?? []).concat(
          nextPageToken != null ? await this.search(query, nextPageToken) : [],
        ),
      );
  }

  private async getThumbnail(
    thumbnails?: youtube_v3.Schema$ThumbnailDetails,
    spinner?: Ora,
  ) {
    const url = maxBy(
      compact(
        [
          "default" as const,
          "high" as const,
          "medium" as const,
          "standard" as const,
        ].map((key) => thumbnails?.[key]),
      ),
      property("height"),
    )?.url;

    if (url != null) {
      return new DocumentFileTable().getFile(url, spinner);
    }
  }

  public async getPlaylistThumbnail(playlistId: string, spinner?: Ora) {
    return this.playlists
      .getsertOne(playlistId)
      .then((playlist) => this.getThumbnail(playlist.thumbnails, spinner));
  }

  public async getVideoThumbnail(videoId: string, spinner?: Ora) {
    return this.videos
      .getsertOne(videoId)
      .then((video) => this.getThumbnail(video.snippet?.thumbnails, spinner));
  }

  public async createPlaylist({
    title,
    privacyStatus,
    templatePlaylistId,
  }: {
    title: string;
    privacyStatus?: "private" | "public" | "unlisted";
    templatePlaylistId?: string;
  }) {
    return lastValueFrom(
      this.request(async (api) => {
        const { data: playlist } = await api.playlists.insert({
          auth: this.oauth2Client,
          part: ["snippet", "status"],
          requestBody: {
            snippet: {
              title,
            },
            status: {
              privacyStatus,
            },
          },
        });

        if (templatePlaylistId != null) {
          const templatePlaylist =
            await this.playlists.getsertOne(templatePlaylistId);

          for (const playlistItem of templatePlaylist.items.toReversed()) {
            await api.playlistItems.insert({
              auth: this.oauth2Client,
              part: ["snippet"],
              requestBody: {
                snippet: {
                  playlistId: playlist.id,
                  resourceId: {
                    kind: "youtube#video",
                    videoId: playlistItem.contentDetails?.videoId,
                  },
                  position: 0,
                },
              },
            });
          }
        }

        return playlist;
      }),
    );
  }
}
