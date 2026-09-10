import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@cc/content": pkg("../../content/src/index.ts"),
      "@cc/domain": pkg("../../packages/domain/src/index.ts"),
      "@cc/application": pkg("../../packages/application/src/index.ts"),
      "@cc/content-schema": pkg("../../packages/content-schema/src/index.ts"),
      "@cc/api-client": pkg("../../packages/api-client/src/index.ts"),
      "@cc/ui": pkg("../../packages/ui/src/index.ts"),
      "@tarojs/components": pkg("./src/taro-shim/components.tsx"),
    },
  },
  server: { port: 5173, host: true, open: false },
});
