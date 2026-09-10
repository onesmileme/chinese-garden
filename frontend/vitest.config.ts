import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@cc/ui/tokens": new URL(
        "./packages/ui/src/tokens.ts",
        import.meta.url,
      ).pathname,
      "@tarojs/taro": new URL(
        "./apps/miniapp/__mocks__/taro.ts",
        import.meta.url,
      ).pathname,
      "@tarojs/components": new URL(
        "./apps/playground/src/taro-shim/components.tsx",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.{ts,tsx}",
      "content/test/**/*.test.ts",
      "apps/*/test/**/*.test.{ts,tsx}",
    ],
    environmentMatchGlobs: [
      ["packages/ui/**", "happy-dom"],
      ["apps/admin/**", "happy-dom"],
    ],
    coverage: {
      provider: "v8",
      include: [
        "packages/*/src/**/*.{ts,tsx}",
        "content/src/**/*.ts",
        "apps/admin/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "packages/*/src/index.ts",
        "packages/content-cli/src/bin.ts",
        "packages/content-cli/src/adapters/**",
        "apps/admin/src/main.tsx",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
