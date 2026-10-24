// The pages: web/admin and web/app. Built to dist/, served by the Worker (wrangler.app.jsonc).
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { cpSync } from "node:fs";

export default defineConfig({
  root: "web",
  publicDir: resolve(__dirname, "public"),
  // the public site (site/) rides along in dist/site/: the Worker serves it at tcf.monster/ and /about
  plugins: [react(), { name: "public-site", closeBundle() { cpSync(resolve(__dirname, "site"), resolve(__dirname, "dist/site"), { recursive: true }); } }],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: { admin: resolve(__dirname, "web/admin/index.html"), app: resolve(__dirname, "web/app/index.html") } },
  },
  test: { root: __dirname, include: ["tests/**/*.test.ts"] },
});
