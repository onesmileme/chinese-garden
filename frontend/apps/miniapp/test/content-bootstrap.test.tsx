// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  contentSelectionOf,
  createSessionState,
  type ContentLoader,
  type LoadedContent,
  type SnapshotStorage,
} from "@cc/application";
import { challengeContent } from "@cc/content";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  RuntimeContentProvider,
  useRuntimeContentState,
} from "../src/content/runtime";

let root: Root;
let container: HTMLDivElement;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const loaded = (version: string): LoadedContent => ({
  childProfileId: "child-1",
  authentication: "AUTHENTICATED",
  manifest: {
    version,
    abilityLevel: 2,
    artifactUrl: `https://cdn.test/${version}.tar.gz`,
    sha256: "a".repeat(64),
    fileSize: 1,
    format: "tar+gzip",
    minClientVersion: "1.0.0",
    contentLevelRuleVersion: "content-level-v1",
    masteryRuleVersion: "mastery-v1",
    progressionRuleVersion: "progression-v1",
  },
  corpus: challengeContent.corpus,
  source: "REMOTE",
});

const storage = (): SnapshotStorage => {
  const values = new Map<string, unknown>();
  return {
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
};

function Probe() {
  const runtime = useRuntimeContentState()!;
  return (
    <button
      data-status={runtime.status}
      onClick={() => void runtime.stageRefresh()}
    >
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

describe("miniapp runtime content bootstrap", () => {
  it("activates loaded content while no session is active", async () => {
    const state = createSessionState({
      storage: storage(),
      contentVersion: "bundled-corpus-v5-L1",
      ruleVersion: "mastery-v1",
    });
    const loader: ContentLoader = {
      load: vi.fn(async () => loaded("corpus-v6")),
      refreshAfterSession: vi.fn(),
    };

    await act(async () => {
      root.render(
        <RuntimeContentProvider loader={loader} state={state}>
          <Probe />
        </RuntimeContentProvider>,
      );
    });

    expect(container.textContent).toBe("corpus-v6");
    expect(container.firstElementChild?.getAttribute("data-status")).toBe(
      "ready",
    );
  });

  it("holds new content until the active session is cleared", async () => {
    const state = createSessionState({
      storage: storage(),
      contentVersion: "corpus-v5",
      ruleVersion: "mastery-v1",
    });
    const pinned = loaded("corpus-v5");
    state.setActiveDaily({
      session: {
        sessionId: "daily-1",
        levels: [],
        contentVersion: "corpus-v5",
        ruleVersion: "mastery-v1",
      },
      currentIndex: 0,
      firstAttemptOutcomes: [],
      contentVersion: "corpus-v5",
      contentSelection: contentSelectionOf(pinned),
      ruleVersion: "mastery-v1",
      updatedAt: 1,
    });
    const loader: ContentLoader = {
      load: vi.fn(async () => pinned),
      refreshAfterSession: vi.fn(async () => loaded("corpus-v6")),
    };

    await act(async () => {
      root.render(
        <RuntimeContentProvider loader={loader} state={state}>
          <Probe />
        </RuntimeContentProvider>,
      );
    });
    expect(container.textContent).toBe("corpus-v5");
    expect(loader.load).toHaveBeenCalledWith(contentSelectionOf(pinned));

    await act(async () => {
      (container.firstElementChild as HTMLButtonElement).click();
    });
    expect(container.textContent).toBe("corpus-v5");

    act(() => state.clearDailyProgress());
    expect(container.textContent).toBe("corpus-v6");
  });
});
