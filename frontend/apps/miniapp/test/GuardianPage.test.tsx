// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createGuardianSettingsStore,
  DEFAULT_GUARDIAN_SETTINGS,
  type GuardianSettingsSnapshot,
  type GuardianSettingsStore,
} from "@cc/application";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/app";
import GuardianPage from "../src/pages/guardian";
import { makeDaily, makeState } from "./page-fixtures";

afterEach(cleanup);

function settingsStore({
  write = () => undefined,
}: {
  write?: (snapshot: GuardianSettingsSnapshot) => void | Promise<void>;
} = {}): GuardianSettingsStore {
  return createGuardianSettingsStore({
    repository: {
      read: () => null,
      write,
    },
  });
}

describe("miniapp GuardianPage", () => {
  it("shows learning data without child decorations", () => {
    render(
      <GuardianPage
        state={makeState({ daily: makeDaily(6) })}
        settings={settingsStore()}
      />,
    );

    expect(screen.getByText("家长中心")).toBeTruthy();
    expect(screen.getByText("6 / 15")).toBeTruthy();
    expect(screen.getByText("Lv.1")).toBeTruthy();
    expect(screen.getByText("累计成长值")).toBeTruthy();
    expect(screen.queryAllByLabelText("ink-decor")).toHaveLength(0);
  });

  it("renders shared settings in order with unsupported music disabled", () => {
    const { container } = render(
      <GuardianPage state={makeState()} settings={settingsStore()} />,
    );
    const text = container.textContent ?? "";

    expect(text.indexOf("学习状态")).toBeLessThan(
      text.indexOf("成长记录"),
    );
    expect(text.indexOf("成长记录")).toBeLessThan(
      text.indexOf("声音与体验"),
    );
    expect(text.indexOf("声音与体验")).toBeLessThan(
      text.indexOf("数据管理"),
    );
    expect(screen.getByText("当前暂无背景音乐资源，暂不支持此设置"))
      .toBeTruthy();

    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(4);
    expect(
      (screen.getByRole("switch", {
        name: "背景音乐",
      }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("switch", {
        name: "答题音效",
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("switch", {
        name: "震动反馈",
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("switch", {
        name: "护眼模式",
      }) as HTMLInputElement).checked,
    ).toBe(false);
    for (const control of switches) {
      expect(control.parentElement?.style.minHeight).toBe("64px");
    }
  });

  it("rolls a setting back and shows an error when persistence fails", async () => {
    const settings = settingsStore({
      write: () => {
        throw new Error("storage unavailable");
      },
    });
    render(<GuardianPage state={makeState()} settings={settings} />);
    const answerSound = screen.getByRole("switch", {
      name: "答题音效",
    });

    fireEvent.click(answerSound);

    await waitFor(() => {
      expect((answerSound as HTMLInputElement).checked).toBe(true);
      expect(screen.getByText("设置保存失败，请重试")).toBeTruthy();
    });
    expect(settings.getState().settings).toEqual(
      DEFAULT_GUARDIAN_SETTINGS,
    );
  });

  it("defaults confirmation focus to cancel and preserves data on cancel", () => {
    const clearRecords = vi.fn(async () => undefined);
    render(
      <GuardianPage
        state={makeState()}
        settings={settingsStore()}
        clearRecords={clearRecords}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "清除学习记录" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("清除后不可恢复");
    const cancel = screen.getByRole("button", { name: "取消" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(clearRecords).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears learning records only after confirmation", async () => {
    const state = makeState({ daily: makeDaily(6) });
    const clearRecords = vi.fn(async () => state.clearLearningRecords());
    render(
      <GuardianPage
        state={state}
        settings={settingsStore()}
        clearRecords={clearRecords}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "清除学习记录" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清除" }));

    await waitFor(() => {
      expect(clearRecords).toHaveBeenCalledTimes(1);
      expect(screen.getByText("未开始 · 0 / 15")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("shows an error when clearing learning records fails", async () => {
    render(
      <GuardianPage
        state={makeState()}
        settings={settingsStore()}
        clearRecords={() => Promise.reject(new Error("clear failed"))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "清除学习记录" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清除" }));

    expect(
      await screen.findByText("学习记录清除失败，请重试"),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("miniapp App", () => {
  it("restores guardian preferences during startup", async () => {
    const ready = vi.fn(async () => undefined);
    const settings = {
      ...settingsStore(),
      ready,
    };

    render(
      <App settings={settings}>
        <div>child</div>
      </App>,
    );

    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  });
});
