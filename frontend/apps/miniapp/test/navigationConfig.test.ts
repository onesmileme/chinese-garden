import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubGlobal("defineAppConfig", (config: unknown) => config);
  vi.stubGlobal("definePageConfig", (config: unknown) => config);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("miniapp navigation config", () => {
  it("declares every journey page", async () => {
    const appConfig = (await import("../src/app.config")).default;
    expect(appConfig.pages).toEqual([
      "pages/home/index",
      "pages/assessment/index",
      "pages/lesson/index",
      "pages/summary/index",
      "pages/guardian/index",
      "pages/idiom-practice/index",
      "pages/poem-practice/index",
      "pages/challenge/index",
    ]);
  });

  it("locks native navigation during assessment and lessons", async () => {
    const assessment = (
      await import("../src/pages/assessment/index.config")
    ).default;
    const lesson = (await import("../src/pages/lesson/index.config")).default;
    const idiomPractice = (
      await import("../src/pages/idiom-practice/index.config")
    ).default;
    const poemPractice = (
      await import("../src/pages/poem-practice/index.config")
    ).default;
    const challenge = (
      await import("../src/pages/challenge/index.config")
    ).default;

    expect(assessment).toMatchObject({
      navigationStyle: "custom",
      disableSwipeBack: true,
    });
    expect(lesson).toMatchObject({
      navigationStyle: "custom",
      disableSwipeBack: true,
    });
    expect(idiomPractice).toMatchObject({
      navigationStyle: "custom",
      disableSwipeBack: true,
    });
    expect(poemPractice).toMatchObject({
      navigationStyle: "custom",
      disableSwipeBack: true,
    });
    expect(challenge).toMatchObject({
      navigationStyle: "custom",
      disableSwipeBack: true,
    });
  });
});
