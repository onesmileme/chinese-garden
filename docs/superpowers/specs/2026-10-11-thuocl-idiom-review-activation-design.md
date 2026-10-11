# THUOCL 成语释义审核与批量激活设计

## 目标

为后台现有 1,000 条 `cy-thuocl-* / IDIOM / DRAFT` 候选补齐独立创作的儿童向
释义，自动复核已有拼音，并通过现有受审计管理 API：

- 更新全部 1,000 条候选的释义、审核标记和标签；
- 按接龙依赖顺序激活可通过现有校验的 896 条；
- 将缺少可达接龙后继的 104 条保留为 `DRAFT`；
- 保留逐条权限校验、revision 乐观锁和操作审计；
- 支持执行中断后的安全续跑和完整幂等复跑。

本次完成后，后台成语应为 `ACTIVE = 943`、`DRAFT = 104`。其中原有 47 条
正式成语保持不变。

## 当前状态

后台当前包含：

| 范围 | 状态 | 数量 | Revision |
| --- | --- | ---: | ---: |
| 原正式成语 | `ACTIVE` | 47 | 1 |
| `cy-thuocl-*` 候选 | `DRAFT` | 1,000 | 1 |

1,000 条候选均满足以下事实：

- `meaning` 为空；
- `headPinyin` 和 `tailPinyin` 为小写、无声调 ASCII 音节；
- `pinyin` 保存四个带调拼音音节；
- 标签包含 `待补释义` 和 `拼音待复核`；
- 来源审核标记包含 `MEANING_MISSING` 和 `PINYIN_UNVERIFIED`；
- 词目在候选集内唯一，且不与原 47 条正式成语重复。

在不改变现有接龙校验规则的前提下，以 47 条正式成语为初始可用后继，候选可按
五轮依赖闭包激活：

| 轮次 | 可激活数量 |
| --- | ---: |
| 1 | 297 |
| 2 | 436 |
| 3 | 144 |
| 4 | 17 |
| 5 | 2 |
| 合计 | 896 |

闭包结束后仍有 104 条候选的尾音无法到达任何已激活成语头音，涉及 53 种尾音。

## 方案选择

采用受版本控制的审核清单驱动 CLI，复用现有单条内容管理 API。

未选择后台逐条人工编辑，因为 1,000 条操作容易遗漏，无法稳定复现激活顺序。
未选择一次性脚本或 SQL，因为它们不能提供稳定的内容审核制品、预检、幂等恢复和
审计保障。未选择放宽 `IDIOM_CHAIN_BROKEN_AT_LEVEL`，因为 104 条无后继成语
不应为了本次迁移改变全局内容质量规则。

本方案不新增数据库表，不直接修改内容表和 revision 表。

## 儿童向释义规范

每条释义由本项目独立创作，不复制或近似改写第三方辞书、商业词典、禁止改作数据
或来源不明的抓取内容。

释义必须：

1. 使用简体中文解释成语的核心现代含义；
2. 面向 5 至 7 岁儿童，使用短句和常用词；
3. 不用成语本身循环解释；
4. 不添加未经核验的出处、典故、人物或例句；
5. 不包含 Markdown、HTML、占位符、编辑说明或来源声明；
6. 去除首尾空白，内部不含换行；
7. 在审核清单中逐条固定，进入版本控制后以 SHA-256 锁定。

清单生成阶段检查释义非空、词目唯一、无重复模板和明显占位文本。自动检查不能
代替内容复核，因此受版本控制的 1,000 条清单本身是本次书面审核对象。

## 拼音审核

本次接受候选中已有的四音节带调拼音作为审核基线，不引入新的外部拼音来源。

自动审核要求：

- `pinyin` 恰好包含四个非空音节；
- 每个音节只包含合法拼音字母、变音符号或 `ü`；
- 对带调音节执行项目现有的去调规范化后，第一个音节等于 `headPinyin`，第四个
  音节等于 `tailPinyin`；
- `headPinyin` 和 `tailPinyin` 均为小写 ASCII 字母；
- 候选词目仍为四个汉字。

通过后移除 `拼音待复核` 标签和 `PINYIN_UNVERIFIED` 标记。拼音只用于接龙，
不修改展示词目。

## 审核清单

新增机器可读、受版本控制的 NDJSON：

`frontend/content/reviews/idioms-thuocl-top1000-review.ndjson`

清单按内容 ID 升序排列并精确覆盖 1,000 条候选。每行至少包含：

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定内容 ID |
| `expectedRevision` | 清单生成时要求的 revision，首次为 1 |
| `expectedStatus` | 清单生成时要求的状态，首次为 `DRAFT` |
| `text` | 成语词目 |
| `meaning` | 独立创作的儿童向释义 |
| `sourceHash` | 原始导入候选来源哈希 |
| `beforePayloadHash` | 更新前后台 payload 的规范 SHA-256 |
| `afterPayloadHash` | 更新后 payload 的规范 SHA-256 |
| `pinyinReview` | 拼音四音节及首尾一致性检查结果 |
| `activationRound` | 1 至 5；保留 DRAFT 时为 `null` |
| `decision` | `ACTIVATE` 或 `KEEP_DRAFT_NO_SUCCESSOR` |
| `checks` | 已通过的固定审核规则 |
| `blockingTailPinyin` | 保留 DRAFT 条目的阻断尾音 |

同时新增摘要：

`frontend/content/reviews/idioms-thuocl-top1000-review-summary.md`

摘要记录候选制品哈希、清单哈希、规则版本、五轮计数、896/104 决策计数、53 种
阻断尾音及执行前状态。摘要不重复 1,000 条释义。

清单生成失败时不得替换已有制品。以下任一情况均为失败：

- 候选不是精确的 1,000 条或输入制品哈希不匹配；
- 后台项目缺失，或 ID、type、status、revision、payload 与候选不一致；
- 词目与正式成语或候选内其他条目重复；
- 释义、拼音、来源字段或审核字段不符合契约；
- 激活闭包不是精确的五轮 `297/436/144/17/2`；
- 最终决策不是精确的 `896 ACTIVATE + 104 KEEP_DRAFT_NO_SUCCESSOR`；
- 保留 DRAFT 条目存在可达后继，或待激活条目缺少对应轮次的已激活后继。

## 更新后的内容

对全部 1,000 条候选调用
`PATCH /v1/admin/content/items/{id}?expectedRevision=1`。

更新保持以下字段不变：

- `id`、`type`、level、difficulty、`promotionRequired`；
- `text`、四音节 `pinyin`、`headPinyin`、`tailPinyin`；
- THUOCL candidate ID、commit、rank、frequency 和来源追踪字段。

更新内容：

- `meaning` 写入审核清单中的儿童向释义；
- tags 移除 `待补释义` 和 `拼音待复核`，保留 `成语`、`THUOCL`；
- `reviewFlags` 移除 `MEANING_MISSING` 和 `PINYIN_UNVERIFIED`；空数组可以
  保留，以维持 payload 结构稳定。

更新后每条候选产生 revision 2 和一条成功 `UPDATE` 审计。后续状态迁移不增加
revision。

## 执行流程

新增 `apply-idiom-review` CLI 命令，接收审核清单、管理 API 地址、管理 token
和报告输出路径。token 对应主体必须同时具有 `EDITOR` 和 `REVIEWER`；actor 只取
后端认证结果。

### 全量预检

任何写操作前，命令必须：

1. 校验清单结构、排序、输入哈希和精确决策计数；
2. 获取全部 1,000 条后台候选和 47 条原正式成语；
3. 核对候选当前 revision、状态及允许的 before/after payload 哈希；
4. 重算拼音审核、接龙闭包和五轮激活计划；
5. 确认原 47 条正式成语的 ID、revision、payload 和状态未漂移；
6. 确认目标 actor 同时具有 `EDITOR` 和 `REVIEWER`。

预检失败时不发送任何更新或激活请求。

### 内容更新

按稳定 ID 顺序更新全部 1,000 条候选：

- 当前为 revision 1、payload 等于 `beforePayloadHash` 时，发送更新请求；
- 当前为 revision 2、payload 等于 `afterPayloadHash` 时，记为已更新并跳过；
- 其他 revision、状态或 payload 组合均视为漂移并停止。

更新完成后重新读取全部候选，确认 1,000 条均为 revision 2 且 payload 与清单
一致。

### 分轮激活

按轮次 1 至 5、轮内 ID 升序执行：

1. 对本轮所有条目调用现有 `validate` API，要求全部通过；
2. 只有整轮预检通过后，才逐条调用 `activate?expectedRevision=2`；
3. 本轮完成并重新读取状态后，才进入下一轮。

104 条 `KEEP_DRAFT_NO_SUCCESSOR` 不发送激活请求。更新完成后逐条调用
`validate`，要求唯一问题为 `IDIOM_CHAIN_BROKEN_AT_LEVEL`，路径为
`/payload/tailPinyin`。

## 幂等与中断恢复

数据库状态是恢复依据，不维护额外 checkpoint。

- revision 1、更新前 payload、`DRAFT`：执行内容更新；
- revision 2、更新后 payload、`DRAFT`：跳过更新；按决策决定是否激活；
- revision 2、更新后 payload、`ACTIVE` 且决策为 `ACTIVATE`：全部跳过；
- revision 2、更新后 payload、`DRAFT` 且决策为
  `KEEP_DRAFT_NO_SUCCESSOR`：全部跳过；
- 任何其他 revision、payload、状态或决策组合：预检失败。

执行中断后重跑同一清单时，已提交的单条更新和激活不会重复。幂等复跑不得增加
`UPDATE` 或 `ACTIVATE` 审计。

## 错误处理与报告

以下情况立即停止：

- HTTP 认证或权限失败；
- revision 冲突；
- 内容校验失败或激活轮次依赖未满足；
- 内容、正式目录、候选哈希或决策漂移；
- 非预期状态；
- 网络错误或无法解析的响应。

错误信息包含阶段、轮次、内容 ID、HTTP 状态和经脱敏的后端错误摘要，不输出
管理 token 或完整 payload。

执行报告原子写入：

`frontend/content/reviews/idioms-thuocl-top1000-activation-report.json`

报告包含：

- 清单哈希和规则版本；
- 开始、结束时间；
- `updated`、`activated`、`keptDraft`、`skipped`、`failed` 计数；
- 每条内容的更新和激活结果；
- 首个失败阶段、轮次、ID 和错误摘要；
- 后验状态、revision、审计及接龙闭包验证结果。

数据库审计表仍是状态变更的权威来源。

## 测试策略

严格使用 TDD。

### TypeScript

覆盖：

- 释义和拼音审核规则；
- 清单确定性生成及精确的 1,000、896、104 和五轮计数；
- 输入哈希、revision、payload、正式目录和接龙决策漂移检测；
- 全量预检失败时零写请求；
- 1,000 条更新和五轮激活顺序；
- 104 条阻断原因验证；
- 更新阶段和激活阶段的中断续跑；
- 完整幂等复跑；
- revision 冲突、校验失败、权限失败和网络失败；
- 原子报告写入和敏感信息脱敏；
- CLI 参数、退出码和 HTTP 边界。

仓库级制品测试固定候选输入哈希、清单哈希、五轮计数、决策计数和阻断尾音集合。
前端逻辑保持 100% Vitest lines、branches、functions、statements 覆盖率并通过
TypeScript typecheck。

### Java

本次不改变后端业务规则。执行前后运行后端全量测试，继续覆盖：

- 成语字段不完整时拒绝激活；
- 只有 `ACTIVE`、等级不高于来源的成语可作为后继；
- 激活失败不改变状态、不写成功审计；
- 更新增加 revision，激活不增加 revision；
- revision 冲突和角色校验。

## 运行时验收

执行前记录数据库状态、候选指纹、正式成语指纹和审计基线。执行后确认：

| 验收项 | 期望 |
| --- | ---: |
| 全部 `IDIOM / ACTIVE` | 943 |
| `cy-thuocl-* / ACTIVE` | 896 |
| `cy-thuocl-* / DRAFT` | 104 |
| `cy-thuocl-* / revision 2` | 1,000 |
| 本轮成功 `UPDATE` 审计 | 1,000 |
| 本轮成功 `ACTIVATE` 审计 | 896 |
| 保留 DRAFT 的唯一阻断码 | `IDIOM_CHAIN_BROKEN_AT_LEVEL` |

还需确认：

- 47 条原正式成语的状态、revision、payload 和审计均未变化；
- 1,000 条更新审计的 before/after 只包含预期 payload、tags 和 revision 变化；
- 896 条激活审计均为 `DRAFT -> ACTIVE`，revision 和 payload 不变；
- actor 与认证主体一致；
- 五轮激活后接龙闭包与清单一致；
- 幂等复跑跳过全部 1,000 条，审计计数不增加。

## 非目标

- 不激活 104 条无可达后继的候选；
- 不放宽或绕过现有成语校验规则；
- 不修改 47 条原正式成语；
- 不直接写数据库；
- 不创建或发布客户端内容 release；
- 不补充出处、典故、例句、近反义词、音频或图片；
- 不复制第三方辞书释义；
- 不修改古诗、汉字或客户端页面。
