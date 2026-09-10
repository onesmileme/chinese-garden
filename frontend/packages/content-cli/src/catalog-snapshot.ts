import type {
  ReleaseSnapshotItem,
  ReleaseSnapshotResponse,
  RuntimePackBundle,
} from "./model";

export function bundleFromSnapshot(
  snapshot: ReleaseSnapshotResponse,
  support: RuntimePackBundle,
): RuntimePackBundle {
  const ids = new Set<string>();
  for (const item of snapshot.items) {
    if (item.status !== "ACTIVE") {
      throw new Error(`snapshot item must be ACTIVE: ${item.id}`);
    }
    if (ids.has(item.id)) {
      throw new Error(`duplicate snapshot item: ${item.id}`);
    }
    ids.add(item.id);
  }
  const items = snapshot.items.map(materialize);
  const byType = (type: ReleaseSnapshotItem["type"]) =>
    items.filter((item) => item.type === type).map(({ type: _type, ...item }) => item);
  return {
    ...support,
    characterBank: {
      version: snapshot.version,
      characters: byType("CHARACTER"),
    },
    poemBank: {
      version: snapshot.version,
      poems: byType("POEM"),
    },
    idiomBank: {
      version: snapshot.version,
      idioms: byType("IDIOM"),
    },
    questionsVector: {
      ...support.questionsVector,
      contentVersion: snapshot.version,
    },
  };
}

function materialize(item: ReleaseSnapshotItem): Record<string, unknown> & {
  type: ReleaseSnapshotItem["type"];
} {
  if (item.payload === null || typeof item.payload !== "object" || Array.isArray(item.payload)) {
    throw new Error(`snapshot payload must be an object: ${item.id}`);
  }
  return {
    ...(item.payload as Record<string, unknown>),
    id: item.id,
    type: item.type,
    level: item.level,
    difficulty: item.difficulty,
    promotionRequired: item.promotionRequired,
    status: item.status,
    tags: [...item.tags],
    revision: item.revision,
  };
}
