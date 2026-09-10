import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, Text, View } from "@tarojs/components";

afterEach(cleanup);

describe("Taro component boundary", () => {
  it("maps shared primitives to DOM in tests", () => {
    render(
      <View>
        <Text>月</Text>
        <Button>月亮</Button>
      </View>,
    );

    expect(screen.getByText("月").tagName).toBe("SPAN");
    expect(screen.getByRole("button", { name: "月亮" })).toBeTruthy();
  });
});
