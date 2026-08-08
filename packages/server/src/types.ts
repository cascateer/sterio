import { youtube_v3 } from "googleapis";
import { Dictionary } from "lodash";
import { Tags } from "node-id3";
import SpotifyWebApi from "spotify-web-api-node";
import { AlbumFull } from "ytmusic-api";

export interface ApiResponse<Result> {
  data: Result;
  tags?: string[];
  invalidatesTags?: string[];
}

export type SpotifyGrant = Partial<
  Awaited<ReturnType<SpotifyWebApi["authorizationCodeGrant"]>>["body"]
>;

export type SpotifyAlbum = SpotifyApi.AlbumObjectFull;

export interface SpotifyAlbumResponse {
  id: string;
  name: string;
  artists: SpotifyApi.ArtistObjectSimplified[];
  release_date: string;
}

export class SterioDuration {
  constructor(
    public minutes: number,
    public seconds: number,
  ) {}

  get totalSeconds(): number {
    return this.minutes * 60 + this.seconds;
  }

  get totalMilliseconds(): number {
    return this.totalSeconds * 1e3;
  }

  toISOString() {
    return [this.minutes, this.seconds]
      .map((t) => t.toString().padStart(2, "0"))
      .join(":");
  }

  static fromPeriodOfTime(duration?: string | null) {
    const { minutes, seconds } =
      duration?.match(/^PT(?:(?<minutes>\d+)M)?(?:(?<seconds>\d+)S)?$/)
        ?.groups ?? {};

    if (minutes != null || seconds != null) {
      return new SterioDuration(+(minutes ?? 0), +(seconds ?? 0));
    }
  }
}

export interface SterioAlbumResource {
  id: string;
  iteratee?: string;
}

export interface SterioAlbumResourcesFull extends Record<
  "youtubeMusic" | "youtube" | "spotify",
  SterioAlbumResource
> {}

export type SterioAlbumResources = Partial<SterioAlbumResourcesFull>;

export interface SterioAlbumResourcesTable extends Record<
  keyof SterioAlbumResourcesFull,
  string[]
> {}

export interface SterioAlbum {
  youtubeMusicId: string;
  youtubeMusicIteratee?: string;
  youtubeId?: string;
  youtubeIteratee?: string;
  spotifyId?: string;
  spotifyIteratee?: string;
  songs?: number[];
  draft?: boolean;
}

export interface SterioAlbumFull
  extends
    Pick<SterioAlbum, "youtubeMusicId" | "youtubeId" | "spotifyId">,
    Pick<
      YoutubeMusicAlbum,
      "artist" | "name" | "playlistId" | "thumbnails" | "year"
    > {
  songs: SterioSongFull[];
}

export interface SterioSongFull {
  youtubeMusicId: string;
  index: number;
  videoId: string;
  patched: boolean;
  included: boolean;
  channel?: {
    id?: string;
    title?: string;
  };
  artwork: Partial<
    Record<
      "album" | "song",
      {
        path: string;
        checksum: string;
      }
    >
  >;
  duration?: SterioDuration;
  tags: Tags;
  playlists: Pick<SterioPlaylist, "id" | "name">[];
}

export interface SterioCompilerConfig {
  out?: boolean;
  limit?: number;
}

export interface SterioPlaylist {
  id: string;
  name?: string;
  items?: Dictionary<number[]>;
}

export type YoutubeMusicAlbum = Pick<
  AlbumFull,
  "albumId" | "artist" | "name" | "playlistId" | "songs" | "thumbnails" | "year"
>;

export interface YoutubeMusicAlbumResponse {
  albumId: string;
  artist: {
    artistId: string | null;
    name: string;
  };
  name: string;
  year: number | null;
  isSaved: boolean;
}

export interface YoutubeMusicArtistResponse {
  artistId: string;
  name: string;
}

export interface YoutubeMusicSongResponse {
  videoId: string;
  name: string;
  album: {
    name: string;
    albumId: string;
  } | null;
  artist: {
    artistId: string | null;
    name: string;
  };
  isSaved: boolean;
}

export interface YoutubePlaylist {
  id: string;
  title?: string;
  thumbnails?: youtube_v3.Schema$ThumbnailDetails;
  items: youtube_v3.Schema$PlaylistItem[];
}

export type YoutubeVideo = youtube_v3.Schema$Video;
