import { describe, expect, it, vi } from "vitest";
import type { LoadedContent } from "../src";
import { createRuntimeContentState } from "../src/content/runtime-state";

const content = (version: string): LoadedContent => ({
  childProfileId: "child-1",
  authentication: "AUTHENTICATED",
  manifest: {
    version,
    abilityLevel: 1,
    artifactUrl: `https://cdn.test/${version}.tar.gz`,
    sha256: "a".repeat(64),
    fileSize: 1,
    format: "tar+gzip",
    minClientVersion: "1.0.0",
    contentLevelRuleVersion: "content-level-v1",
    masteryRuleVersion: "mastery-v1",
    progressionRuleVersion: "progression-v1",
  },
  corpus: { characters: [], poems: [], idioms: [] },
  source: "CACHE",
});

describe("createRuntimeContentState", () => {
  it("activates startup content while idle", async () => {
    const loader = {
      load: vi.fn(async () => content("v2")),
      refreshAfterSession: vi.fn(),
    };
    const state = createRuntimeContentState(loader, content("v1"));
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);
    state.activateIfIdle(false);

    await state.bootstrap(null);
    unsubscribe();

    expect(state.getSnapshot()).toMatchObject({
      status: "ready",
      content: { manifest: { version: "v2" } },
      pending: null,
    });
    expect(listener).toHaveBeenCalled();
  });

  it("stages refreshed content until the active session becomes idle", async () => {
    const loader = {
      load: vi.fn(async () => content("v1")),
      refreshAfterSession: vi.fn(async () => content("v2")),
    };
    const state = createRuntimeContentState(loader, content("v1"));

    await state.refresh(() => ({ version: "v1", abilityLevel: 1 }));
    state.activateIfIdle(true);
    expect(state.getSnapshot()).toMatchObject({
      content: { manifest: { version: "v1" } },
      pending: { manifest: { version: "v2" } },
    });

    state.activateIfIdle(false);
    expect(state.getSnapshot()).toMatchObject({
      content: { manifest: { version: "v2" } },
      pending: null,
    });
  });

  it("restores content matching the active session pin", async () => {
    const pin = {
      childProfileId: "child-1",
      authentication: "AUTHENTICATED" as const,
      version: "v1",
      abilityLevel: 1 as const,
    };
    const loader = {
      load: vi.fn(async () => content("v1")),
      refreshAfterSession: vi.fn(),
    };
    const state = createRuntimeContentState(loader, content("bundled"));

    await state.bootstrap(() => pin);

    expect(loader.load).toHaveBeenCalledWith(pin);
    expect(state.getSnapshot()).toMatchObject({
      status: "ready",
      content: { manifest: { version: "v1", abilityLevel: 1 } },
      pending: null,
    });
  });

  it("keeps the trusted fallback and exposes retry after a load failure", async () => {
    const failure = new Error("offline");
    const loader = {
      load: vi.fn(async () => {
        throw failure;
      }),
      refreshAfterSession: vi.fn(),
    };
    const state = createRuntimeContentState(loader, content("bundled"));

    await state.bootstrap(null);

    expect(state.getSnapshot()).toEqual({
      status: "unavailable",
      content: content("bundled"),
      pending: null,
      error: failure,
    });
  });
});
