import type { Idiom } from "@cc/content-schema";
import { seededShuffle } from "./deterministic-random";

export function findIdiomSuccessors(
  source: Idiom,
  idioms: readonly Idiom[],
): Idiom[] {
  return idioms.filter(
    (candidate) =>
      candidate.id !== source.id &&
      candidate.headPinyin === source.tailPinyin,
  );
}

export function firstIdiomSuccessor(
  source: Idiom,
  idioms: readonly Idiom[],
): Idiom {
  const successor = findIdiomSuccessors(source, idioms)[0];
  if (!successor) {
    throw new Error(`no idiom successor: ${source.id}`);
  }
  return successor;
}

export function canAssemble(
  text: string,
  candidates: readonly string[],
): boolean {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  for (const character of [...text]) {
    const remaining = counts.get(character) ?? 0;
    if (remaining === 0) return false;
    counts.set(character, remaining - 1);
  }
  return true;
}

export function generateIdiomChainCandidates(
  source: Idiom,
  idioms: readonly Idiom[],
  rng: () => number,
): {
  options: string[];
  correctAnswer: string;
  acceptedAnswers: string[];
} {
  const successors = findIdiomSuccessors(source, idioms);
  const canonical = firstIdiomSuccessor(source, idioms);
  const targetSize = source.difficulty <= 2 ? 8 : 12;
  const fillerCount = targetSize - 4;
  const fillerPool = idioms
    .filter((idiom) => idiom.id !== canonical.id)
    .flatMap((idiom) => [...idiom.text]);
  if (fillerPool.length < fillerCount) {
    throw new Error(`insufficient idiom filler characters: ${source.id}`);
  }
  const filler = seededShuffle(fillerPool, rng).slice(0, fillerCount);
  const options = seededShuffle([...canonical.text, ...filler], rng);
  const acceptedAnswers = successors
    .filter((idiom) => canAssemble(idiom.text, options))
    .map((idiom) => idiom.text);
  return {
    options,
    correctAnswer: canonical.text,
    acceptedAnswers,
  };
}
