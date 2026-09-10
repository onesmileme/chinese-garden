export function pickIdiomChar(
  picked: readonly number[],
  candidateIndex: number,
): number[] {
  if (picked.length >= 4 || picked.includes(candidateIndex)) return [...picked];
  return [...picked, candidateIndex];
}

export function undoIdiomChar(picked: readonly number[]): number[] {
  return picked.slice(0, -1);
}

export function assembleIdiom(
  candidates: readonly string[],
  picked: readonly number[],
): string {
  return picked.map((index) => candidates[index] ?? "").join("");
}

export function shouldSubmitIdiom(
  picked: readonly number[],
  submitted: boolean,
): boolean {
  return picked.length === 4 && !submitted;
}
