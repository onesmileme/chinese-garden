import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  contentSelectionOf,
  createContentLoader,
  createRuntimeContentState,
  type ContentLoader,
  type ContentSelection,
  type LoadedContent,
  type RuntimeContentSnapshot,
  type SessionState,
} from "@cc/application";
import { challengeContent } from "@cc/content";
import { corpusAtOrBelow } from "@cc/domain";
import { sessionState } from "../session-state";
import { createBrowserContentDeps } from "./adapters";

const bundledL1Content: LoadedContent = {
  childProfileId: "guest-bootstrap",
  authentication: "GUEST",
  manifest: {
    version: "bundled-corpus-v5-L1",
    abilityLevel: 1,
    artifactUrl: "https://bundled.invalid/content.tar.gz",
    sha256: "0".repeat(64),
    fileSize: 1,
    format: "tar+gzip",
    minClientVersion: "0.0.0",
    contentLevelRuleVersion: "content-level-v1",
    masteryRuleVersion: "mastery-v1",
    progressionRuleVersion: "progression-v1",
  },
  corpus: corpusAtOrBelow(challengeContent.corpus, 1),
  source: "BUNDLED",
};

const standaloneContent: LoadedContent = {
  ...bundledL1Content,
  childProfileId: "debug-child",
  manifest: {
    ...bundledL1Content.manifest,
    version: "corpus-v5",
    abilityLevel: 5,
  },
  corpus: challengeContent.corpus,
};

function activeContentSelection(
  current: ReturnType<SessionState["getState"]>,
): ContentSelection | null {
  return (
    current.activeDaily?.contentSelection ??
    current.activeAssessment?.contentSelection ??
    current.activeChallenge?.contentSelection ??
    null
  );
}

function initialContentFor(
  selection: ContentSelection | null,
): LoadedContent {
  if (
    selection === null ||
    selection.version !== `bundled-corpus-v5-L${selection.abilityLevel}`
  ) {
    return bundledL1Content;
  }
  return {
    ...bundledL1Content,
    childProfileId: selection.childProfileId,
    authentication: selection.authentication,
    manifest: {
      ...bundledL1Content.manifest,
      version: selection.version,
      abilityLevel: selection.abilityLevel,
    },
    corpus: corpusAtOrBelow(
      challengeContent.corpus,
      selection.abilityLevel,
    ),
  };
}

export interface RuntimeContentContextValue extends RuntimeContentSnapshot {
  retry(): Promise<void>;
  stageRefresh(): Promise<void>;
}

const RuntimeContentContext =
  createContext<RuntimeContentContextValue | null>(null);

export function RuntimeContentProvider({
  children,
  loader,
  state = sessionState,
}: {
  children: ReactNode;
  loader?: ContentLoader;
  state?: SessionState;
}) {
  const resolvedLoader = useMemo(
    () => loader ?? createContentLoader(createBrowserContentDeps()),
    [loader],
  );
  const initialContent = useMemo(
    () => initialContentFor(activeContentSelection(state.getState())),
    [state],
  );
  const runtime = useMemo(
    () => createRuntimeContentState(resolvedLoader, initialContent),
    [initialContent, resolvedLoader],
  );
  const app = useSyncExternalStore(
    state.subscribe,
    state.getState,
    state.getState,
  );
  const selection = activeContentSelection(app);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );

  useEffect(() => {
    void runtime.bootstrap(() => selectionRef.current);
  }, [runtime]);

  useEffect(() => {
    runtime.activateIfIdle(selection !== null);
  }, [runtime, selection]);

  const value = useMemo<RuntimeContentContextValue>(
    () => ({
      ...snapshot,
      retry: () => runtime.bootstrap(() => selectionRef.current),
      stageRefresh: () => runtime.refresh(() => selectionRef.current),
    }),
    [runtime, snapshot],
  );
  const loadedSelection = contentSelectionOf(snapshot.content);
  const contentMatchesSelection =
    selection === null ||
    (loadedSelection.version === selection.version &&
      loadedSelection.abilityLevel === selection.abilityLevel &&
      loadedSelection.childProfileId === selection.childProfileId &&
      loadedSelection.authentication === selection.authentication);
  const child =
    snapshot.status === "ready" && contentMatchesSelection ? (
      children
    ) : snapshot.status === "unavailable" ? (
      <main>
        <p>学习内容暂时不可用</p>
        <button type="button" onClick={() => void value.retry()}>
          重试
        </button>
      </main>
    ) : (
      <main>
        <p>正在准备学习内容…</p>
      </main>
    );

  return (
    <RuntimeContentContext.Provider value={value}>
      {child}
    </RuntimeContentContext.Provider>
  );
}

export function useRuntimeContentState(): RuntimeContentContextValue | null {
  return useContext(RuntimeContentContext);
}

export function useRuntimeContent(): LoadedContent {
  return useRuntimeContentState()?.content ?? standaloneContent;
}
