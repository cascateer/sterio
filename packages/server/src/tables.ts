import { nonNullable } from "@cascateer/lib";
import { createFileTable, File } from "@cascateer/lib/database";
import { LazyPromise } from "@cascateer/lib/promise";
import { writeFile } from "fs/promises";
import { truncate, uniq } from "lodash";
import { extension } from "mime-types";
import objectHash from "object-hash";
import { resolve } from "path";
import { concat, defer, lastValueFrom, retry, timer, toArray } from "rxjs";
import { helpers, YtDlp } from "ytdlp-nodejs";
import { tapPromise } from "./lib";

const DocumentFileTable = createFileTable("document-files", (urls, spinner) =>
  LazyPromise.concatAll(
    uniq(urls).map(
      (url) =>
        new LazyPromise(() =>
          tapPromise(
            fetch(url).then((response) =>
              response.arrayBuffer().then((buffer) =>
                Promise.resolve(
                  new File(
                    [
                      objectHash(url),
                      extension(
                        nonNullable(response.headers.get("content-type")),
                      ),
                    ].join("."),
                  ),
                ).then((file) =>
                  writeFile(
                    file.path,
                    Buffer.from(buffer).toString("base64"),
                    "base64",
                  )
                    .then(() => file.hash())
                    .then((checksum) => ({
                      url,
                      name: file.name,
                      checksum,
                    })),
                ),
              ),
            ),
            {
              start: () => {
                if (spinner != null) {
                  spinner.text = truncate(`Loading document from ${url}.`, {
                    length: 50,
                  });
                }
              },
              finish: ({ name }) => {
                if (spinner != null) {
                  spinner.text = `Document written to ${new File(name)}.`;
                }
              },
            },
          ),
        ),
    ),
  ),
);

const StreamFileTable = createFileTable("stream-files", (urls, spinner) =>
  lastValueFrom(
    concat(
      ...uniq(urls).map((url) =>
        defer(() =>
          tapPromise(
            helpers.downloadFFmpeg().then(() =>
              new YtDlp()
                .checkInstallationAsync({ ffmpeg: true })
                .catch(() => helpers.downloadYtDlp())
                .then(() =>
                  new YtDlp()
                    .download(url, {
                      format: {
                        filter: "audioonly",
                        type: "mp3",
                      },
                      output: resolve(File.BASE_URL, "%(id)s.%(ext)s"),
                    })
                    .cookies(resolve("cookies.txt"))
                    .on("progress", ({ percentage }) => {
                      if (spinner != null && percentage != null) {
                        spinner.text = `Streaming from ${url} (${percentage.toFixed()}% completed).`;
                      }
                    }),
                )
                .then(({ filePaths: [path] }) =>
                  Promise.resolve(path).then(nonNullable).then(File.fromPath),
                )
                .then((file) =>
                  file.hash().then((checksum) => ({
                    url,
                    name: file.name,
                    checksum,
                  })),
                ),
            ),
            {
              start: () => {
                if (spinner != null) {
                  spinner.text = `Streaming from ${url}.`;
                }
              },
              finish: ({ name }) => {
                if (spinner != null) {
                  spinner.text = `Stream written to ${new File(name)}.`;
                }
              },
            },
          ),
        ).pipe(
          retry({
            delay(error, retryCount) {
              console.log(`Error streaming from ${url}: ${error}`);

              const mayRetryCount = 5;
              const delayMs = 5e3;

              if (retryCount < 5) {
                console.log(`Retrying in ${(delayMs / 1e3).toFixed()}s...`);

                return timer(delayMs);
              } else {
                console.log(`Giving up after ${mayRetryCount} retries...`);
              }

              throw error;
            },
          }),
        ),
      ),
    ).pipe(toArray()),
  ),
);

export { DocumentFileTable, StreamFileTable };
