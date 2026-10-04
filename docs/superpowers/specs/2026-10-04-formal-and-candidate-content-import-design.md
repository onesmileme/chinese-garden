# 正式与候选内容导入设计

## 目标

将 `chinese-garden` 的正式成语、正式古诗和全部候选数据纳入现有内容管理链路：

- 正式数据保持 `ACTIVE`，可用于内容构建和客户端运行；
- 候选数据以 `DRAFT` 入库，可在管理后台检索、编辑、校验和审核；
- 所有候选导入保留来源、哈希和批次审计信息；
- 重复执行不得产生重复内容项。

## 当前状态

当前本地 MySQL 已有：

| 类型 | 状态 | 数量 |
| --- | --- | ---: |
| 正式成语 | `ACTIVE` | 47 |
| 正式古诗 | `ACTIVE` | 23 |
| 古文岛唐诗候选 | `DRAFT` | 320 |
| THUOCL 成语候选 | 未导入 | 1,000 |

正式语料来自：

- `frontend/content/corpus/idiom-bank.json`
- `frontend/content/corpus/poem-bank.json`

候选语料来自：

- `frontend/content/candidates/idioms-thuocl-top1000.ndjson`
- `frontend/content/candidates/poems-guwendao-tang-320.ndjson`

本次不重复写入已存在的正式数据和唐诗候选。导入缺口是 1,000 条
THUOCL 成语候选。

## 方案

复用现有受审计保护的原始内容导入链路：

1. 在 `@cc/content-cli` 增加纯转换能力，把现有成语候选快照转换为
   `RawCandidate`。
2. 生成独立的后台导入 NDJSON，不修改原始候选快照。
3. 使用现有 `ingest-candidates` 命令调用
   `/v1/admin/content-imports` API。
4. 后端继续通过 `RawContentImportService` 创建 `DRAFT` 内容项和导入审计记录。
5. 通过后台查询接口和数据库聚合查询验证最终状态。

不修改数据库表结构，不让后端直接兼容候选生成器的内部格式，也不直接执行
绕过审计链路的插入 SQL。

## 成语候选映射

每条 `IdiomCandidate` 映射为一个 `RawCandidate`：

| 目标字段 | 映射 |
| --- | --- |
| `importKey` | `THUOCL_IDIOM:<candidate-id>` |
| `source` | `THUOCL_IDIOM` |
| `sourceRef` | manifest 中固定版本的 THUOCL 原始文件 URL |
| `sourceHash` | 候选规范 JSON 的 SHA-256 |
| `ruleVersion` | `thuocl-idiom-review-v1` |
| `id` | `cy-thuocl-<成语文本 SHA-256 前 12 位>` |
| `type` | `IDIOM` |
| `suggestedLevel` | `5` |
| `suggestedDifficulty` | `5` |
| `promotionRequired` | `true` |
| `tags` | `成语`、`THUOCL`、`待补释义`、`拼音待复核` |
| `score` | 原始词频 |

`payload` 保存：

- `text`：四字成语；
- `meaning`：空字符串，等待人工补写；
- `headPinyin`、`tailPinyin`：从候选拼音去除声调后得到，仍需人工复核；
- `pinyin`：原始四音节带调拼音；
- `source`：候选 ID、词频、来源排名、来源 commit 和审核标记。

稳定内容 ID 使用成语文本哈希，不依赖候选排名。候选集重新排序时，同一词目仍映射
到同一内容项。

## 状态与审核

- 正式成语和古诗保持 `ACTIVE`，本次仅验证数量、状态和查询能力。
- 唐诗候选保持 `DRAFT`，不重复创建。
- 成语候选导入后为 `DRAFT`。
- 候选缺少释义或尚未人工复核时，不允许批量激活。
- 后续审核通过现有内容编辑、校验和激活接口逐项完成。

## 幂等与失败处理

- 转换器校验输入恰好 1,000 条、ID 和词目唯一、字段完整、manifest 哈希匹配。
- 输出采用确定性序列化和原子替换；失败时不覆盖已有产物。
- 导入前拒绝输出 ID 冲突。
- 后端按稳定内容 ID 跳过已存在项，并记录 `SKIPPED_EXISTING_ID`。
- 候选级错误记录为 `REJECTED`；验收要求拒绝数为零。
- 不删除、不覆盖现有正式数据和唐诗候选。

## 测试边界

测试只覆盖公开边界：

1. 纯转换 API：输入候选与 manifest，输出确定的 `RawCandidate`。
2. CLI：生成后台导入 NDJSON，覆盖参数错误、校验失败和原子写入。
3. 现有 `ingest-candidates` CLI 与后台导入 API：验证完整批次导入和重复导入。
4. 最终验收：通过后台查询和数据库聚合确认数量、状态、审计记录及代表性 payload。

不测试私有函数，不通过 mock 验证内部调用顺序。

## 验收标准

导入完成后：

- `IDIOM / ACTIVE` 恰好 47 条；
- `POEM / ACTIVE` 恰好 23 条；
- `IDIOM / DRAFT` 中恰好有 1,000 条 `cy-thuocl-*` 候选；
- `POEM / DRAFT` 中恰好有 320 条 `sc-gwd-*` 候选；
- 成语候选对应 1,000 条 revision 和 1,000 条 `IMPORTED` 审计记录；
- 成语候选导入批次为 `COMPLETED`，`rejected=0`；
- 重复导入结果为 `imported=0`、`skipped=1000`、`rejected=0`；
- 后台内容查询接口可按 `IDIOM + DRAFT` 返回候选；
- 正式内容仍可从内容构建输入读取，候选不会进入运行时内容包。

## 非目标

- 不补写候选成语释义、出处、例句或人工拼音结论；
- 不激活任何候选；
- 不把候选合并进正式 corpus；
- 不创建或发布远程内容 release；
- 不修改客户端页面或题目生成规则。
