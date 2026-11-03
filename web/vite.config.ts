import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 開発中は /api を wrangler dev（npm run dev:worker）へ渡す。動いていなければ固定の進行になる
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  test: {
    environment: "node",
  },
});
