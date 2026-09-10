import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@cc/api-client": pkg("../../packages/api-client/src/index.ts"),
      "@cc/content-schema": pkg("../../packages/content-schema/src/index.ts"),
      "@cc/ui/tokens": pkg("../../packages/ui/src/tokens.ts"),
    },
  },
  server: {
    port: 5174,
    host: "127.0.0.1",
    open: false,
    proxy: {
      "/v1": "http://127.0.0.1:8081",
      "/actuator": "http://127.0.0.1:8081",
    },
  },
});
