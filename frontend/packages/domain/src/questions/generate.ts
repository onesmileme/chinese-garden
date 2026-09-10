import type {
  Character,
  Idiom,
  Poem,
  QuestionType,
  KnowledgePointId,
} from "@cc/content-schema";
import {
  makeSeededRng,
  seededShuffle,
} from "./deterministic-random";
import {
  firstIdiomSuccessor,
  generateIdiomChainCandidates,
} from "./idiom-chain";

export interface Corpus {
  poems: Poem[];
  idioms: Idiom[];
  /** 识字库：古文乐园不出识字题，保留为可选 plumbing，默认空。 */
  characters?: Character[];
}

/** POEM_FILL 单空：出现顺序 index 与其正确单字 answer。 */
export interface PoemFillBlank {
  index: number;
  answer: string;
}

export interface GeneratedQuestion {
  knowledgePointId: KnowledgePointId;
  questionType: QuestionType;
  seed: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  acceptedAnswers?: string[];
  // 以下为 POEM_FILL 的可选结构字段（其它题型不产出）。
  displayLines?: string[];
  blanks?: PoemFillBlank[];
  candidates?: string[];
}

function findPoem(corpus: Corpus, kpId: KnowledgePointId): Poem {
  const p = corpus.poems.find((x) => x.id === kpId);
  if (!p) throw new Error(`poem not found: ${kpId}`);
  return p;
}

function findIdiom(corpus: Corpus, kpId: KnowledgePointId): Idiom {
  const idiom = corpus.idioms.find((candidate) => candidate.id === kpId);
  if (!idiom) throw new Error(`idiom not found: ${kpId}`);
  return idiom;
}

// POEM_FILL 每首诗按难度递增的挖空数量（2..3 空）。
export function poemBlankCount(difficulty: number): number {
  return difficulty <= 2 ? 2 : 3;
}

export function canGeneratePoemFill(
  poem: Pick<Poem, "difficulty" | "lines">,
): boolean {
  const uniqueCharacterCount = new Set(
    poem.lines.flatMap((line) => [...line]),
  ).size;
  return uniqueCharacterCount >= poemBlankCount(poem.difficulty) * 2;
}

/** POEM_MATCH_NEXT 前提：诗至少有相邻两句可供“给上句选下句”。 */
export function canGeneratePoemMatch(poem: Pick<Poem, "lines">): boolean {
  return poem.lines.length >= 2;
}

/** POEM_FILL 权威规范串：按空序 `index=字`，以 `|` 连接（TS/Java 对齐）。 */
export function serializePoemFill(filled: Record<number, string>): string {
  return Object.keys(filled)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => `${k}=${filled[k]}`)
    .join("|");
}

function parsePoemFill(serialized: string): Record<number, string> {
  const out: Record<number, string> = {};
  if (serialized === "") return out;
  for (const part of serialized.split("|")) {
    const eq = part.indexOf("=");
    out[Number(part.slice(0, eq))] = part.slice(eq + 1);
  }
  return out;
}

/**
 * 权威答案：纯查表，无 RNG。后端将以相同逻辑独立核验。
 * - IDIOM_CHAIN → 语料顺序下的首个可接龙成语
 * - IDIOM_MEANING → 该成语的释义
 * - POEM_FILL / POEM_MATCH_NEXT → 依赖 seed，权威串由 generateQuestion 产出
 */
export function lookupAnswer(
  type: QuestionType,
  kpId: KnowledgePointId,
  corpus: Corpus,
): string {
  if (type === "IDIOM_CHAIN") {
    const source = findIdiom(corpus, kpId);
    return firstIdiomSuccessor(source, corpus.idioms).text;
  }
  if (type === "IDIOM_MEANING") {
    return findIdiom(corpus, kpId).meaning;
  }
  throw new Error(
    `${type} answer is seed-dependent; use generateQuestion: ${kpId}`,
  );
}

/** 从候选池按 seed 取 count 条唯一干扰项（已排除正确项）。 */
function pickDistractors(
  pool: readonly string[],
  correctAnswer: string,
  count: number,
  rng: () => number,
): string[] {
  const chosen: string[] = [];
  for (const candidate of seededShuffle([...new Set(pool)], rng)) {
    if (chosen.length >= count) break;
    if (candidate !== correctAnswer && !chosen.includes(candidate)) {
      chosen.push(candidate);
    }
  }
  return chosen;
}

export function generateQuestion(
  type: QuestionType,
  kpId: KnowledgePointId,
  corpus: Corpus,
  seed: string,
): GeneratedQuestion {
  const rng = makeSeededRng(`${type}:${kpId}:${seed}`);

  if (type === "IDIOM_CHAIN") {
    const source = findIdiom(corpus, kpId);
    const generated = generateIdiomChainCandidates(
      source,
      corpus.idioms,
      rng,
    );
    return {
      knowledgePointId: kpId,
      questionType: type,
      seed,
      prompt: source.text,
      ...generated,
    };
  }

  if (type === "IDIOM_MEANING") {
    const source = findIdiom(corpus, kpId);
    const correctAnswer = source.meaning;
    const sameDifficulty = corpus.idioms
      .filter(
        (idiom) =>
          idiom.id !== source.id && idiom.difficulty === source.difficulty,
      )
      .map((idiom) => idiom.meaning);
    let distractors = pickDistractors(sameDifficulty, correctAnswer, 3, rng);
    if (distractors.length < 3) {
      const allOthers = corpus.idioms
        .filter((idiom) => idiom.id !== source.id)
        .map((idiom) => idiom.meaning);
      distractors = pickDistractors(
        [...distractors, ...allOthers],
        correctAnswer,
        3,
        rng,
      );
    }
    if (distractors.length < 3) {
      throw new Error(`cannot build idiom-meaning options: ${kpId}`);
    }
    return {
      knowledgePointId: kpId,
      questionType: type,
      seed,
      prompt: source.text,
      options: seededShuffle([correctAnswer, ...distractors], rng),
      correctAnswer,
    };
  }

  if (type === "POEM_MATCH_NEXT") {
    const poem = findPoem(corpus, kpId);
    if (!canGeneratePoemMatch(poem)) {
      throw new Error(`poem has too few lines for POEM_MATCH_NEXT: ${kpId}`);
    }
    const pairIndex = Math.floor(rng() * (poem.lines.length - 1));
    const prompt = poem.lines[pairIndex]!;
    const correctAnswer = poem.lines[pairIndex + 1]!;
    const otherPoemLines = corpus.poems
      .filter((candidate) => candidate.id !== poem.id)
      .flatMap((candidate) => candidate.lines)
      .filter((line) => line !== prompt);
    let distractors = pickDistractors(otherPoemLines, correctAnswer, 3, rng);
    if (distractors.length < 3) {
      const samePoemLines = poem.lines.filter((line) => line !== prompt);
      distractors = pickDistractors(
        [...distractors, ...samePoemLines],
        correctAnswer,
        3,
        rng,
      );
    }
    if (distractors.length < 3) {
      throw new Error(`cannot build poem-match options: ${kpId}`);
    }
    return {
      knowledgePointId: kpId,
      questionType: type,
      seed,
      prompt,
      options: seededShuffle([correctAnswer, ...distractors], rng),
      correctAnswer,
    };
  }

  // POEM_FILL
  const poem = findPoem(corpus, kpId);
  const blankCount = poemBlankCount(poem.difficulty);
  const positions: { line: number; col: number; ch: string }[] = [];
  poem.lines.forEach((line, li) =>
    [...line].forEach((ch, ci) => positions.push({ line: li, col: ci, ch })),
  );
  if (!canGeneratePoemFill(poem))
    throw new Error(
      `poem has too few unique characters for POEM_FILL: ${kpId}`,
    );
  const selected: typeof positions = [];
  const selectedChars = new Set<string>();
  for (const position of seededShuffle(positions, rng)) {
    if (selectedChars.has(position.ch)) continue;
    selected.push(position);
    selectedChars.add(position.ch);
    if (selected.length === blankCount) break;
  }
  selected.sort((a, b) => a.line - b.line || a.col - b.col);
  const blankedSet = new Set(selected.map((p) => `${p.line}:${p.col}`));
  const displayLines = poem.lines.map((line, li) =>
    [...line]
      .map((ch, ci) => (blankedSet.has(`${li}:${ci}`) ? "＿" : ch))
      .join(""),
  );
  const blanks: PoemFillBlank[] = selected.map((p, index) => ({
    index,
    answer: p.ch,
  }));
  const answerChars = blanks.map((b) => b.answer);
  const visibleChars = positions
    .filter(
      (p) =>
        !blankedSet.has(`${p.line}:${p.col}`) && !selectedChars.has(p.ch),
    )
    .map((p) => p.ch);
  const distractors = seededShuffle([...new Set(visibleChars)], rng).slice(
    0,
    blankCount,
  );
  const candidates = seededShuffle([...answerChars, ...distractors], rng);
  const correctAnswer = serializePoemFill(
    Object.fromEntries(blanks.map((b) => [b.index, b.answer])),
  );
  return {
    knowledgePointId: kpId,
    questionType: "POEM_FILL",
    seed,
    prompt: poem.title,
    options: candidates,
    correctAnswer,
    displayLines,
    blanks,
    candidates,
  };
}

/** POEM_FILL 判定：每空填入字等于该空 answer，且全部空正确才算整题正确。 */
export function isPoemFillCorrect(
  question: GeneratedQuestion,
  filled: Record<number, string>,
): boolean {
  const blanks = question.blanks ?? [];
  return (
    blanks.length > 0 && blanks.every((b) => filled[b.index] === b.answer)
  );
}

export function isCorrectAnswer(
  question: GeneratedQuestion,
  chosenAnswer: string,
): boolean {
  if (question.questionType === "POEM_FILL") {
    return isPoemFillCorrect(question, parsePoemFill(chosenAnswer));
  }
  return (question.acceptedAnswers ?? [question.correctAnswer]).includes(
    chosenAnswer,
  );
}
