// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageShell } from "../src/layout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: ReactNode): void {
  act(() => root.render(element));
}

describe("PageShell", () => {
  it("shows learning status in the default variant", () => {
    render(
      <PageShell title="今日学习">
        <div>普通内容</div>
      </PageShell>,
    );

    expect(container.querySelector('[aria-label="学习状态"]')).not.toBeNull();
  });

  it("hides learning status in the question variant", () => {
    render(
      <PageShell title="今日学习" variant="question">
        <div>答题内容</div>
      </PageShell>,
    );

    expect(container.querySelector('[aria-label="学习状态"]')).toBeNull();
    expect(container.textContent).toContain("答题内容");
  });
});
