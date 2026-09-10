import { Text, View } from "@tarojs/components";
import type { ReactNode } from "react";
import { tokens } from "../tokens";

export interface InkBackgroundProps {
  children?: ReactNode;
  decor?: boolean;
}

/** 宣纸/水墨古典底：米白宣纸底 + 诗/词/成/语四馆点缀（黛青、朱砂）。 */
const decorationColors = {
  诗: tokens.color.poem,
  词: tokens.color.indigo,
  成: tokens.color.idiom,
  语: tokens.color.vermilion,
} as const;

export function InkBackground({
  children,
  decor = true,
}: InkBackgroundProps) {
  return (
    <View
      style={{
        position: "relative",
        minHeight: "100%",
        overflow: "hidden",
        backgroundColor: tokens.bg.page,
      }}
    >
      {decor ? (
        <View
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: `${tokens.space[3]}px ${tokens.space[4]}px`,
          }}
        >
          {tokens.bg.decor.map((decoration) => (
            <Text
              key={decoration}
              aria-label="ink-decor"
              style={{
                color: decorationColors[decoration],
                fontSize: tokens.fontSize.md,
                fontWeight: 700,
              }}
            >
              {decoration}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={{ position: "relative" }}>{children}</View>
    </View>
  );
}
