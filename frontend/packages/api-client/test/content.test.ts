import { describe, expect, it, vi } from "vitest";
import { createContentClient } from "../src/content";
import type { HttpClient } from "../src/http";

describe("createContentClient", () => {
  it("requests the manifest with the child profile header", async () => {
    const get = vi.fn(async () => ({
      version: "corpus-v6",
      abilityLevel: 2,
      artifactUrl: "https://cdn.test/L2.tar.gz",
      sha256: "a".repeat(64),
      fileSize: 100,
      format: "tar+gzip",
      minClientVersion: "1.0.0",
      contentLevelRuleVersion: "content-level-v1",
      masteryRuleVersion: "mastery-v1",
      progressionRuleVersion: "progression-v1",
    }));
    const http = { get, post: vi.fn() } as HttpClient;

    const manifest = await createContentClient(http).manifest("child-1");

    expect(manifest.abilityLevel).toBe(2);
    expect(get).toHaveBeenCalledWith("/v1/content/manifest", {
      "X-Child-Profile-Id": "child-1",
    });
  });

  it("rejects a blank child profile before requesting", async () => {
    const get = vi.fn();
    const http = { get, post: vi.fn() } as HttpClient;

    await expect(createContentClient(http).manifest(" ")).rejects.toThrow(
      "childProfileId must not be blank",
    );

    expect(get).not.toHaveBeenCalled();
  });
});
