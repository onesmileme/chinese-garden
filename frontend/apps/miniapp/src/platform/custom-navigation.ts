import Taro from "@tarojs/taro";

export const routes = {
  home: "/pages/home/index",
  assessment: "/pages/assessment/index",
  lesson: "/pages/lesson/index",
  summary: "/pages/summary/index",
  guardian: "/pages/guardian/index",
  idiomPractice: "/pages/idiom-practice/index",
  poemPractice: "/pages/poem-practice/index",
  challenge: "/pages/challenge/index",
} as const;

export function openPage(url: (typeof routes)[keyof typeof routes]): void {
  void Taro.navigateTo({ url });
}

export async function backToHome(): Promise<void> {
  try {
    await Taro.navigateBack({ delta: 1 });
  } catch {
    await Taro.redirectTo({ url: routes.home });
  }
}

export function redirectHome(): void {
  void Taro.redirectTo({ url: routes.home });
}
