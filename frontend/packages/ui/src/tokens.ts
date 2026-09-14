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
    // 童趣糖果风点缀：暖橙主行动色、翠绿达成色
    accent: "#f39c12",
    emerald: "#2e9f6e",
    ctaEdge: "#c97213",
  },
  // 童趣风放大圆角：小圆角守住古典留白，卡片/胶囊走大圆角
  radius: { sm: 4, md: 8, lg: 8, card: 16, xl: 24, pill: 999 },
  space: [0, 4, 8, 12, 16, 24, 32],
  fontSize: { sm: 14, md: 18, lg: 30, display: 44 },
  motion: { fast: 120, base: 200, celebrate: 600 },
  question: {
    stage: "#fffdf7",
    stageBorder: "#edc978",
    stageShadow: "#edc978",
    guide: "#f8e8bd",
    optionBorders: ["#8ec4b5", "#ecc078", "#a8c2df", "#e4aab3"],
    // A/B/C/D 选项字母徽章配色，与四色选项边框呼应
    optionBadges: [
      { bg: "#e5f7f1", text: "#047857" },
      { bg: "#fff5e5", text: "#92400e" },
      { bg: "#eaf2fc", text: "#1d4ed8" },
      { bg: "#fdf0f3", text: "#be185d" },
    ],
  },
  control: { optionMinHeight: 64, choiceMinHeight: 72, backSize: 44 },
  // 渐变仅用于进度条与主行动按钮，宣纸底本身仍不使用渐变
  gradient: {
    dailyProgress: "linear-gradient(90deg, #34d399, #14b8a6)",
    questionProgress: "linear-gradient(90deg, #f4a838, #e59325)",
    cta: "linear-gradient(180deg, #ffa82e, #ea8a13)",
    poemConfirm: "linear-gradient(180deg, #55bea5, #43a991)",
    warmIcon: "linear-gradient(135deg, #fbbf24, #fb7185, #fb923c)",
  },
  // 软胶立体投影：主按钮下沉阴影、卡片柔和投影
  shadow: {
    kidBtn: "0 6px 0 #c97213, 0 10px 15px -3px rgba(234, 169, 60, 0.4)",
    poemConfirm: "0 4px 0 #348974",
    poemConfirmDisabled: "0 3px 0 #c0cdc7",
    tool: "0 2px 0 #c5bdaa",
    card: "0 6px 18px -6px rgba(120, 100, 70, 0.28)",
    cardEdge: "0 4px 0 #e2c78a",
  },
  // 首页双入口 Tab 配色：诗词薄荷绿、成语暖杏黄
  tab: {
    poem: { bg: "#d8efe8", border: "#bce4d8", text: "#1f7a5e", sub: "#358e73" },
    idiom: { bg: "#fcecd1", border: "#f5dcb3", text: "#995817", sub: "#b0732e" },
  },
  bg: {
    // 宣纸米白底
    page: "#fbf7ec",
    surface: "#ffffff",
    bands: ["#f6dfda", "#d8eee8", "#f3e8c9", "#dfeaf6"],
    // 古典四馆装饰：诗 / 词 / 成 / 语
    decor: ["诗", "词", "成", "语"],
  },
} as const;
