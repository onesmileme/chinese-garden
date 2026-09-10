export interface Theme {
  color: {
    primary: string;
    correct: string;
    wrong: string;
    text: string;
    bg: string;
  };
  space: number[];
  fontSize: { sm: number; md: number; lg: number; xl: number };
}

export const defaultTheme: Theme = {
  color: {
    primary: "#a1762e",
    correct: "#2f855a",
    wrong: "#c24156",
    text: "#22312b",
    bg: "#fbf7ec",
  },
  space: [0, 4, 8, 12, 16, 24, 32],
  fontSize: { sm: 14, md: 18, lg: 24, xl: 32 },
};
