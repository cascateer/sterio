import { envConfig, nonNullable, property } from "@cascateer/lib";
import { createTable } from "@cascateer/lib/database";
import { LazyPromise } from "@cascateer/lib/promise";
import { google, youtube_v3 } from "googleapis";
import { chunk, compact, intersectionWith, maxBy, uniq } from "lodash";
import { Ora } from "ora";
import { DocumentFileTable } from "./tables";
import { YoutubePlaylist, YoutubeVideo } from "./types";

const { YOUTUBE_DATA_API_KEY } = envConfig();

export class YoutubeService {
  private api = google.youtube("v3");

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
}
