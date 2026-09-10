import { Button, View } from "@tarojs/components";
import { tokens } from "../tokens";

export interface QuestionBackButtonProps {
  busy?: boolean;
  onBack(): void;
}

export function QuestionBackButton({
  busy = false,
  onBack,
}: QuestionBackButtonProps) {
  return (
    <Button
      aria-label="返回学习路线"
      disabled={busy}
      onClick={() => {
        if (!busy) onBack();
      }}
      style={{
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: tokens.control.backSize,
        height: tokens.control.backSize,
        minWidth: tokens.control.backSize,
        margin: 0,
        padding: 0,
        border: `2px solid ${tokens.color.locked}`,
        borderRadius: "50%",
        background: tokens.bg.surface,
        color: tokens.color.text,
        fontSize: tokens.fontSize.lg,
        fontWeight: 800,
      }}
    >
      <View
        data-back-arrow="true"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        ←
      </View>
    </Button>
  );
}
