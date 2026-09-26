# 成语候选扩充设计

## 目标

从公开数据源生成并保存 1,000 条可审计的成语候选，用于后续人工补写儿童化释义和审核。候选数据不得自动进入正式词库、内容包或后台数据库。

## 范围

本次包含：

- 从固定版本的 THUOCL 成语词表读取词目和文档频率（DF）；
- 过滤、去重并排除 `idiom-bank.json` 已有词目；
- 使用固定版本的 `pinyin-pro` 生成带声调拼音；
- 保存 1,000 条候选快照、来源清单和生成报告；
- 为生成逻辑补充单元测试和命令行入口。

本次不包含：

- 中文释义、出处、典故或例句；
- 儿童适龄性、价值观和教学等级的最终审核；
- 修改 `frontend/content/corpus/idiom-bank.json`；
- 将候选导入后台数据库或发布内容包。

## 数据源

候选主池使用清华大学自然语言处理实验室发布的 THUOCL：

- 文件：`data/THUOCL_chengyu.txt`
- 字段：`词目<Tab>DF`
- 许可：MIT
- 用途：词目发现和历史新闻语料频率排序

生成时必须锁定 THUOCL commit SHA，记录原始 URL、许可证 URL、下载文件 SHA-256 和生成工具版本。THUOCL 的 DF 仅作为排序信号，不解释为儿童常用度。

拼音由锁定版本的 MIT 许可 `pinyin-pro` 本地生成。自动生成的拼音必须标记为待复核；候选晋升正式词库前须人工确认多音字。

不得复制 `chinese-xinhua`、商业辞书或教育部《成语典》的释义、出处和例句。详细来源评估见 `docs/04-idiom-data-source-research.md`。

## 筛选与排序

生成过程必须确定且可重复：

1. 解析 THUOCL 的词目和正整数 DF；
2. 对词目执行 NFC 规范化并去除首尾空白；
3. 仅保留恰好四个基本汉字的词目；
4. 按规范化词目去重，同词保留最高 DF；
5. 排除正式 `idiom-bank.json` 中已有的全部词目；
6. 按 DF 降序、词目 Unicode 升序稳定排序；
7. 取前 1,000 条；
8. 用 `pinyin-pro` 生成四音节带调号拼音；
9. 生成首字和末字，所有候选标记为 `NEEDS_MEANING`。

只要不足 1,000 条、出现重复、与正式词库重叠、拼音不是四音节或来源元数据缺失，命令必须失败，不得输出部分成功结果。

## 文件布局

提交以下可审计资产：

- `frontend/content/candidates/idioms-thuocl-top1000.ndjson`
- `frontend/content/candidates/idioms-thuocl-top1000.manifest.json`

原始 THUOCL 文件继续放在被 Git 忽略的 `frontend/content/raw/thuocl/`。候选快照进入 Git，保证团队可以直接审核；manifest 保证快照可追溯和再生成。

## 候选契约

NDJSON 每行保存一个候选：

```json
{
  "id": "idiom-candidate-0001",
  "text": "示例成语",
  "pinyin": ["shì", "lì", "chéng", "yǔ"],
  "head": "示",
  "tail": "语",
  "frequency": 12345,
  "sourceRank": 1,
  "status": "NEEDS_MEANING",
  "reviewFlags": ["PINYIN_UNVERIFIED", "MEANING_MISSING"]
}
```

`id` 由排序位置生成，只用于这份候选快照，不作为正式内容 ID。正式词库 ID 仍由现有内容导入流程产生。

manifest 至少包含：

- schema version、候选数量和生成命令；
- THUOCL commit SHA、原始 URL、许可证 URL、SHA-256；
- `pinyin-pro` 版本；
- 正式词库输入文件 SHA-256；
- 原始条数、各过滤阶段数量、排除已有词目数量；
- 输出文件 SHA-256；
- 排序和字段映射说明。

为保证相同输入得到相同输出，候选文件不写生成时间。抓取时间只记录在 manifest 的审计字段中，不参与候选内容。

## 工具设计

在 `@child/content-cli` 增加聚焦的候选生成能力，复用 Node 文件系统端口，不耦合后台 HTTP：

```text
cc-content idiom-candidates \
  --source <THUOCL_chengyu.txt> \
  --bank <idiom-bank.json> \
  --out <candidate-directory> \
  --count 1000 \
  --source-commit <sha>
```

命令先在内存中完成解析与校验，再原子写入 NDJSON 和 manifest。已有 `raw-candidates` 命令保持不变，避免影响诗词和汉字候选流程。

## 测试与验收

单元测试覆盖：

- THUOCL 行解析和非法 DF；
- Unicode 规范化、四字过滤与去重；
- 排除正式词库词目；
- DF 相同情况下的稳定排序；
- 拼音、首尾字和审核标记；
- 不足目标数量时失败；
- manifest 统计和哈希；
- 相同输入重复生成时 NDJSON 字节一致。

最终验收：

- 候选恰好 1,000 条；
- 词目和 ID 均唯一；
- 与现有 47 条正式成语零重叠；
- 每项恰好四个汉字和四个拼音音节；
- 全部状态为 `NEEDS_MEANING`；
- 正式词库和后台数据库内容数量不变；
- content-cli 全量测试、类型检查和内容测试通过。

## 风险控制

- 高频不等于适龄：后续必须增加儿童适龄和教育价值审核。
- 自动拼音可能误判多音字：保持 `PINYIN_UNVERIFIED`，禁止未审核晋升。
- 上游内容可能变化：固定 commit、哈希和许可证快照信息。
- 候选误发布：候选目录不进入内容包构建，也不接入后台导入命令。
- 大文件审查困难：使用 NDJSON 保持逐行 diff，并用 manifest 汇总筛选结果。
