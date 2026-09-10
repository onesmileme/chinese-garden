// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ParentGate } from "../src/components/ParentGate";

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function gateButton(): HTMLButtonElement {
  const button = container.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) throw new Error("gate not found");
  return button;
}

function dispatch(type: string): void {
  act(() => gateButton().dispatchEvent(new Event(type, { bubbles: true })));
}

describe("ParentGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it.each([
    ["pointer", () => dispatch("pointerdown")],
    ["mouse", () => dispatch("mousedown")],
    ["touch", () => dispatch("touchstart")],
  ])("unlocks after a three-second %s hold", (_kind, beginHold) => {
    const onUnlock = vi.fn();
    act(() => root.render(<ParentGate onUnlock={onUnlock} />));

    beginHold();
    act(() => vi.advanceTimersByTime(2_999));
    expect(onUnlock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "pointer release",
      () => dispatch("pointerdown"),
      () => dispatch("pointerup"),
    ],
    [
      "pointer cancel",
      () => dispatch("pointerdown"),
      () => dispatch("pointercancel"),
    ],
    [
      "mouse release",
      () => dispatch("mousedown"),
      () => dispatch("mouseup"),
    ],
    [
      "mouse leave",
      () => dispatch("mousedown"),
      () => dispatch("mouseout"),
    ],
    [
      "touch release",
      () => dispatch("touchstart"),
      () => dispatch("touchend"),
    ],
    [
      "touch cancel",
      () => dispatch("touchstart"),
      () => dispatch("touchcancel"),
    ],
  ])("cancels an unfinished hold on %s", (_kind, beginHold, cancelHold) => {
    const onUnlock = vi.fn();
    act(() => root.render(<ParentGate onUnlock={onUnlock} />));

    beginHold();
    act(() => vi.advanceTimersByTime(1_000));
    cancelHold();
    act(() => vi.advanceTimersByTime(3_000));

    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("clears an unfinished hold when unmounted", () => {
    const onUnlock = vi.fn();
    act(() => root.render(<ParentGate onUnlock={onUnlock} />));

    dispatch("pointerdown");
    act(() => root.unmount());
    act(() => vi.advanceTimersByTime(3_000));

    expect(onUnlock).not.toHaveBeenCalled();
  });
});
