/// <reference types="vitest/config" />
import { defineConfig } from "vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // 単体テスト（仕様 15.1、15.4、17.5）
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // 計測対象はロジック層のみ。render・platform・main は手動確認で検証する（15.4）
      include: ["src/core/**"],
      // json-summary は scripts/check-coverage.mjs が読む。未達は警告のみのため thresholds は設定しない（15.4）
      reporter: ["text", "html", "json-summary"],
    },
  },
}));
