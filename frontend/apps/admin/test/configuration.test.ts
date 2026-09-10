// @vitest-environment node

import { readFileSync } from "node:fs";
import type { UserConfig } from "vite";
import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config";

describe("admin application configuration", () => {
  it("binds the development server to localhost", () => {
    expect((viteConfig as UserConfig).server?.host).toBe("127.0.0.1");
  });

  it("does not add tracking to admin typography", () => {
    const css = readFileSync(
      new URL("../src/styles.css", import.meta.url),
      "utf8",
    );
    const values = [...css.matchAll(/letter-spacing:\s*([^;]+);/g)].map(
      (match) => match[1]?.trim(),
    );

    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value === "0")).toBe(true);
  });
});
