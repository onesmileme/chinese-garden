// 拼音声调工具：古文乐园无拼音题型，仅用于识字库（可选 plumbing）的校验。

// 每个带调基础韵母对应四个声调的完整带调字符。
const TONE_ROWS: Record<string, string> = {
  a: "āáǎà",
  e: "ēéěè",
  i: "īíǐì",
  o: "ōóǒò",
  u: "ūúǔù",
  ü: "ǖǘǚǜ",
};

/** 拆出无调骨架与声调（1..4，无可识别声调标记返回 0）。 */
export function stripTone(pinyin: string): { skeleton: string; tone: number } {
  let tone = 0;
  let skeleton = "";
  for (const ch of pinyin) {
    let matched = false;
    for (const [base, marks] of Object.entries(TONE_ROWS)) {
      const idx = [...marks].indexOf(ch);
      if (idx >= 0) {
        tone = idx + 1;
        skeleton += base;
        matched = true;
        break;
      }
    }
    if (!matched) skeleton += ch;
  }
  return { skeleton, tone };
}
