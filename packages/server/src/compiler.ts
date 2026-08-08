import { envConfig, nonNullable, property } from "@cascateer/lib";
import { LazyPromise } from "@cascateer/lib/promise";
import filenamify from "filenamify";
import { hashElement } from "folder-hash";
import { existsSync } from "fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "fs/promises";
import {
  compact,
  differenceBy,
  isString,
  keyBy,
  mapValues,
  reject,
  truncate,
} from "lodash";
import NodeID3 from "node-id3";
import { oraPromise } from "ora";
import { resolve } from "path";
import { SterioService } from "./Sterio.service";
import { SterioAlbumFull, SterioCompilerConfig } from "./types";
import { YoutubeMusicService } from "./YoutubeMusic.service";

const { COMPILER_OUT_URL } = envConfig();

const toOraPrefixText = ({
  icon,
  progress,
  text,
  textLength = 60,
}: {
  icon: string;
  progress: number;
  text: string;
  textLength?: number;
}) =>
  `[${icon} ${(progress * 100).toFixed().padStart(3, " ")}% ${truncate(text.padEnd(textLength, " "), { length: textLength })} ]`;

export const compile = async ({
  out = process.argv.includes("--out"),
  limit = process.argv
    .flatMap(
      (arg) => arg.match(/^--limit=(?<limit>\d+)/)?.groups?.["limit"] ?? [],
    )
    .map(Number)[0] ?? Infinity,
}: SterioCompilerConfig = {}) => {
  console.clear();

  const OUT_URL = resolve(__dirname, COMPILER_OUT_URL!);

  if (out && !existsSync(OUT_URL)) {
    await mkdir(OUT_URL);
  }

  const FOLDERS_URL = resolve(OUT_URL, "folders.json");

  type Folder = {
    sourceChecksum?: string;
    targetChecksum: string;
    targetPath: string;
  };

  const previousOutFolders = existsSync(FOLDERS_URL)
    ? await readFile(FOLDERS_URL, "utf-8").then<Folder[]>(JSON.parse)
    : [];

  const outFolders = new Array<Folder>();
  const dirFolders: Folder[] = await oraPromise(
    (spinner) =>
      readdir(OUT_URL, {
        withFileTypes: true,
      }).then((dirents) =>
        LazyPromise.concatAll(
          dirents
            .filter((dirent) => dirent.isDirectory())
            .map(
              (dirent, direntIndex, dirents) =>
                new LazyPromise(() => {
                  const targetPath = resolve(dirent.parentPath, dirent.name);

                  spinner.prefixText = toOraPrefixText({
                    icon: "🔍",
                    progress: direntIndex / dirents.length,
                    text: targetPath,
                  });

                  return hashElement(targetPath).then(({ hash }) => ({
                    targetChecksum: hash,
                    targetPath,
                  }));
                }),
            ),
        ),
      ),
    {
      text: "Scanning OUT directory...",
      successText: (folders) => `Found ${folders.length} folders.`,
    },
  );

  const restoredFolders = new Array<string>();
  const updatedFolders = new Array<string>();
  const addedFolders = new Array<string>();

  const albums = new Array<SterioAlbumFull>();
  const playlists = mapValues(
    keyBy(await new SterioService().playlists.getAll(), property("id")),
    (playlist) => ({
      playlist,
      items: new Array<string>(),
    }),
  );

  const sterioAlbums = reject(
    (await new SterioService().albums.getAll()).slice(0, limit),
    { draft: true },
  );

  for (const sterioAlbum of sterioAlbums) {
    const youtubeMusicAlbum = await new YoutubeMusicService().albums.getsertOne(
      sterioAlbum.youtubeMusicId,
    );

    albums.unshift(
      (
        await oraPromise(
          async (spinner) => {
            const {
              source,
              sourceChecksum,
              path: albumPath,
              files,
              playlistItems,
            } = await new SterioService().getAlbumFolder(
              sterioAlbum.youtubeMusicId,
              OUT_URL,
              spinner,
            );

            if (out) {
              for (const playlistId in playlistItems) {
                playlists[playlistId]?.items.push(
                  ...(playlistItems[playlistId] ?? []),
                );
              }

              const previousOutFolder = previousOutFolders.find(
                (folder) => folder.sourceChecksum === sourceChecksum,
              );

              if (previousOutFolder != null) {
                const dirFolder = dirFolders.find(
                  ({ targetChecksum }) =>
                    previousOutFolder.targetChecksum === targetChecksum,
                );

                if (dirFolder != null) {
                  const outFolder = previousOutFolder;

                  outFolders.push(outFolder);
                  restoredFolders.push(outFolder.targetPath);

                  return { source, path: albumPath };
                }
              }

              if (existsSync(albumPath)) {
                updatedFolders.push(albumPath);

                await rm(albumPath, { recursive: true });
              } else {
                addedFolders.push(albumPath);
              }

              await mkdir(albumPath, { recursive: true });

              for (const file of files) {
                await copyFile(file.sourcePath, file.targetPath).then(() =>
                  NodeID3.Promise.write(file.song.tags, file.targetPath),
                );
              }

              outFolders.push({
                sourceChecksum,
                targetChecksum: (await hashElement(albumPath)).hash,
                targetPath: albumPath,
              });
            }

            return { source, path: albumPath };
          },
          {
            text: `Processing...`,
            prefixText: toOraPrefixText({
              icon: "💿",
              progress: sterioAlbums.indexOf(sterioAlbum) / sterioAlbums.length,
              text: youtubeMusicAlbum.name,
            }),
            successText: ({ path }) =>
              compact([
                "Processed",
                restoredFolders.includes(path)
                  ? "(restored)"
                  : updatedFolders.includes(path)
                    ? "(updated)"
                    : addedFolders.includes(path)
                      ? "(added)"
                      : void 0,
              ]).join(" "),
          },
        )
      ).source,
    );
  }

  const discardedFolders = differenceBy(
    dirFolders,
    outFolders,
    property("targetPath"),
  );

  for (const folder of discardedFolders) {
    await rm(folder.targetPath, { recursive: true });
  }

  console.log(
    [
      {
        prefix: "➖ Discarded:",
        items: discardedFolders.map(property("targetPath")),
      },
      { prefix: "🟰  Restored:", items: restoredFolders, compact: true },
      { prefix: "➗ Updated:", items: updatedFolders },
      { prefix: "➕ Added:", items: addedFolders },
    ]
      .filter(({ items }) => items.length)
      .map(
        ({ prefix, items, compact }) =>
          `${prefix}\n\t${compact ? `${items.length} folder${items.length === 1 ? "" : "s"}` : items.join("\n\t") || "none"}`,
      )
      .join("\n"),
  );

  await writeFile(FOLDERS_URL, JSON.stringify(outFolders, null, "\t"));

  for (const file of await readdir(OUT_URL)) {
    if (file.endsWith(".m3u")) {
      await unlink(resolve(OUT_URL, file));
    }
  }

  return oraPromise(
    Promise.resolve(albums).then((albums) =>
      Promise.resolve({
        path: resolve(OUT_URL, "index.html"),
        html: `
                <!doctype html>
                <html lang="en">
                <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>STERI📀COLLECTION</title>
                    <style>
                        body {
                            background-color: black;
                        }
                        
                        table, tr, td {
                          border: 1px solid white;
                        }
        
                        table {
                          border-collapse: collapse;
                          white-space: break-spaces;
                        }
  
                        tr[data-row-index="0"] td {
                          background-color: grey
                        }
  
                        td {
                          color: white;
                          padding: 0.5em;
                        }

                        tr[data-row-hidden="true"] td[rowspan="1"] {
                          text-decoration: line-through;
                        }

                        tr[data-row-highlighted="true"] td[rowspan="1"] {
                          color: blue;
                        }
                    </style>
                </head>
                <body>
                    <table>
                        ${albums
                          .map((album) => ({
                            index: albums.indexOf(album) % 2,
                            rows: album.songs.map((song, hash) => ({
                              highlighted: song.patched,
                              columns: Object.entries({
                                albumArtwork: {
                                  content: `<img width="60" src="${song.artwork.album?.path}">`,
                                  hash: song.artwork.album?.checksum,
                                },
                                songArtwork: {
                                  content: `<figure><img width="60" src="${song.artwork.song?.path}"><figcaption></figcaption>${song.artwork.song?.checksum.slice(-7)}</figure>`,
                                  hash: song.artwork.song?.checksum,
                                },
                                channel: {
                                  content: song.channel?.title,
                                  hash: song.channel?.id,
                                },
                                trackNumber: song.tags.trackNumber,
                                title: song.tags.title,
                                duration: {
                                  content: song.duration?.toISOString(),
                                  hash,
                                },
                                album: [
                                  song.tags.album,
                                  album.youtubeMusicId,
                                ].join("\n"),
                                year: song.tags.year,
                                audioSourceUrl: {
                                  content: `<a target="_blank" href="${song.tags.audioSourceUrl}">${song.tags.audioSourceUrl != null ? new URL(song.tags.audioSourceUrl).searchParams.get("v") : ""}</a>`,
                                  hash: song.tags.audioSourceUrl,
                                },
                              }).flatMap(([key, column]) =>
                                column != null
                                  ? {
                                      key,
                                      ...(isString(column)
                                        ? {
                                            content: column,
                                            hash: column,
                                          }
                                        : column),
                                    }
                                  : [],
                              ),
                              included: song.included,
                            })),
                          }))
                          .flatMap((album) =>
                            album.rows.map(
                              (row, rowIndex, rows) =>
                                `<tr ${[`data-row-index="${album.index}"`, `data-row-hidden="${!row.included}"`, `data-row-highlighted="${row.highlighted}"`].join(" ")}>${row.columns
                                  .flatMap(({ key, content, hash }) => {
                                    if (
                                      rows
                                        .map((row) =>
                                          nonNullable(
                                            row.columns.find(
                                              (column) => column.key === key,
                                            ),
                                          ),
                                        )
                                        .every((column) => column.hash === hash)
                                    ) {
                                      if (rowIndex > 0) {
                                        return [];
                                      }

                                      return {
                                        rowSpan: rows.length,
                                        content,
                                      };
                                    }

                                    return { rowSpan: 1, content };
                                  })
                                  .map(
                                    ({ rowSpan, content }) =>
                                      `<td rowspan="${rowSpan}">${content}</td>`,
                                  )
                                  .join("\n")}</tr>`,
                            ),
                          )
                          .join("\n")}
                    </table>
                </body>
                </html>`,
      }).then(({ path, html }) =>
        writeFile(path, html).then(async () => {
          for (const { playlist, items } of Object.values(playlists)) {
            await writeFile(
              resolve(
                OUT_URL,
                filenamify(`${playlist.name}.m3u`, {
                  replacement: "",
                }),
              ),
              ["#EXTM3U", `#PLAYLIST:${playlist.name}`, ...items].join("\n\n"),
            );
          }

          return { path, html };
        }),
      ),
    ),
    {
      text: `Compiling...`,
      prefixText: "[📒 Summary]",
      successText: ({ path }) => `Written to ${path}.`,
    },
  );
};
