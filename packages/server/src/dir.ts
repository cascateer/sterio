import { envConfig } from "@cascateer/lib";
import { readdir, unlink } from "fs/promises";
import { resolve } from "path";

const { COMPILER_OUT_URL } = envConfig();

const OUT_URL = resolve("c:\\Users\\aak\\repos\\out");

(async function () {
  for (const file of await readdir(OUT_URL)) {
    if (file.endsWith(".m3u")) {
      await unlink(resolve(OUT_URL, file));
    }
  }
})();
