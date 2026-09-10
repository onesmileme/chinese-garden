# 古文乐园 · 产品与内容方案

> 状态:草案(评审中) · 版本:v0.1 · 日期:2026-09-09
> 目标用户:以成人/传统文化爱好者为主,向下兼容小学生
> 核心定位:**传统文化鉴赏 + 益智游戏**(而非 K12 学科培训)

## 1. 背景与目标

在 `child_edu/chinese-garden` 下新建独立小程序「古文乐园」,聚焦 **古诗词** 与 **成语** 两大传统文化内容,玩法参考 `child-chinese`,但:

- **剥离 K12 内容**:去掉识字/拼音/声调等"教材同步"性质内容,规避小程序平台对"面向未成年人学科培训"的审核限制。
- **交互偏成人**:视觉、文案、玩法深度面向成人;通过"注音开关 / 大字模式 / 提示"兼容小学生。
- **复用底座**:Fork `child-chinese` 的前端 monorepo 与 Java/Spring 后端,做减法与皮肤替换。

## 2. 过审策略(核心约束)

| 维度 | child-chinese(原) | 古文乐园(新) |
|---|---|---|
| 产品叙事 | 幼小衔接 / 今日学习 / 闯关 | 诗词馆 / 成语馆 / 鉴赏 · 游戏 |
| 内容 | 识字(汉字)+拼音+诗词+成语 | **仅诗词 + 成语** |
| 题型 | CHAR_TO_PINYIN / CHAR_TO_TONE / POEM_FILL / IDIOM_CHAIN | **仅 POEM_FILL / IDIOM_CHAIN + 新增鉴赏类** |
| 课程结构 | curriculum-v1(按主题教识字) | 无教学大纲,改为"馆藏浏览 + 游戏" |
| 目标用户措辞 | 5-7 岁儿童 | 传统文化爱好者(全年龄) |

**必须移除**:`Character`/`characterSchema`、`CHAR_TO_PINYIN`/`CHAR_TO_TONE`、`PINYIN` 维度、`pinyin-practice` 页面、`CharToPinyin`/`CharToTone` 组件、`character-bank.json`/`characters-*.json`、`content/raw/unihan`、`curriculum-v1.json`(K12 识字课程图)、以及"能力评估解锁/每日闯关/掌握度课程"叙事(可保留为可选的"练习进度",但不作为主线)。

**保留并强化**:古诗词、成语内容与游戏化交互。

## 3. 内容盘点(源自 child-chinese)

- 诗词 `poem-bank.json`:约 23 首(静夜思、咏鹅、相思、鹿柴、绝句、早发白帝城…),原文依据公有领域点校本,儿童向释义自撰。
- 成语 `idiom-bank.json`:约 47 条(一心一意、意气风发…),含 `headPinyin/tailPinyin` 供接龙。
- 判题契约(须保留,后端复算):
  - `POEM_FILL` 权威串 `serializePoemFill`:`index=字|index=字`
  - 成语接龙首尾匹配:`candidate.headPinyin === source.tailPinyin`
  - 种子 RNG:`makeSeededRng` 种子格式 `${type}:${kpId}:${seed}`

> 注:`POEM_FILL` 候选字仅取自诗句本身,**不依赖 character-bank**,因此移除识字模块不影响诗词填空。

## 4. 内容模型升级(向后兼容,新增字段可选)

面向成人需要"有深度",面向小学生需要"可降级"。在原 schema 上**扩展可选字段**:

### 诗词 Poem(扩展)
| 字段 | 类型 | 说明 | 面向 |
|---|---|---|---|
| dynasty | string? | 朝代(唐/宋…) | 成人 |
| genre | string? | 体裁(五绝/七律/词牌…) | 成人 |
| pinyin | string[]? | 整篇注音(按行),可开关 | 小学生 |
| translation | string? | 白话译文 | 兼容 |
| annotations | {char,note}[]? | 重点字词注释 | 成人 |
| appreciation | string? | 赏析/名句点评 | 成人 |
| tags | string[] | 主题(思乡/边塞/山水…) | 全 |

### 成语 Idiom(扩展)
| 字段 | 类型 | 说明 | 面向 |
|---|---|---|---|
| pinyin | string? | 完整带调拼音(展示) | 兼容 |
| origin | string? | 出处/典故 | 成人 |
| example | string? | 例句 | 兼容 |
| synonyms | string[]? | 近义 | 成人 |
| antonyms | string[]? | 反义 | 成人 |
| tags | string[] | 主题/难度标签 | 全 |

> `charRefs` 由必填改为可选(去 K12 后无强绑定汉字知识点)。

## 5. 玩法方案(首期:复用 2 + 各馆新增 2)

### 🀄 诗词馆
1. **名句填空** `POEM_FILL`(复用):挖 2–3 字,选字填入。
2. **上下句连连看**(新增):给上句,从 4 个选项选下句。成人向,轻量。
3. 每日一诗 + 赏析卡(阅读向,非题目;利用扩展的 translation/appreciation)。

### 📿 成语馆
1. **成语接龙** `IDIOM_CHAIN`(复用):拼出后继成语。
2. **释义辨析**(新增):成语 → 正确释义(4 选 1),干扰项取自其它成语释义。
3. 成语典故卡(阅读向;利用 origin/example)。

> 首期确定的新增题型:诗词「上下句连连看」+ 成语「释义辨析」。飞花令、典故猜成语、成语填字等列入二期 backlog。

### 难度分层(复用现有机制)
- **初级(小学生)**:大字、可开注音、提示、`difficulty ≤ 2`。
- **进阶(成人)**:含典故/赏析、计时、`difficulty ≥ 3`。
- 复用 `IdiomPracticeLevel = BEGINNER | ADVANCED` 与 `abilityLevel`。

## 6. UX 方向

- 视觉:糖果风 `CandyBackground` → **水墨/宣纸古典风**(米白宣纸底、黛青、朱砂点缀),新建 `tokens`。
- 保留大点击热区(≥64px)、温和反馈、可选注音——兼容小学生易用性。
- 导航:书院式"诗词馆 / 成语馆",弱化卡通吉祥物与闯关地图。
- 文案:去童趣化,偏典雅(如"雅集""对句""接龙")。

## 7. 首期范围(MVP)

- ✅ 诗词馆:名句填空 + 上下句连连看
- ✅ 成语馆:成语接龙 + 释义辨析
- ✅ 古典皮肤 tokens
- ✅ 内容扩展字段(诗词译文/赏析、成语典故)
- ✅ 完整复用后端(账号/答题记录/服务端判题/内容发布)
- ⏭️ 二期:飞花令、典故猜成语、成语填字、亲子挑战(去拼音维度)
