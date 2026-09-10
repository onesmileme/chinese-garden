/**
 * POEM_FILL 拖拽填空的纯函数状态机。
 *
 * 状态以「空槽序号 → 候选索引」映射表示（`filled`），配合 `history` 快照栈
 * 支持撤销。序列化格式与 domain `serializePoemFill` 一致：按空序 `index=字`，
 * 以 `|` 连接。
 */
export type PoemFillFilled = Readonly<Record<number, number>>;

export interface PoemFillState {
  readonly filled: PoemFillFilled;
  readonly history: readonly PoemFillFilled[];
}

export function initialPoemFillState(): PoemFillState {
  return { filled: {}, history: [] };
}

/** 将候选拖入空槽：同一候选若已用于其它空槽则先移除，目标空槽被覆盖。 */
export function dropToBlank(
  state: PoemFillState,
  candidateIndex: number,
  blankIndex: number,
): PoemFillState {
  const next: Record<number, number> = {};
  for (const [key, value] of Object.entries(state.filled)) {
    if (value === candidateIndex) continue;
    next[Number(key)] = value;
  }
  next[blankIndex] = candidateIndex;
  return { filled: next, history: [...state.history, state.filled] };
}

/** 从空槽移除已填候选。空槽为空时视为无变化，不记录历史。 */
export function removeFromBlank(
  state: PoemFillState,
  blankIndex: number,
): PoemFillState {
  if (!(blankIndex in state.filled)) return state;
  const next: Record<number, number> = {};
  for (const [key, value] of Object.entries(state.filled)) {
    if (Number(key) === blankIndex) continue;
    next[Number(key)] = value;
  }
  return { filled: next, history: [...state.history, state.filled] };
}

/** 撤销上一步；无历史时保持不变。 */
export function undo(state: PoemFillState): PoemFillState {
  if (state.history.length === 0) return state;
  const history = state.history.slice(0, -1);
  const filled = state.history[state.history.length - 1]!;
  return { filled, history };
}

/** 重置所有空槽；已为空时不记录历史。 */
export function reset(state: PoemFillState): PoemFillState {
  if (Object.keys(state.filled).length === 0) return state;
  return { filled: {}, history: [...state.history, state.filled] };
}

export function isCandidateUsed(
  state: PoemFillState,
  candidateIndex: number,
): boolean {
  return Object.values(state.filled).includes(candidateIndex);
}

export function characterInBlank(
  state: PoemFillState,
  candidates: readonly string[],
  blankIndex: number,
): string {
  const candidateIndex = state.filled[blankIndex];
  if (candidateIndex === undefined) return "";
  return candidates[candidateIndex] ?? "";
}

/** 所有空槽是否都已填满。 */
export function allBlanksFilled(
  state: PoemFillState,
  blankIndices: readonly number[],
): boolean {
  return (
    blankIndices.length > 0 &&
    blankIndices.every((index) => index in state.filled)
  );
}

/** 序列化为 domain 权威串：按空序 `index=字`，以 `|` 连接。 */
export function serializePoemFillState(
  state: PoemFillState,
  candidates: readonly string[],
): string {
  return Object.keys(state.filled)
    .map(Number)
    .sort((a, b) => a - b)
    .map((blankIndex) => `${blankIndex}=${candidates[state.filled[blankIndex]!] ?? ""}`)
    .join("|");
}
