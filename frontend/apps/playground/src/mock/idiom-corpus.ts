import type { Corpus } from "@cc/domain";
import { demoCorpus } from "./corpus";

/**
 * 成语练习复用主语料库（成语已并入 demoCorpus，此处保留具名导出以稳定引用）。
 */
export const idiomCorpus: Corpus = demoCorpus;
