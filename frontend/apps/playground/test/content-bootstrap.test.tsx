// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createSessionState,
  type ContentLoader,
  type LoadedContent,
  type SnapshotStorage,
} from "@cc/application";
import { challengeContent } from "@cc/content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RuntimeContentProvider,
  useRuntimeContentState,
} from "../src/content/runtime";

let root: Root;
let container: HTMLDivElement;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function content(version: string): LoadedContent {
  return {
    childProfileId: "child-web",
    authentication: "AUTHENTICATED",
    manifest: {
      version,
      abilityLevel: 2,
      artifactUrl: `https://cdn.test/${version}.tar.gz`,
      sha256: "b".repeat(64),
      fileSize: 1,
      format: "tar+gzip",
      minClientVersion: "1.0.0",
      contentLevelRuleVersion: "content-level-v1",
      masteryRuleVersion: "mastery-v1",
      progressionRuleVersion: "progression-v1",
    },
    corpus: challengeContent.corpus,
    source: "CACHE",
  };
}

function memoryStorage(): SnapshotStorage {
  const values = new Map<string, unknown>();
  return {
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

function Probe() {
  const runtime = useRuntimeContentState()!;
  return (
    <button type="button" onClick={() => void runtime.stageRefresh()}>
      {runtime.content.manifest.version}
    </button>
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("playground runtime content bootstrap", () => {
  it("loads at startup and activates a later refresh while idle", async () => {
    const state = createSessionState({
      storage: memoryStorage(),
      contentVersion: "bundled-corpus-v5-L1",
      ruleVersion: "mastery-v1",
    });
    const loader: ContentLoader = {
      load: vi.fn(async () => content("corpus-v6")),
      refreshAfterSession: vi.fn(async () => content("corpus-v7")),
    };

    await act(async () => {
      root.render(
        <RuntimeContentProvider loader={loader} state={state}>
          <Probe />
        </RuntimeContentProvider>,
      );
    });
    expect(container.textContent).toBe("corpus-v6");

    await act(async () => {
      (container.firstElementChild as HTMLButtonElement).click();
    });
    expect(container.textContent).toBe("corpus-v7");
  });
});
