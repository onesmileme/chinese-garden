import type {
  ContentLoader,
  ContentSelection,
  LoadedContent,
} from "./content-loader";

export type RuntimeContentStatus = "loading" | "ready" | "unavailable";

export interface RuntimeContentSnapshot {
  status: RuntimeContentStatus;
  content: LoadedContent;
  pending: LoadedContent | null;
  error: unknown | null;
}

export interface RuntimeContentState {
  getSnapshot(): RuntimeContentSnapshot;
  subscribe(listener: () => void): () => void;
  bootstrap(selection: SessionContentSelectionSource): Promise<void>;
  refresh(selection: SessionContentSelectionSource): Promise<void>;
  activateIfIdle(sessionActive: boolean): void;
}

export type SessionContentSelection = ContentSelection | null;
export type SessionContentSelectionSource =
  | SessionContentSelection
  | (() => SessionContentSelection);

export function createRuntimeContentState(
  loader: ContentLoader,
  initialContent: LoadedContent,
): RuntimeContentState {
  let snapshot: RuntimeContentSnapshot = {
    status: "loading",
    content: initialContent,
    pending: null,
    error: null,
  };
  const listeners = new Set<() => void>();

  const update = (next: RuntimeContentSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const resolveSelection = (
    source: SessionContentSelectionSource,
  ): SessionContentSelection =>
    typeof source === "function" ? source() : source;

  const load = async (
    operation: (
      selection: SessionContentSelection,
    ) => Promise<LoadedContent>,
    selectionSource: SessionContentSelectionSource,
  ) => {
    try {
      const loaded = await operation(resolveSelection(selectionSource));
      const selection = resolveSelection(selectionSource);
      const matchesSelection =
        selection !== null &&
        loaded.manifest.version === selection.version &&
        loaded.manifest.abilityLevel === selection.abilityLevel;
      update(
        selection !== null && !matchesSelection
          ? { ...snapshot, status: "ready", pending: loaded, error: null }
          : {
              status: "ready",
              content: loaded,
              pending: null,
              error: null,
            },
      );
    } catch (error) {
      update({ ...snapshot, status: "unavailable", error });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bootstrap: (selection) =>
      load(
        (resolved) =>
          resolved === null ? loader.load() : loader.load(resolved),
        selection,
      ),
    refresh: (selection) =>
      load(() => loader.refreshAfterSession(), selection),
    activateIfIdle(sessionActive) {
      if (sessionActive || snapshot.pending === null) return;
      update({
        status: "ready",
        content: snapshot.pending,
        pending: null,
        error: null,
      });
    },
  };
}
