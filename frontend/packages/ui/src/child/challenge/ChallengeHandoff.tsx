import { useEffect, useRef } from "react";
import { Button, Text, View } from "@tarojs/components";
import type { HandoffTarget } from "@cc/domain";
import { tokens } from "../../tokens";

export interface ChallengeHandoffProps {
  target: HandoffTarget;
  onContinue(): void;
}

// 交接徽章：柔光圆盘 + 亲子握手意象 + 悬挂标签
function HandoffBadge({
  icon,
  corner,
  tagBg,
  tagColor,
  tagLabel,
}: {
  icon: string;
  corner: string;
  tagBg: string;
  tagColor: string;
  tagLabel: string;
}) {
  return (
    <View
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: tokens.space[4],
      }}
    >
      <Text
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 96,
          height: 96,
          borderRadius: tokens.radius.pill,
          background: tokens.gradient.warmIcon,
          border: `4px solid ${tokens.bg.surface}`,
          boxShadow: tokens.shadow.card,
          fontSize: 44,
        }}
      >
        {icon}
      </Text>
      <Text
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -2,
          right: 4,
          fontSize: 22,
        }}
      >
        {corner}
      </Text>
      <Text
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: -10,
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          padding: `2px ${tokens.space[2]}px`,
          borderRadius: tokens.radius.pill,
          background: tagBg,
          color: tagColor,
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {tagLabel}
      </Text>
    </View>
  );
}

export function ChallengeHandoff({
  target,
  onContinue,
}: ChallengeHandoffProps) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const startHold = () => {
    if (holdTimer.current !== null) return;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      onContinue();
    }, 2_000);
  };
  const browserHoldHandlers = {
    onMouseDown: startHold,
    onMouseUp: cancelHold,
    onMouseLeave: cancelHold,
  } as Record<string, unknown>;

  useEffect(() => cancelHold, []);

  if (target === "RESULT") {
    return (
      <View style={{ textAlign: "center", color: tokens.color.text }}>
        <HandoffBadge
          icon="🤝"
          corner="🏆"
          tagBg="#fdf1dd"
          tagColor={tokens.color.currentStrong}
          tagLabel="交接时刻"
        />
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[3],
            fontSize: tokens.fontSize.lg,
            fontWeight: 800,
          }}
        >
          把设备交给小朋友，一起看结果
        </Text>
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[2],
            color: tokens.color.textSoft,
            fontSize: tokens.fontSize.sm,
            lineHeight: 1.6,
          }}
        >
          亲子挑战已顺利完成，凑近屏幕一起开箱战绩吧！
        </Text>

        {/* 神秘奖章预告卡 */}
        <View
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: tokens.space[3],
            marginTop: tokens.space[4],
            padding: tokens.space[3],
            borderRadius: tokens.radius.card,
            background: tokens.bg.surface,
            border: "1px solid #efe6d0",
            boxShadow: tokens.shadow.card,
            textAlign: "left",
          }}
        >
          <View style={{ display: "flex", alignItems: "center", gap: tokens.space[3] }}>
            <Text
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: tokens.radius.md + 4,
                background: "#fff0dc",
                fontSize: 20,
              }}
            >
              🎁
            </Text>
            <View>
              <Text style={{ display: "block", fontSize: tokens.fontSize.sm, fontWeight: 800 }}>
                神秘小奖章已准备就绪
              </Text>
              <Text
                style={{
                  display: "block",
                  marginTop: 2,
                  color: tokens.color.textSoft,
                  fontSize: 11,
                }}
              >
                看看今天谁更有默契、答得更快
              </Text>
            </View>
          </View>
          <Text
            style={{
              flexShrink: 0,
              padding: `2px ${tokens.space[2]}px`,
              borderRadius: tokens.radius.md,
              background: "#fdf1dd",
              color: tokens.color.currentStrong,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            待解锁
          </Text>
        </View>

        <Button
          aria-label="一起看结果"
          onClick={onContinue}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            minHeight: 64,
            margin: `${tokens.space[4]}px 0 0`,
            border: "none",
            borderRadius: tokens.radius.xl,
            background: tokens.gradient.cta,
            boxShadow: tokens.shadow.kidBtn,
            color: tokens.bg.surface,
            fontSize: tokens.fontSize.md,
            fontWeight: 800,
            letterSpacing: 1,
          }}
        >
          一起看结果
          <Text aria-hidden="true" style={{ marginLeft: 6 }}>
            🎉
          </Text>
        </Button>
      </View>
    );
  }

  return (
    <View style={{ textAlign: "center", color: tokens.color.text }}>
      <HandoffBadge
        icon="🤝"
        corner="⭐"
        tagBg="#2d473e"
        tagColor="#fff9e6"
        tagLabel="🔒 成绩封存中"
      />
      <Text
        style={{
          display: "block",
          marginTop: tokens.space[3],
          fontSize: tokens.fontSize.lg,
          fontWeight: 800,
        }}
      >
        小朋友回合完成！
      </Text>
      <Text
        style={{
          display: "block",
          marginTop: tokens.space[2],
          color: tokens.color.textSoft,
          fontSize: tokens.fontSize.sm,
          lineHeight: 1.6,
        }}
      >
        成绩已经藏好啦 🎁，快把手机交给家长，准备同台对决吧！
      </Text>

      {/* 阶段战况概览卡 */}
      <View
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space[3],
          marginTop: tokens.space[4],
          padding: tokens.space[3],
          borderRadius: tokens.radius.card,
          background: "#f8f4ea",
          border: "1px solid #eae1cf",
          textAlign: "left",
        }}
      >
        <Text
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: tokens.radius.md + 4,
            background: tokens.bg.surface,
            border: "1px solid #e2d5bc",
            fontSize: 20,
          }}
        >
          📜
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ display: "block", fontSize: 12, fontWeight: 800 }}>
            第一阶段：小朋友初试完成
          </Text>
          <Text
            style={{
              display: "block",
              marginTop: 2,
              color: tokens.color.textSoft,
              fontSize: 11,
            }}
          >
            小朋友作答极速又专注，接下来看家长的了！
          </Text>
        </View>
      </View>

      {/* 长按蓄力开始按钮：呼吸波纹 + 防误触提示 */}
      <View style={{ position: "relative", marginTop: tokens.space[4] }}>
        <Button
          aria-label="家长长按 2 秒开始"
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          onTouchCancel={cancelHold}
          {...browserHoldHandlers}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            minHeight: 64,
            margin: 0,
            border: "none",
            borderRadius: tokens.radius.xl,
            background: tokens.gradient.cta,
            boxShadow: tokens.shadow.kidBtn,
            color: tokens.bg.surface,
            fontSize: tokens.fontSize.md,
            fontWeight: 800,
            letterSpacing: 1,
            userSelect: "none",
          }}
        >
          <Text aria-hidden="true" style={{ marginRight: 6 }}>
            👆
          </Text>
          家长长按 2 秒开始
        </Button>
      </View>
      <Text
        style={{
          display: "block",
          marginTop: tokens.space[3],
          color: tokens.color.textSoft,
          fontSize: 12,
        }}
      >
        长按蓄力启动，给家长交接及准备时间
      </Text>
    </View>
  );
}
