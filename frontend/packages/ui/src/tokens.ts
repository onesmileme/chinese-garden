export const tokens = {
  color: {
    // 古典点缀色：朱砂（vermilion）为强调，黛青（indigo）为辅助
    vermilion: "#b6493f",
    indigo: "#2b8a78",
    poem: "#a1762e",
    idiom: "#3f6fa3",
    done: "#2f855a",
    current: "#e49a35",
    currentStrong: "#8a4b08",
    locked: "#dce5e0",
    correct: "#2f855a",
    wrong: "#c24156",
    text: "#22312b",
    textSoft: "#607169",
    surface: "#ffffff",
  },
  radius: { sm: 4, md: 8, lg: 8 },
  space: [0, 4, 8, 12, 16, 24, 32],
  fontSize: { sm: 14, md: 18, lg: 30, display: 44 },
  motion: { fast: 120, base: 200, celebrate: 600 },
  question: {
    stage: "#fffdf7",
    stageBorder: "#edc978",
    stageShadow: "#edc978",
    guide: "#f8e8bd",
    optionBorders: ["#8ec4b5", "#ecc078", "#a8c2df", "#e4aab3"],
  },
  control: { optionMinHeight: 64, choiceMinHeight: 72, backSize: 44 },
  bg: {
    // 宣纸米白底
    page: "#fbf7ec",
    surface: "#ffffff",
    bands: ["#f6dfda", "#d8eee8", "#f3e8c9", "#dfeaf6"],
    // 古典四馆装饰：诗 / 词 / 成 / 语
    decor: ["诗", "词", "成", "语"],
  },
} as const;
