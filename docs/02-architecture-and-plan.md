# 古文乐园 · 技术架构与实施计划

> 状态:草案(评审中) · 版本:v0.1 · 日期:2026-09-09
> 前置决策:目录 `chinese-garden`;**完整复用后端**;玩法**复用 2 种 + 各馆新增 2 种**;
> 包名/命名**保留**(`@cc/*`、`com.childedu` 不改);git 仓已就绪(`git@github.com:onesmileme/chinese-garden.git`);Corpus 三元组 characters **可选化**已确认。

## 1. 复用策略:Fork & Adapt

沿用「Fork & Adapt,保持仓库独立」模式。以 `child-chinese` 为蓝本,整仓复制到 `child_edu/chinese-garden` 后做**减法 + 皮肤替换 + 玩法扩展**,而非引用式依赖,保证独立演进。包名保留 `@cc/*`(前端)与 `com.childedu`(后端),以降低改动量。

### 目标目录结构
```
child_edu/chinese-garden/
├── docs/                          # 本设计文档集
├── frontend/                      # pnpm monorepo (Fork)
│   ├── apps/
│   │   ├── miniapp/               # Taro 3.6 + React 18 小程序「古文乐园」
│   │   └── playground/            # Vite 浏览器调试宿主 + 集成测试
│   ├── packages/
│   │   ├── content-schema/        # 去 Character,扩展 Poem/Idiom
│   │   ├── domain/                # 保留 POEM_FILL/IDIOM_CHAIN + 确定性 RNG;新增 2 题型
│   │   ├── application/           # 答题记录/会话/同步(精简)
│   │   ├── ui/                    # PoemFill/IdiomChain/QuestionFlow + 古典皮肤 + 2 新组件
│   │   ├── api-client/            # HTTP + Zod
│   │   └── content-cli/           # 制品打包/发布
│   └── content/                   # 仅 poem-bank / idiom-bank(扩展字段)
└── backend/                       # Java 21 / Spring Boot 3.3.4 / Modulith (Fork)
    ├── app/
    ├── modules/{shared-kernel,content,identity,learning,mastery,progression,sync,operations}
    └── pom.xml
```

## 2. 前端改造清单

### 2.1 content-schema(`packages/content-schema/src/question.ts`)
- **移除**:`Character`/`characterSchema`;`QuestionType` 中 `CHAR_TO_PINYIN`/`CHAR_TO_TONE`。
- **新增题型**:`POEM_MATCH_NEXT`(上下句连连看)、`IDIOM_MEANING`(释义辨析)。
  最终 `QuestionType = POEM_FILL | POEM_MATCH_NEXT | IDIOM_CHAIN | IDIOM_MEANING`。
- **扩展 Poem**:新增可选 `dynasty/genre/pinyin/translation/annotations/appreciation`;`charRefs` 改可选。
- **扩展 Idiom**:新增可选 `pinyin/origin/example/synonyms/antonyms`。

### 2.2 domain(`packages/domain`)
- **保留**:`questions/generate.ts` 的 `POEM_FILL`、`IDIOM_CHAIN` 分支;`deterministic-random.ts`;`idiom-chain.ts`;`poem-practice/`、`idiom-practice/create-round.ts`;`content/levels.ts`(调整 `Corpus` 三元组为 `{poems, idioms, characters?}`)。
- **移除**:`pinyin-practice/`;`generate.ts` 的拼音/声调分支(`TONE_ROWS`/`stripTone`/`applyTone`/`pinyinDistractorPool`)。
- **新增**:
  - `poem-match/` — `createPoemMatchRound` + `generateQuestion("POEM_MATCH_NEXT")`(给上句,4 选 1 下句;干扰项取自其它诗句)。
  - `idiom-meaning/` — `createIdiomMeaningRound` + `generateQuestion("IDIOM_MEANING")`(成语→释义,干扰项取自同难度其它成语 meaning)。
- **挑战维度**:`ChallengeDimension` 去掉 `PINYIN`,保留 `POEM | IDIOM`(二期启用挑战)。

### 2.3 application(`packages/application`)
- 保留答题记录 `record-answer`、会话、事件队列、同步(sync-coordinator)、内容加载。
- 去除对 characters/pinyin 的引用;`daily-plan` 可保留但改为可选"练习序列"。

### 2.4 ui(`packages/ui`)
- **保留/复用**:`PoemFill`、`IdiomChain`、`QuestionFlow`、`QuestionStage`、`QuestionProgressHeader`、`ChoiceQuestion`、`AnswerFeedback`。
- **移除**:`CharToPinyin`、`CharToTone`。
- **新增组件**:`PoemMatchNext`(选下句)、`IdiomMeaning`(选释义,复用 ChoiceQuestion)、`PoemAppreciationCard`(赏析卡)、`IdiomOriginCard`(典故卡)。
- **皮肤**:新建 `tokens`(古典配色);`CandyBackground` → `InkBackground`(宣纸/水墨)。

### 2.5 miniapp(`apps/miniapp`)
- **app.config.ts** 页面重构为:
  `pages/home`(诗词馆/成语馆入口)、`pages/poem-fill`、`pages/poem-match`、`pages/idiom-chain`、`pages/idiom-meaning`、`pages/library`(馆藏浏览/赏析)、`pages/guardian`(保留家长/设置)。
- 移除 `pinyin-practice`;`home` 文案与导航古典化。
- 品牌:`navigationBarTitleText: "古文乐园"`。

## 3. 后端改造清单(完整复用)

- **命名**:groupId 保留 `com.childedu`(降低改动量)。
- **content 模块**:内容实体去 `CHARACTER` 类型或将其设为可选;`ReleaseSnapshotItem.type` 由 `CHARACTER|POEM|IDIOM` 收敛为 `POEM|IDIOM`(+ 新题型不新增实体类型,题目仍由 seed 生成)。
- **服务端判题**:保持与 TS 对齐的 `serializePoemFill`、接龙首尾匹配;新增 `POEM_MATCH_NEXT`/`IDIOM_MEANING` 的判题复算(纯查表,答案确定)。
- **identity/sync/mastery/progression/operations**:原样复用;掌握度知识点集合改为诗词/成语。
- **黄金向量对齐**:`content/test-vectors/questions.json` 补充新题型向量,TS 与 Java 双端消费,强制契约零漂移。

## 4. 质量门禁(沿用项目约束)

- **前端**:逻辑代码 100% Vitest 覆盖率;新增题型 domain 逻辑与 UI 逻辑全部 TDD。
- **后端**:集成测试用 Testcontainers;ArchUnit 守护模块边界。
- **契约零漂移**:黄金向量强制 TS/Java 判题对齐。
- **提交规范**:在 submodule 边界内提交;先完整实现 + 自检 + 全量测试通过后统一提交。

## 5. 实施阶段(建议)

| 阶段 | 内容 | 产出 |
|---|---|---|
| P0 文档 | 本设计文档集评审 | ✅ 3 篇文档 |
| P1 骨架 | Fork 目录 + 去 K12 编译通过 | 可 `pnpm i && typecheck` |
| P2 schema | content-schema 去 Character/扩展字段/新题型枚举 + 黄金向量 | schema + 向量 |
| P3 domain | 保留 2 题型 + 新增 2 题型生成器(TDD 100%) | domain 测试全绿 |
| P4 ui | 古典皮肤 + PoemFill/IdiomChain 复用 + 2 新组件(TDD) | ui 测试全绿 |
| P5 miniapp | 页面重构 + 导航古典化 + playground 集成测试 | H5 可跑通 |
| P6 backend | Fork + 去 CHARACTER + 新题型判题 + 黄金向量对齐 | 后端测试全绿 |
| P7 content | 扩充诗词/成语内容(译文/典故/赏析) | 内容包 corpus-v* |
| P8 发布 | content-cli 打包校验 SHA-256 + 状态 DRAFT→VALIDATED→PUBLISHED | 制品 |

## 5.1 新题型接入练习流:固定交替混排(已定案)

现有练习页各自只跑单一题型(`PoemPracticePage` 只出 `POEM_FILL`、`IdiomPracticePage` 只出 `IDIOM_CHAIN`),P4 新增的 `POEM_MATCH_NEXT` 与 `IDIOM_MEANING` 尚未进入练习流。采用**「混入现有练习」**方案:不新增页面,而是让两个练习页各自生成"两种题型交替混排"的一轮。

### 设计要点
- **诗词世界(`PoemPracticePage`)**:一轮 10 题,`POEM_FILL` 与 `POEM_MATCH_NEXT` 各 5 题,按 `FILL, MATCH, FILL, MATCH, …` 固定交替(偶数序位填空、奇数序位连连看)。
- **成语世界(`IdiomPracticePage`)**:一轮 10 题,`IDIOM_CHAIN` 与 `IDIOM_MEANING` 各 5 题,按 `CHAIN, MEANING, CHAIN, MEANING, …` 固定交替。成语仍保留初级/进阶难度切换,难度只影响接龙题的语料筛选,释义题在同一 leveled 语料内取材。
- **新增域生成器**(`packages/domain`):
  - `poem-practice/create-round.ts` → `createMixedPoemRound(corpus, seed, abilityLevel?)`,复用现有 `POEM_FILL`/`POEM_MATCH_NEXT` 的诗筛选与 `generateQuestion`,内部为两条题型各自做确定性洗牌后按序位取题。
  - `idiom-practice/create-round.ts` → `createMixedIdiomRound(corpus, level, seed, abilityLevel?)`,同理复用 `IDIOM_CHAIN`/`IDIOM_MEANING`。
  - 轮长常量沿用 `POEM_ROUND_SIZE`/`IDIOM_ROUND_SIZE`(=10);单题型子生成器保留,供混排复用与既有测试引用。
- **确定性**:两条题型分别以 `${seed}` 派生独立子 seed(如 `poem-fill-round:${seed}`、`poem-match-round:${seed}`),再逐题以 `${seed}:${index}` 派生题面 seed,保证同一 `(corpus, seed, abilityLevel)` 稳定复现、前后端可对齐。
- **能力等级过滤**:先 `corpusAtOrBelow(corpus, abilityLevel)`,两条题型各自在 leveled 语料内筛选可出题项。
- **语料不足即整轮报错**:任一题型缺料(如诗少于连连看所需句数、成语不足 4 条释义干扰项)则整轮抛错,由页面渲染"内容暂时不可用 + 返回首页",不做降级混排,避免比例漂移。
- **事件上报不变**:每题仍按 `questionType`/`questionSeed`/`knowledgePointId` 如实上报,`clientSequence`/`questionIndex` 在整轮内连续递增。

## 6. 风险与待决(已确认项)

- ✅ **命名**:`@cc/*` 与 `com.childedu` 保留。
- ✅ **git 仓**:独立远程仓已就绪。
- ✅ **Corpus 三元组**:characters 可选化。
- ⚠️ **R4 改造联动**:characters 可选后需同步 domain/content/content-cli/后端多处;以 typecheck + 全量测试守护。
