import { Enumerator, property } from "@cascateer/lib";
import {
  SpotifyAlbumResponse,
  YoutubeMusicAlbumResponse,
  YoutubeMusicArtistResponse,
  YoutubeMusicSongResponse,
  YoutubePlaylist,
} from "@cascateer/sterio-server/api";
import { pull, uniq, without } from "lodash";
import { combineLatest, map, startWith } from "rxjs";
import { Input } from "../../../components/Input/component";
import { QuerySelect } from "../../../components/QuerySelect/component";
import { sterioSlice } from "../slice";

export const ImportComponent = sterioSlice
  .createComponent("import")
  .withStyles(import("./styles.module.scss"), import("./styles.scss?inline"))
  .withTemplate((ctx, classNames) => () => (
    <>
      <div
        style={{
          display: "flex",
          width: "200px",
          justifyContent: "space-around",
          fontSize: "xx-large",
        }}
      >
        <button onClick={() => ctx.terminal.actions.stepSterioAlbum(-Infinity)}>
          &lt;&lt;
        </button>
        <button onClick={() => ctx.terminal.actions.stepSterioAlbum(-1)}>
          &lt;
        </button>
        <div>
          {ctx.terminal.effects
            .sterioAlbumIndex()
            .pipe(map((index) => index + 1))}{" "}
          /
          {ctx.terminal.effects
            .sterioAlbumIds()
            .pipe(map(({ length }) => length))}
        </div>
        <button onClick={() => ctx.terminal.actions.stepSterioAlbum(+1)}>
          &gt;
        </button>
        <button onClick={() => ctx.terminal.actions.stepSterioAlbum(+Infinity)}>
          &gt;&gt;
        </button>
        <button
          onClick={() =>
            confirm("Start compiling?") &&
            ctx.terminal.actions.compileSterioAlbums(true)
          }
        >
          COMPILE
        </button>
        <>
          {ctx.terminal.effects.sterioAlbum().pipe(
            map((album) => (
              <button
                style={{ backgroundColor: album.draft ? "blue" : "white" }}
                onClick={() =>
                  ctx.terminal.actions.updateSterioAlbum((album) => ({
                    ...album,
                    draft: !album.draft,
                  }))
                }
              >
                {album.draft ? "Remove draft mark" : "Mark as draft"}
              </button>
            )),
          )}
        </>
        <button
          style={{ backgroundColor: "red" }}
          onClick={() =>
            confirm("Delete album?") && ctx.terminal.actions.deleteSterioAlbum()
          }
        >
          Delete
        </button>
      </div>
      <div className={classNames.importColumns}>
        <div className={classNames.importColumn}>
          <h4>YoutubeMusic*</h4>
          <Input
            name="sterio-album-id"
            value={ctx.store.effects.sterioAlbumId()}
            onChange={ctx.store.actions.updateSterioAlbumId}
          />
          <QuerySelect
            placeholder="Search artists..."
            options={ctx.terminal.effects.youtubeMusicArtists}
            selectedValue={ctx.store.effects.youtubeMusicArtistId()}
            name="youtube-music-artist-id"
            enumerator={
              new Enumerator<YoutubeMusicArtistResponse[]>(property("artistId"))
            }
            text={
              new Enumerator<YoutubeMusicArtistResponse[]>(
                (artist) => artist.name,
              )
            }
            onChange={({ artistId }) =>
              ctx.store.actions.updateYoutubeMusicArtistId(artistId)
            }
          />
          <QuerySelect<YoutubeMusicSongResponse[]>
            placeholder="Search artist songs..."
            options={(query) =>
              ctx.terminal.effects.youtubeMusicArtistSongs().pipe(
                map((songs) =>
                  songs.filter((song) => {
                    if (!query) {
                      return true;
                    }

                    try {
                      return new RegExp(query, "i").test(song.name);
                    } catch {}
                  }),
                ),
              )
            }
            selectedValue={ctx.store.effects.youtubeMusicVideoId()}
            name="youtube-music-artist-video-id"
            enumerator={new Enumerator(property("videoId"))}
            text={
              new Enumerator(
                (song) =>
                  `${song.isSaved ? "☑" : "☐"} ${song.artist.name} / ${song.album?.name} / ${song.name}`,
              )
            }
            onChange={({ videoId, album }) => {
              ctx.store.actions.updateYoutubeMusicVideoId(videoId);

              if (album?.albumId != null) {
                ctx.store.actions.updateSterioAlbumId(album.albumId);
              }
            }}
          />

          <QuerySelect
            placeholder="Search albums..."
            options={ctx.terminal.effects.youtubeMusicAlbums}
            selectedValue={ctx.terminal.effects
              .sterioAlbum()
              .pipe(map(property("youtubeMusicId")))}
            name="youtube-music-album-resource-id"
            enumerator={
              new Enumerator<YoutubeMusicAlbumResponse[]>(property("albumId"))
            }
            text={
              new Enumerator<YoutubeMusicAlbumResponse[]>(
                (album) =>
                  `${album.isSaved ? "☑" : "☐"} ${album.name} / ${album.artist.name} (${album.year})`,
              )
            }
            onChange={({ albumId }) =>
              ctx.store.actions.updateSterioAlbumId(albumId)
            }
          />
          <Input
            name="youtube-music-album-resource-iteratee"
            placeholder="iteratee"
            value={ctx.terminal.effects
              .sterioAlbum()
              .pipe(map(property("youtubeMusicIteratee")))}
            onChange={(iteratee) =>
              ctx.terminal.actions.updateSterioAlbum((album) => ({
                ...album,
                youtubeMusicIteratee: iteratee,
              }))
            }
          />
        </div>
        <div className={classNames.importColumn}>
          <h4>Youtube</h4>
          <QuerySelect
            placeholder="Enter playlist ID or URL..."
            onQueryChange={ctx.store.actions.addYoutubePlaylistQuery}
            options={() => ctx.terminal.effects.youtubePlaylists()}
            selectedValue={ctx.terminal.effects
              .sterioAlbum()
              .pipe(map(property("youtubeId")))}
            name="youtube-album-resource-id"
            enumerator={new Enumerator<YoutubePlaylist[]>(property("id"))}
            text={
              new Enumerator<YoutubePlaylist[]>(
                (playlist) => playlist.title ?? playlist.id,
              )
            }
            onChange={({ id }) =>
              ctx.terminal.actions.updateSterioAlbum((album) => ({
                ...album,
                youtubeId: id,
              }))
            }
          />
          <Input
            name="youtube-album-resource-iteratee"
            placeholder="iteratee"
            value={ctx.terminal.effects
              .sterioAlbum()
              .pipe(map(property("youtubeIteratee")))}
            onChange={(iteratee) =>
              ctx.terminal.actions.updateSterioAlbum((album) => ({
                ...album,
                youtubeIteratee: iteratee,
              }))
            }
          />
        </div>
        <div className={classNames.importColumn}>
          <h4>Spotify</h4>
          <QuerySelect
            placeholder="Search albums..."
            options={ctx.terminal.effects.spotifyAlbums}
            selectedValue={ctx.terminal.effects
              .sterioAlbum()
              .pipe(map(property("spotifyId")))}
            name="spotify-album-resource-id"
            enumerator={new Enumerator<SpotifyAlbumResponse[]>(property("id"))}
            text={
              new Enumerator<SpotifyAlbumResponse[]>(
                (album) =>
                  `${album.artists.map(property("name")).join(", ")} - ${album.name} (${album.release_date.slice(0, 4)})`,
              )
            }
            onChange={({ id }) =>
              ctx.terminal.actions.updateSterioAlbum((album) => ({
                ...album,
                spotifyId: id,
              }))
            }
          />
          <Input
            name="spotify-album-resource-iteratee"
            placeholder="iteratee"
            value={ctx.terminal.effects
              .sterioAlbum()
              .pipe(map(property("spotifyIteratee")))}
            onChange={(iteratee) =>
              ctx.terminal.actions.updateSterioAlbum((album) => ({
                ...album,
                spotifyIteratee: iteratee,
              }))
            }
          />
        </div>
        <div className={classNames.importColumn}>
          <table>
            {combineLatest([
              ctx.terminal.effects.sterioAlbumSongs().pipe(startWith([])),
              ctx.terminal.effects.sterioAlbumSongs().pending,
            ]).pipe(
              map(([songs, songsPending]) =>
                songsPending ? (
                  <div>...</div>
                ) : (
                  songs
                    .map((song) => (
                      <tr
                        style={{ color: song.patched ? "orange" : "inherit" }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={song.included}
                            onClick={() =>
                              ctx.terminal.actions.updateSterioAlbum(
                                (album) => ({
                                  ...album,
                                  songs:
                                    album.songs == null
                                      ? [song.index]
                                      : without(album.songs, song.index).concat(
                                          song.included ? [] : song.index,
                                        ),
                                }),
                              )
                            }
                          />
                        </td>
                        <td>{song.tags.trackNumber}</td>
                        <td>{song.tags.title}</td>
                        <td>
                          <div style={{ display: "flex" }}>
                            {ctx.terminal.effects.sterioPlaylists().pipe(
                              map((playlists) =>
                                playlists.map((playlist) => {
                                  const included = playlist.items?.[
                                    song.youtubeMusicId
                                  ]?.includes(song.index);

                                  return (
                                    <div
                                      style={{
                                        opacity: included ? 1 : 0.5,
                                        cursor: "pointer",
                                        padding: "0 1em",
                                      }}
                                      onClick={() =>
                                        ctx.terminal.actions.updateSterioPlaylist(
                                          {
                                            id: playlist.id,
                                            patch: (playlist) => ({
                                              ...playlist,
                                              items: {
                                                ...playlist.items,
                                                [song.youtubeMusicId]: included
                                                  ? pull(
                                                      playlist.items?.[
                                                        song.youtubeMusicId
                                                      ] ?? [],
                                                      song.index,
                                                    )
                                                  : uniq(
                                                      (
                                                        playlist.items?.[
                                                          song.youtubeMusicId
                                                        ] ?? []
                                                      ).concat(song.index),
                                                    ),
                                              },
                                            }),
                                          },
                                        )
                                      }
                                    >
                                      {playlist.name}
                                    </div>
                                  );
                                }),
                              ),
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                    .concat(
                      <tr>
                        <button
                          onClick={() =>
                            ctx.terminal.actions.updateSterioAlbum((album) => ({
                              ...album,
                              songs: void 0,
                            }))
                          }
                        >
                          Reset
                        </button>
                      </tr>,
                    )
                ),
              ),
            )}
          </table>
        </div>
      </div>
      <p>
        {ctx.terminal.effects
          .sterioAlbumResourceConflicts()
          .pipe(
            map(
              (html) =>
                new DOMParser().parseFromString(html, "text/html").body
                  .firstChild,
            ),
          )}
      </p>
    </>
  ));
