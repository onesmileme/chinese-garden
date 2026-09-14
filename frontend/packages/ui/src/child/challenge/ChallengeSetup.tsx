import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Text, View } from "@tarojs/components";
import type {
  ChallengeDimension,
  ChallengeMode,
  ParentTier,
} from "@cc/domain";
import { tokens } from "../../tokens";

type SetupStep = "DIMENSION" | "MODE" | "TIER" | "CONFIRM";

export interface ChallengeSetupSelection {
  dimension: ChallengeDimension;
  mode: ChallengeMode;
  tier: ParentTier;
}

export interface ChallengeSetupProps {
  /** 目标难度下可出题的维度（非空）；不可用维度会被禁用。 */
  availableDimensions: readonly ChallengeDimension[];
  initialDimension?: ChallengeDimension;
  initialMode?: ChallengeMode;
  initialTier?: ParentTier;
  onCancel?(): void;
  onStart(selection: ChallengeSetupSelection): void;
}

// 糖果童趣配色：暖橙品牌色贯穿步骤徽章、选中卡片与主行动按钮。
const BRAND = tokens.color.current;
const BRAND_STRONG = tokens.color.currentStrong;
const SELECTED_BG = "#fdf5e8";
const CARD_BORDER = "rgba(234, 169, 60, 0.22)";
const NOTE_BG = "#f6efe3";
const NOTE_BORDER = "#ecdcb9";

const DIMENSION_LABEL: Record<ChallengeDimension, string> = {
  POEM: "诗词世界",
  IDIOM: "成语世界",
};

interface WorldSpec {
  key: ChallengeDimension;
  icon: string;
  subtitle: string;
  tags: readonly string[];
  recommended?: boolean;
}

const WORLDS: readonly WorldSpec[] = [
  {
    key: "POEM",
    icon: "🪷",
    subtitle: "唐诗宋词 · 经典名篇对韵",
    tags: ["📚 部编教材同步", "👨‍👩‍👧 亲子共读", "🎯 飞花令"],
    recommended: true,
  },
  {
    key: "IDIOM",
    icon: "🐉",
    subtitle: "智慧成语 · 典故探秘接龙",
    tags: ["💡 妙语连珠", "🧩 思维拓展", "📖 典故溯源"],
  },
];

interface ModeSpec {
  key: ChallengeMode;
  title: string;
  icon: string;
  chip: string;
  line1: string;
  line2: string;
  recommended?: boolean;
}

const MODES: readonly ModeSpec[] = [
  {
    key: "TIMED",
    title: "限时答题模式",
    icon: "⏳",
    chip: "超刺激",
    line1: "每人 60 秒极速轮流回答",
    line2: "紧张刺激 · 考验反应力与记忆配合",
    recommended: true,
  },
  {
    key: "FIXED_RACE",
    title: "固定题量竞速",
    icon: "📜",
    chip: "更从容",
    line1: "每人 10 题对决 · 比比谁更准",
    line2: "沉着思考 · 稳扎稳打零失误胜出",
  },
];

interface TierSpec {
  key: ParentTier;
  title: string;
  levelBadge: string;
  hot?: boolean;
  stars: number;
  starLabel: string;
  desc: string;
  tags: readonly { label: string; strong?: boolean; danger?: boolean }[];
  recommended?: boolean;
}

const TIERS: readonly TierSpec[] = [
  {
    key: "STANDARD",
    title: "标准挑战",
    levelBadge: "L4 为主",
    stars: 3,
    starLabel: "难度适中",
    desc: "涵盖常见成语拼图、经典五绝七律选字填空。难度恰好，适合与小朋友势均力敌、拉扯比拼。",
    tags: [
      { label: "成语常用字" },
      { label: "必背古诗词" },
      { label: "常规答题时限", strong: true },
    ],
    recommended: true,
  },
  {
    key: "EXPERT",
    title: "高手挑战",
    levelBadge: "L5 为主",
    hot: true,
    stars: 5,
    starLabel: "烧脑高难",
    desc: "含生僻典故、隐喻字谜与高难度名篇断句。大幅压缩答题时间，家长稍有疏忽就可能输给宝贝！",
    tags: [
      { label: "深度生僻字" },
      { label: "长篇连句" },
      { label: "答题倒计时减半", danger: true },
    ],
  },
];

const STEP_META: Record<
  Exclude<SetupStep, "CONFIRM">,
  { badge: string; progress: number }
> = {
  DIMENSION: { badge: "步骤 1 / 3", progress: 1 / 3 },
  MODE: { badge: "步骤 2 / 3", progress: 2 / 3 },
  TIER: { badge: "步骤 3 / 3", progress: 1 },
};

function StepHeader({ step }: { step: Exclude<SetupStep, "CONFIRM"> }) {
  const meta = STEP_META[step];
  return (
    <View>
      <View
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: `${tokens.space[1]}px ${tokens.space[3]}px`,
          borderRadius: tokens.radius.pill,
          background: "#fdf1dd",
          color: BRAND_STRONG,
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        <Text
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: tokens.radius.pill,
            background: BRAND,
          }}
        />
        {meta.badge}
      </View>
      <View
        style={{
          height: 6,
          marginTop: tokens.space[3],
          overflow: "hidden",
          borderRadius: tokens.radius.pill,
          background: "#ecdcbf",
        }}
      >
        <View
          data-setup-progress="true"
          style={{
            width: `${meta.progress * 100}%`,
            height: "100%",
            borderRadius: tokens.radius.pill,
            background: tokens.gradient.questionProgress,
          }}
        />
      </View>
    </View>
  );
}

function TitleBlock({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={{ marginTop: tokens.space[4] }}>
      {eyebrow ? (
        <Text
          style={{
            display: "block",
            marginBottom: tokens.space[1],
            color: BRAND_STRONG,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1,
          }}
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        style={{ display: "block", fontSize: tokens.fontSize.lg, fontWeight: 800 }}
      >
        {title}
      </Text>
      <Text
        style={{
          display: "block",
          marginTop: tokens.space[1],
          color: tokens.color.textSoft,
          fontSize: tokens.fontSize.sm,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

function Indicator({ selected }: { selected: boolean }) {
  return (
    <Text
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        flexShrink: 0,
        borderRadius: tokens.radius.pill,
        border: selected ? "none" : `2px solid ${tokens.color.locked}`,
        background: selected ? BRAND : "transparent",
        color: tokens.bg.surface,
        fontSize: 14,
        fontWeight: 800,
      }}
    >
      {selected ? "✓" : ""}
    </Text>
  );
}

function Chip({
  children,
  bg,
  color,
  border,
}: {
  children: string;
  bg: string;
  color: string;
  border?: string;
}) {
  return (
    <Text
      style={{
        display: "inline-block",
        padding: `2px ${tokens.space[2]}px`,
        borderRadius: tokens.radius.sm + 2,
        background: bg,
        color,
        border: border ? `1px solid ${border}` : "none",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Text>
  );
}

function SelectCard({
  selected,
  disabled,
  ariaLabel,
  onPick,
  children,
  recommended,
}: {
  selected: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onPick(): void;
  children: ReactNode;
  recommended?: string;
}) {
  return (
    <Button
      aria-label={ariaLabel}
      aria-pressed={selected}
      disabled={disabled ?? false}
      onClick={onPick}
      style={{
        position: "relative",
        width: "100%",
        minHeight: 64,
        margin: 0,
        padding: tokens.space[4],
        border: selected ? `2px solid ${BRAND}` : `2px solid ${CARD_BORDER}`,
        borderRadius: tokens.radius.xl,
        background: disabled
          ? "#f1f4f2"
          : selected
            ? SELECTED_BG
            : tokens.bg.surface,
        boxShadow: disabled ? "none" : tokens.shadow.card,
        color: tokens.color.text,
        textAlign: "left",
        opacity: disabled ? 0.7 : 1,
        overflow: "hidden",
      }}
    >
      {recommended ? (
        <Text
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            padding: `2px ${tokens.space[2]}px`,
            borderBottomLeftRadius: tokens.radius.md + 4,
            background: tokens.gradient.cta,
            color: tokens.bg.surface,
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {recommended}
        </Text>
      ) : null}
      {children}
    </Button>
  );
}

function IconBadge({
  icon,
  active,
}: {
  icon: string;
  active?: boolean;
}) {
  return (
    <Text
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 48,
        height: 48,
        flexShrink: 0,
        borderRadius: tokens.radius.md + 4,
        background: active ? tokens.gradient.warmIcon : "#fff4e0",
        fontSize: 26,
      }}
    >
      {icon}
    </Text>
  );
}

function PrimaryButton({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint?: string;
  onClick(): void;
}) {
  return (
    <Button
      aria-label={label}
      onClick={onClick}
      style={{
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
      }}
    >
      {label}
      {hint ? (
        <Text style={{ marginLeft: 6, fontSize: tokens.fontSize.sm, fontWeight: 600, opacity: 0.9 }}>
          {hint}
        </Text>
      ) : null}
      <Text aria-hidden="true" style={{ marginLeft: 6 }}>
        →
      </Text>
    </Button>
  );
}

function SecondaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick(): void;
}) {
  return (
    <Button
      aria-label={label}
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: 44,
        margin: 0,
        border: "none",
        background: "transparent",
        color: tokens.color.textSoft,
        fontSize: tokens.fontSize.sm,
        fontWeight: 700,
      }}
    >
      {label}
    </Button>
  );
}

function NoteCard({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <View
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: tokens.space[2],
        marginTop: tokens.space[4],
        padding: tokens.space[3],
        borderRadius: tokens.radius.card,
        background: NOTE_BG,
        border: `1px solid ${NOTE_BORDER}`,
      }}
    >
      <Text aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>
        {icon}
      </Text>
      <Text
        style={{
          flex: 1,
          color: tokens.color.textSoft,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <Text aria-hidden="true" style={{ color: BRAND, fontSize: 14, letterSpacing: 1 }}>
      {"★".repeat(count)}
      <Text style={{ color: tokens.color.locked }}>{"★".repeat(5 - count)}</Text>
    </Text>
  );
}

export function ChallengeSetup({
  availableDimensions,
  initialDimension,
  initialMode = "TIMED",
  initialTier = "STANDARD",
  onCancel,
  onStart,
}: ChallengeSetupProps) {
  const firstAvailable = availableDimensions[0]!;
  const [step, setStep] = useState<SetupStep>("DIMENSION");
  const [dimension, setDimension] = useState<ChallengeDimension>(
    initialDimension && availableDimensions.includes(initialDimension)
      ? initialDimension
      : firstAvailable,
  );
  const [mode, setMode] = useState<ChallengeMode>(initialMode);
  const [tier, setTier] = useState<ParentTier>(initialTier);

  const back = () => {
    setStep(
      step === "CONFIRM" ? "TIER" : step === "TIER" ? "MODE" : "DIMENSION",
    );
  };

  const advance = () => {
    if (step === "DIMENSION") setStep("MODE");
    else if (step === "MODE") setStep("TIER");
    else setStep("CONFIRM");
  };

  return (
    <View style={{ color: tokens.color.text }}>
      {step === "DIMENSION" ? (
        <DimensionStep
          availableDimensions={availableDimensions}
          dimension={dimension}
          onPick={setDimension}
        />
      ) : step === "MODE" ? (
        <ModeStep mode={mode} onPick={setMode} />
      ) : step === "TIER" ? (
        <TierStep tier={tier} onPick={setTier} />
      ) : (
        <ConfirmStep dimension={dimension} mode={mode} tier={tier} />
      )}

      <View
        style={{
          display: "grid",
          gap: tokens.space[2],
          marginTop: tokens.space[5],
        }}
      >
        {step === "DIMENSION" ? (
          <PrimaryButton label="下一步" onClick={advance} />
        ) : step === "MODE" ? (
          <PrimaryButton label="下一步：进入准备" onClick={advance} />
        ) : step === "TIER" ? (
          <PrimaryButton label="完成设置，前往对战" onClick={advance} />
        ) : (
          <PrimaryButton
            label="小朋友先来"
            hint="（开启第一轮）"
            onClick={() => onStart({ dimension, mode, tier })}
          />
        )}
        {step === "DIMENSION" ? (
          onCancel ? (
            <SecondaryButton label="取消挑战" onClick={onCancel} />
          ) : null
        ) : (
          <SecondaryButton
            label={
              step === "MODE"
                ? "返回上一步重选世界"
                : step === "TIER"
                  ? "返回上一步修改规则"
                  : "返回上一步修改难度"
            }
            onClick={back}
          />
        )}
      </View>
    </View>
  );
}

function DimensionStep({
  availableDimensions,
  dimension,
  onPick,
}: {
  availableDimensions: readonly ChallengeDimension[];
  dimension: ChallengeDimension;
  onPick(next: ChallengeDimension): void;
}) {
  return (
    <View>
      <StepHeader step="DIMENSION" />
      <TitleBlock
        title="选择挑战世界 📜"
        subtitle="挑一个知识天地，开启默契趣味对决吧"
      />
      <View
        style={{ display: "grid", gap: tokens.space[3], marginTop: tokens.space[4] }}
      >
        {WORLDS.map((world) => {
          const selected = dimension === world.key;
          const disabled = !availableDimensions.includes(world.key);
          return (
            <SelectCard
              key={world.key}
              ariaLabel={DIMENSION_LABEL[world.key]}
              selected={selected}
              disabled={disabled}
              onPick={() => onPick(world.key)}
            >
              <View
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: tokens.space[3],
                }}
              >
                <View
                  style={{ display: "flex", alignItems: "center", gap: tokens.space[3] }}
                >
                  <IconBadge icon={world.icon} active={selected} />
                  <View>
                    <View style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: tokens.fontSize.md, fontWeight: 800 }}>
                        {DIMENSION_LABEL[world.key]}
                      </Text>
                      {world.recommended ? (
                        <Chip bg="#fbe6c2" color={BRAND_STRONG}>
                          推荐
                        </Chip>
                      ) : null}
                    </View>
                    <Text
                      style={{
                        display: "block",
                        marginTop: 2,
                        color: tokens.color.textSoft,
                        fontSize: tokens.fontSize.sm,
                      }}
                    >
                      {world.subtitle}
                    </Text>
                  </View>
                </View>
                <Indicator selected={selected} />
              </View>
              <View
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: tokens.space[3],
                  paddingTop: tokens.space[2],
                  borderTop: "1px solid #f1ece0",
                }}
              >
                {world.tags.map((tag) => (
                  <Chip key={tag} bg="#fffaf0" color={tokens.color.textSoft} border="#f1e3c6">
                    {tag}
                  </Chip>
                ))}
              </View>
            </SelectCard>
          );
        })}
        <View
          style={{
            padding: tokens.space[4],
            border: `1px dashed ${tokens.color.locked}`,
            borderRadius: tokens.radius.xl,
            background: "#f5f3ee",
            opacity: 0.75,
          }}
        >
          <View
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: tokens.space[3],
            }}
          >
            <View style={{ display: "flex", alignItems: "center", gap: tokens.space[3] }}>
              <Text
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  borderRadius: tokens.radius.md + 4,
                  background: "#eceae4",
                  fontSize: 24,
                }}
              >
                🏛️
              </Text>
              <View>
                <View style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: tokens.fontSize.md, fontWeight: 800, color: "#7a746a" }}>
                    文学与常识
                  </Text>
                  <Chip bg="#e4e1d9" color="#7a746a">
                    即将开启
                  </Chip>
                </View>
                <Text
                  style={{
                    display: "block",
                    marginTop: 2,
                    color: "#a49d90",
                    fontSize: tokens.fontSize.sm,
                  }}
                >
                  历史文脉 · 名家名著百宝箱
                </Text>
              </View>
            </View>
            <Text aria-hidden="true" style={{ fontSize: 18, color: "#a49d90" }}>
              🔒
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ModeStep({
  mode,
  onPick,
}: {
  mode: ChallengeMode;
  onPick(next: ChallengeMode): void;
}) {
  return (
    <View>
      <StepHeader step="MODE" />
      <TitleBlock
        title="选择挑战规则"
        subtitle="选择你们喜欢的对战与挑战方式，陪伴共度趣味时光"
      />
      <View
        style={{ display: "grid", gap: tokens.space[3], marginTop: tokens.space[4] }}
      >
        {MODES.map((option) => {
          const selected = mode === option.key;
          return (
            <SelectCard
              key={option.key}
              ariaLabel={option.title}
              selected={selected}
              onPick={() => onPick(option.key)}
              {...(option.recommended ? { recommended: "🔥 推荐模式" } : {})}
            >
              <View
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: tokens.space[3],
                }}
              >
                <IconBadge icon={option.icon} active={selected} />
                <View style={{ flex: 1 }}>
                  <View style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: tokens.fontSize.md, fontWeight: 800 }}>
                      {option.title}
                    </Text>
                    <Chip
                      bg={selected ? "#fdf1dd" : "#efece5"}
                      color={selected ? BRAND_STRONG : tokens.color.textSoft}
                    >
                      {option.chip}
                    </Chip>
                  </View>
                  <Text
                    style={{
                      display: "block",
                      marginTop: tokens.space[1],
                      fontSize: tokens.fontSize.sm,
                      fontWeight: 700,
                    }}
                  >
                    {option.line1}
                  </Text>
                  <Text
                    style={{
                      display: "block",
                      marginTop: 2,
                      color: tokens.color.textSoft,
                      fontSize: 12,
                    }}
                  >
                    {`● ${option.line2}`}
                  </Text>
                </View>
                <Indicator selected={selected} />
              </View>
            </SelectCard>
          );
        })}
      </View>
      <NoteCard icon="👨‍👩‍👧">
        <Text style={{ fontWeight: 800, color: tokens.color.text }}>亲子互动贴士：</Text>
        小朋友与家长使用同一台手机轮流答题，一人答题时另一人认真计时并加油鼓劲哦！
      </NoteCard>
    </View>
  );
}

function TierStep({
  tier,
  onPick,
}: {
  tier: ParentTier;
  onPick(next: ParentTier): void;
}) {
  return (
    <View>
      <StepHeader step="TIER" />
      <TitleBlock
        eyebrow="公平竞技 · 关爱让步"
        title="选择家长难度"
        subtitle="给大人一点小挑战，让对决更具悬念、孩子更有成就感！"
      />
      <View
        style={{ display: "grid", gap: tokens.space[3], marginTop: tokens.space[4] }}
      >
        {TIERS.map((option) => {
          const selected = tier === option.key;
          return (
            <SelectCard
              key={option.key}
              ariaLabel={option.title}
              selected={selected}
              onPick={() => onPick(option.key)}
              {...(option.recommended ? { recommended: "★ 平衡推荐" } : {})}
            >
              <View
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: tokens.space[3],
                }}
              >
                <View>
                  <View style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: tokens.fontSize.md, fontWeight: 800 }}>
                      {option.title}
                    </Text>
                    <Chip
                      bg={option.hot ? "#fdeceb" : "#fdf1dd"}
                      color={option.hot ? tokens.color.wrong : BRAND_STRONG}
                    >
                      {option.hot ? `🔥 ${option.levelBadge}` : option.levelBadge}
                    </Chip>
                  </View>
                  <View
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: tokens.space[1],
                    }}
                  >
                    <Stars count={option.stars} />
                    <Text style={{ color: tokens.color.textSoft, fontSize: 12 }}>
                      {option.starLabel}
                    </Text>
                  </View>
                </View>
                <Indicator selected={selected} />
              </View>
              <Text
                style={{
                  display: "block",
                  marginTop: tokens.space[2],
                  color: tokens.color.textSoft,
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {option.desc}
              </Text>
              <View
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: tokens.space[3],
                  paddingTop: tokens.space[2],
                  borderTop: "1px solid #f1ece0",
                }}
              >
                {option.tags.map((tag) => {
                  const danger = tag.danger;
                  const plain = !danger && !tag.strong;
                  return (
                    <Chip
                      key={tag.label}
                      bg={danger ? "#fdeceb" : tag.strong ? "#fdf1dd" : "#fbfaf6"}
                      color={
                        danger
                          ? tokens.color.wrong
                          : tag.strong
                            ? BRAND_STRONG
                            : tokens.color.textSoft
                      }
                      {...(plain ? { border: "#e7e1d3" } : {})}
                    >
                      {tag.label}
                    </Chip>
                  );
                })}
              </View>
            </SelectCard>
          );
        })}
      </View>
      <NoteCard icon="👶">
        <Text style={{ fontWeight: 800, color: tokens.color.text }}>
          小朋友已自动受保护：
        </Text>
        系统已匹配其当前学段专属题库（L1-L2 基础为主），并享有专属拼音提示与额外 5 秒思考保护！
      </NoteCard>
    </View>
  );
}

interface InfoRowData {
  icon: string;
  label: string;
  value: string;
  valueChip?: { text: string; danger?: boolean };
  sub?: string;
  chipValue?: boolean;
}

function ConfirmStep({
  dimension,
  mode,
  tier,
}: {
  dimension: ChallengeDimension;
  mode: ChallengeMode;
  tier: ParentTier;
}) {
  const rows: InfoRowData[] = [
    {
      icon: "📜",
      label: "挑战主题",
      value: DIMENSION_LABEL[dimension],
      sub: dimension === "POEM" ? "五言/七绝名篇填空" : "成语拼图 · 典故接龙",
    },
    {
      icon: "⏱️",
      label: "答题规则",
      value: mode === "TIMED" ? "每人 60 秒" : "每人 10 题",
      valueChip: { text: mode === "TIMED" ? "极速" : "竞速", danger: mode === "TIMED" },
      sub: mode === "TIMED" ? "倒计时耗尽即换对方" : "答对更多者胜出",
    },
    {
      icon: "⚖️",
      label: "难度平衡",
      value: tier === "STANDARD" ? "家长标准 (L4 为主)" : "家长高手 (L5 为主)",
      sub: "少儿自适应 L1-L2 匹配",
    },
    {
      icon: "🎁",
      label: "完成奖励",
      value: "+3 颗星星 · 默契徽章",
      chipValue: true,
    },
  ];

  return (
    <View>
      <View style={{ display: "flex", alignItems: "center", gap: 6, marginTop: tokens.space[2] }}>
        <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: 800 }}>准备开始！</Text>
        <Chip bg="#fdf1dd" color={BRAND_STRONG}>
          第 1 场
        </Chip>
      </View>
      <Text
        style={{
          display: "block",
          marginTop: tokens.space[1],
          color: tokens.color.textSoft,
          fontSize: tokens.fontSize.sm,
        }}
      >
        轮流答题比拼，看看今天谁更快更准 🎯
      </Text>

      <View
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space[2],
          marginTop: tokens.space[4],
          padding: tokens.space[4],
          borderRadius: tokens.radius.xl,
          background: tokens.bg.surface,
          border: `1px solid ${CARD_BORDER}`,
          boxShadow: tokens.shadow.card,
        }}
      >
        <Player
          icon="🧒"
          badge="先攻"
          badgeBg={BRAND}
          name="小朋友"
          note="专属少儿题库"
          avatarBg="linear-gradient(180deg, #ffe4c4, #fcd3a1)"
        />
        <View style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Text
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: tokens.radius.pill,
              background: tokens.gradient.cta,
              color: tokens.bg.surface,
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            VS
          </Text>
          <Text style={{ color: tokens.color.textSoft, fontSize: 10, fontWeight: 700 }}>
            友谊第一
          </Text>
        </View>
        <Player
          icon="🧑"
          badge="后答"
          badgeBg="#7e8b9b"
          name="家长"
          note={tier === "STANDARD" ? "标准挑战难度" : "高手挑战难度"}
          avatarBg="linear-gradient(180deg, #e2e8f0, #cbd5e1)"
        />
      </View>

      <View
        style={{
          marginTop: tokens.space[3],
          padding: tokens.space[4],
          borderRadius: tokens.radius.xl,
          background: tokens.bg.surface,
          border: `1px solid ${CARD_BORDER}`,
          boxShadow: tokens.shadow.card,
        }}
      >
        <View style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Text
            aria-hidden="true"
            style={{ width: 5, height: 14, borderRadius: tokens.radius.pill, background: BRAND }}
          />
          <Text
            style={{
              color: tokens.color.textSoft,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            对战规则配置
          </Text>
        </View>
        {rows.map((row, index) => (
          <InfoRow key={row.label} row={row} last={index === rows.length - 1} />
        ))}
      </View>

      <NoteCard icon="💡">
        答题时双方各执半边屏幕，点击后即刻进入首题，请做好准备！
      </NoteCard>
    </View>
  );
}

function Player({
  icon,
  badge,
  badgeBg,
  name,
  note,
  avatarBg,
}: {
  icon: string;
  badge: string;
  badgeBg: string;
  name: string;
  note: string;
  avatarBg: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: tokens.space[2],
        borderRadius: tokens.radius.card,
        background: "#faf7f2",
        border: "1px solid #f2eae0",
      }}
    >
      <View style={{ position: "relative", marginBottom: tokens.space[1] }}>
        <Text
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: tokens.radius.pill,
            background: avatarBg,
            border: `2px solid ${tokens.bg.surface}`,
            fontSize: 26,
          }}
        >
          {icon}
        </Text>
        <Text
          style={{
            position: "absolute",
            bottom: -4,
            right: -6,
            padding: "1px 6px",
            borderRadius: tokens.radius.pill,
            background: badgeBg,
            color: tokens.bg.surface,
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          {badge}
        </Text>
      </View>
      <Text style={{ fontSize: tokens.fontSize.sm, fontWeight: 800 }}>{name}</Text>
      <Text style={{ marginTop: 2, color: tokens.color.textSoft, fontSize: 11 }}>{note}</Text>
    </View>
  );
}

function InfoRow({ row, last }: { row: InfoRowData; last: boolean }) {
  return (
    <View
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: tokens.space[3],
        paddingTop: tokens.space[2],
        paddingBottom: tokens.space[2],
        borderBottom: last ? "none" : "1px solid #f4efe6",
      }}
    >
      <View style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}>
        <Text aria-hidden="true" style={{ fontSize: 16 }}>
          {row.icon}
        </Text>
        <Text style={{ color: tokens.color.textSoft, fontSize: tokens.fontSize.sm, fontWeight: 600 }}>
          {row.label}
        </Text>
      </View>
      <View style={{ textAlign: "right" }}>
        {row.chipValue ? (
          <Chip bg="#fdf1dd" color={BRAND_STRONG}>
            {row.value}
          </Chip>
        ) : (
          <View
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 4,
            }}
          >
            <Text style={{ fontSize: tokens.fontSize.sm, fontWeight: 800 }}>{row.value}</Text>
            {row.valueChip ? (
              <Chip
                bg={row.valueChip.danger ? "#fdeceb" : "#fdf1dd"}
                color={row.valueChip.danger ? tokens.color.wrong : BRAND_STRONG}
              >
                {row.valueChip.text}
              </Chip>
            ) : null}
          </View>
        )}
        {row.sub ? (
          <Text
            style={{
              display: "block",
              marginTop: 2,
              color: tokens.color.textSoft,
              fontSize: 11,
            }}
          >
            {row.sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
