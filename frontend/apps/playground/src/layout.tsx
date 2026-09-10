/// <reference path="../../../packages/ui/src/taro-components.d.ts" />

import type { CSSProperties, ReactNode } from "react";
import {
  InkBackground,
  defaultTheme,
  mascotVM,
  tokens,
} from "@cc/ui";
import { useAppState } from "./session-state";

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 480,
  minHeight: "100vh",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  boxShadow: "0 0 24px rgba(34, 49, 43, 0.08)",
};

const statusStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: tokens.control.backSize,
  padding: `${tokens.space[2]}px ${tokens.space[4]}px`,
  backgroundColor: tokens.bg.surface,
  color: tokens.color.text,
};

const bodyStyle: CSSProperties = {
  flex: 1,
  padding: tokens.space[4],
  boxSizing: "border-box",
};

export interface PageShellProps {
  title?: string;
  topRight?: ReactNode;
  decor?: boolean;
  variant?: "default" | "question";
  children: ReactNode;
}

export function PageShell({
  title,
  topRight,
  decor = true,
  variant = "default",
  children,
}: PageShellProps) {
  const app = useAppState();
  return (
    <InkBackground decor={decor}>
      <div style={shellStyle}>
        {variant === "default" ? (
          <div aria-label="学习状态" style={statusStyle}>
            <span style={{ fontSize: tokens.fontSize.lg }}>
              {mascotVM("idle").emoji}
            </span>
            <span style={{ marginLeft: tokens.space[2], fontWeight: 700 }}>
              {`星星 ${app.progression.lifetimeXp}`}
            </span>
            {title ? (
              <span
                style={{
                  marginLeft: tokens.space[3],
                  color: tokens.color.textSoft,
                  fontSize: tokens.fontSize.sm,
                }}
              >
                {title}
              </span>
            ) : null}
            <div style={{ flex: 1 }} />
            {topRight}
          </div>
        ) : null}
        <div style={bodyStyle}>{children}</div>
      </div>
    </InkBackground>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginBottom: tokens.space[4],
        padding: tokens.space[4],
        border: `1px solid ${tokens.color.locked}`,
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.bg.surface,
      }}
    >
      {children}
    </div>
  );
}

export interface PrimaryButtonProps {
  children: ReactNode;
  onClick(): void;
  disabled?: boolean;
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: tokens.control.optionMinHeight,
        border: "none",
        borderRadius: tokens.radius.md,
        backgroundColor: disabled
          ? tokens.color.locked
          : defaultTheme.color.primary,
        color: disabled ? tokens.color.textSoft : tokens.bg.surface,
        fontSize: defaultTheme.fontSize.md,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}
