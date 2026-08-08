import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv("development", process.cwd()),
  },

  resolve: {
    alias: {
      "@cascateer/test": "/test",
    },
  },
}));
