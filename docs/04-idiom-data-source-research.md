# 中文成语候选公开数据源研究

> 调研日期：2026-09-23  
> 范围：仅评估用于扩充成语候选的数据源，不修改现有语料。许可证判断是工程风险评估，不替代法律意见。

## 结论摘要

1. **推荐以 THUOCL 作为“候选词 + 使用频率”主来源。**它由清华大学自然语言处理实验室官方组织发布，成语词表有 8,519 条，字段只有词目与文档频率（DF），GitHub 仓库明确采用 MIT，README 明确称可用于研究与商业。它不提供拼音、释义、出处或例句，正好可避免把第三方辞书表达直接带入产品。
2. **CC-CEDICT 适合作为拼音、简繁映射和英文义项的补充来源，但要先接受 CC BY-SA 4.0 的署名及相同方式共享义务。**它不是成语专库，也没有出处、典故和例句，必须筛选并人工审核。
3. **教育部《成语典》权威且字段最丰富，但不适合直接导入当前简体、儿童化内容模型。**其 CC BY-ND 3.0 TW 明确禁止修改个别条目的内容，也明确禁止转为简体字。可用于人工核查存在性、典源与读音差异；如要分发其内容，应保持原文、繁体和完整署名/使用说明，并先做法律确认。
4. **不建议继续把 `pwxcoo/chinese-xinhua` 当作可发布内容的权利来源。**仓库虽有 MIT 文件，但成语内容来自对第三方网站的抓取，未给出上游授权；MIT 不能补足抓取内容的权利链。它最多只能作为线索库。
5. **《现代汉语词典》不是开放数据源。**当前文件中“对照《现代汉语词典》校对”的做法，只适合人工核验词形、读音等事实，不应复制或近似改写其释义和例句；审计记录还应补充版次及页码。

## 来源对比

| 来源 | 发布主体 / 可信度 | 规模（本次核验） | 可用字段 | 许可 | 适用结论 |
| --- | --- | ---: | --- | --- | --- |
| THUOCL 成语词表 | 清华大学自然语言处理实验室官方 GitHub | 8,519 条 | 成语、DF 词频 | GitHub 仓库 MIT；README 称可商用 | **推荐作为候选主池** |
| CC-CEDICT | MDBG / CC-CEDICT 官方发布 | 全词典 125,094 条；非成语专库 | 简体、繁体、数字声调拼音、英文义项 | CC BY-SA 4.0 | **有条件推荐作补充** |
| 教育部《成语典》 | 中华民国教育部 / 国家教育研究院 | 官方称约 1,500 组、约 5,000 条；下载表实有 5,489 行数据 | 22 个字段，含成语、注音、汉语拼音、释义、典源、书证、用法与例句等 | CC BY-ND 3.0 TW + 专门使用说明 | **只建议核查；不直接改写导入** |
| chinese-xinhua | 个人 GitHub 仓库 | README 称 31,648；当前 JSON 实测 30,895 条 | 成语、拼音、释义、出处、例句、拼音缩写 | 仓库 MIT，但上游抓取内容授权不明 | **不作为权利来源** |
| Wikidata | Wikimedia 官方协作知识图谱 | 全库超过 1.2 亿个实体；无稳定、完整的中文成语子集 | 标签、别名、描述、结构化声明、引用、站点链接 | 结构化数据 CC0 | 可辅助做标识与链接，不适合作为成语主库 |

## 1. THUOCL：推荐的候选主来源

### 核验结果

- 官方主体：GitHub 仓库位于 `thunlp` 官方组织；项目说明为清华大学自然语言处理与社会人文计算实验室整理。
- 成语规模：8,519 条。本次下载后 `wc -l` 结果同 README。
- 字段：UTF-8 文本，每行是 `词目<Tab>DF值`。DF 是该词出现在统计语料中的文档数。
- 语料背景：成语 DF 来自新浪新闻，官方标注更新时间为 2016-12-24。GitHub 中该文件最后一次提交是 2018-11-21，因此不应把 DF 当作当前儿童常用度。
- 许可证：官方 GitHub 根目录 `LICENSE` 是 MIT；仓库 README 另明确写明“可用于研究与商业”，并要求科研成果声明使用 THUOCL、引用指定文献。
- 下载：可直接下载官方仓库中的 `data/THUOCL_chengyu.txt`，无需 API。

### 风险与控制

- 官网公开说明与下载表单存在冲突：项目主页称可商用，旧式下载表单却称商业使用需联系洽谈。官方 GitHub 的 MIT 文件和 README 对仓库内容较明确，但商业发布前最好保存所用 commit、LICENSE、README 快照；高价值商业项目可再向 `thunlp@gmail.com` 书面确认。
- 词表来自网站标签、搜索热词、输入法词库等并经过人工筛选，只能证明“候选词及历史新闻 DF”，不能证明每项都是适龄、规范或严格意义上的成语。
- 不含拼音、释义、出处、例句，必须由其他来源或内部编辑流程补齐。

### 原始来源

- 官方仓库：https://github.com/thunlp/THUOCL
- 官方 README：https://github.com/thunlp/THUOCL/blob/master/README.md
- 官方 MIT 许可证：https://github.com/thunlp/THUOCL/blob/master/LICENSE
- 成语数据文件：https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_chengyu.txt
- 官方项目页：http://thuocl.thunlp.org/
- 下载表单及另一版使用协议：http://thuocl.thunlp.org/message
- 成语文件提交记录：https://api.github.com/repos/thunlp/THUOCL/commits?path=data/THUOCL_chengyu.txt

## 2. CC-CEDICT：拼音与英文义项补充

### 核验结果

- 官方定位：社区维护、由 MDBG 发布的可下载汉英词典；提交内容会经审核后发布。
- 规模：2026-09-22 下载文件头声明并实测为 125,094 条。该数字是全部词条，不是成语数量。
- 字段：每行格式为 `繁体 简体 [pin1 yin1] /英文义项1/英文义项2/`。拼音采用逐音节数字声调，记录本调，不记录“一”“不”等连读变调。
- 成语识别：部分英文义项带 `(idiom)`，但不能假定所有成语均有此标记；只按四字长度筛选也会产生大量误报和漏报。
- 不提供：系统化的中文释义、出处、典故、书证或例句。
- 下载：官方提供 UTF-8 ZIP 和 GZip；没有必要依赖第三方 JSON 转换包。
- 许可证：CC BY-SA 4.0，允许商用和改作，但要求署名、标注修改，并对改作内容采用相同许可证。

### 风险与控制

- 如果将英文义项翻译、改写或与自有语料融合后发布，可能形成受 ShareAlike 约束的改作。应把 CC-CEDICT 派生字段隔离并保留来源、版本和许可证，发布策略需经法律评估。
- 拼音是中国大陆标准普通话取向，适合本项目，但当前项目使用带调号拼音，需要进行确定性的格式转换和多音词人工复核。
- 下载页是动态更新的，构建时必须固定日期、文件哈希和本地快照，避免不可复现。

### 原始来源

- 官方介绍、许可证与下载：https://www.mdbg.net/chinese/dictionary?page=cc-cedict
- 官方下载说明：https://cc-cedict.org/editor/editor.php?handler=Download
- 官方格式规范：https://cc-cedict.org/wiki/format:syntax
- CC BY-SA 4.0 条款摘要：https://creativecommons.org/licenses/by-sa/4.0/
- UTF-8 GZip：https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz

## 3. 教育部《成语典》：权威但禁止改作

### 核验结果

- 官方主体：中华民国教育部编纂、国家教育研究院维护，面向语文教学者与学生。
- 规模：官方简介称正文收录 1,500 余组成语、约 5,000 条。2026-06-25 版下载 XLSX 的工作表范围为 `A1:V5490`，即表头外 5,489 行数据。
- 下载版共 22 个字段：编号、成语、注音、汉语拼音、释义、典源文献名称、典源文献内容、典源注解、典源参考资料、典故说明、书证、用法说明（语义、类别、例句）、辨识、近义、反义、参考词语、主条/非主条等。
- 下载：官方公众授权网站提供文字数据库 ZIP（内含 XLSX）和字图数据 ZIP；未发现面向批量使用的公开 API 文档。
- 许可证：CC BY-ND 3.0 TW，允许包括商业用途在内的原样复制和散布，但必须署名。
- 专门使用说明进一步明确：个别条目的词目、音读、释义、典源、书证、用法说明等均不得修改，**也不得转为简化字**；使用时必须完整保留使用说明并确认版本。

### 风险与控制

- 当前项目使用简体字且需要儿童向改写，因此不能直接把该数据变为产品语料，也不能把繁体字段自动转简体后分发。
- 可把它作为编辑人员的核查入口，但不要复制或“洗稿”释义、典故说明、例句。若需要原样展示，应将原始字段整体隔离、保持繁体、完整署名并保留使用说明。
- 台湾与大陆在字形、读音及用词上可能不同；即使仅核查读音，也需结合项目采用的普通话规范人工审定。

### 原始来源

- 教育部字辞典说明与授权概述：https://depart.moe.edu.tw/ed2400/cp.aspx?n=D509C3C9F6F496FD&s=31218F193CB4FD6E
- 《成语典》官方站：https://dict.idioms.moe.edu.tw/
- 官方简介：https://dict.idioms.moe.edu.tw/pageView.jsp?ID=71
- 官方编辑体例：https://dict.idioms.moe.edu.tw/pageView.jsp?ID=16
- 公众授权首页：https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html
- 下载页：https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/dict_idiomsdict_download.html
- 2026-06-25 文字数据库：https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/download/dict_idioms_2020_20260625.zip
- 专门使用说明：https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/idiomsdict_10409.pdf
- CC BY-ND 3.0 TW：https://creativecommons.org/licenses/by-nd/3.0/tw/

## 4. chinese-xinhua 专项核验

核验对象：`pwxcoo/chinese-xinhua`，即当前
`frontend/content/sources/idioms-l5.json` 所称的 “GitHub chinese-xinhua（MIT）”。

### 仓库与数据

- 根目录确有 MIT `LICENSE`，版权所有者为 PWXCOO，年份为 2018。
- README 声称收录 31,648 个成语；本次从官方 raw URL 下载 `data/idiom.json` 后，`jq length` 实测为 **30,895**。文件为 10,319,857 字节，所有记录字段一致。
- 字段为 `word`、`pinyin`、`explanation`、`derivation`、`example`、`abbreviation`，分别对应成语、拼音、释义、出处/来源、例句、拼音首字母缩写。
- README 的 changelog 明确记载 API 已于 2018-12-16 下线；当前可靠下载方式只有 GitHub raw 文件或仓库归档。
- `idiom.json` 的最后一次提交是 2018-12-16 的去重，数据已经多年未维护。

### 权利链问题

- README 明确说所有数据均“从网上收集整理”，并称项目“无任何商业目的；如果有侵权行为将及时删除”。
- 官方抓取脚本 `scripts/chengyu.py` 显示，成语字段从第三方站点 `http://www.zd9999.com/cy/` 抓取。脚本没有记录该站内容的许可证、作者、版本或逐条来源。
- 因此，仓库的 MIT 文件可以明确授权仓库作者拥有权利的代码和整理成果，却不能自动取得或再许可第三方释义、出处、例句的著作权。对商业教育产品而言，这是高风险、不可审计的权利链。

### 对当前 L5 文件的逐项核验

| 当前候选 | chinese-xinhua 中是否存在 | 拼音是否一致 | 备注 |
| --- | --- | --- | --- |
| 心旷神怡 | 是 | 是 | 可证明词目和拼音确实来自该候选库 |
| 一帆风顺 | 是 | 是 | 同上 |
| 顺理成章 | 是 | 是 | 同上 |
| 张灯结彩 | 是 | 是 | 同上 |
| 彩云追月 | **否** | 无法核验 | 当前 `sourceRef` 写为 chinese-xinhua 不成立；公开资料更常把它作为民族乐曲名，是否按成语收录需另审 |
| 月下老人 | 是 | 是 | 可证明词目和拼音确实来自该候选库 |

补充交叉核验：

- THUOCL 收录上述五项，也不收录“彩云追月”。
- 本次 CC-CEDICT 下载收录上述五项，也不收录“彩云追月”。
- 教育部《成语典》下载表可检出“心旷神怡”“一帆风顺”“月下老人”；未在下载表中检出另外三项。不同辞典收词范围不同，未收录本身不是“不是成语”的充分证明。

### 原始来源

- 官方仓库：https://github.com/pwxcoo/chinese-xinhua
- README：https://github.com/pwxcoo/chinese-xinhua/blob/master/README.md
- MIT 许可证：https://github.com/pwxcoo/chinese-xinhua/blob/master/LICENSE
- 成语 JSON：https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json
- 文件元数据：https://api.github.com/repos/pwxcoo/chinese-xinhua/contents/data/idiom.json
- 抓取脚本：https://github.com/pwxcoo/chinese-xinhua/blob/master/scripts/chengyu.py
- 成语文件提交历史：https://api.github.com/repos/pwxcoo/chinese-xinhua/commits?path=data/idiom.json
- 去重提交：https://github.com/pwxcoo/chinese-xinhua/commit/8de1001aa499cd65fb97ef8712550188c0297a08

## 5. Wikidata：低风险辅助源

- Wikidata 的主、属性、词位和 EntitySchema 命名空间结构化数据采用 CC0，合规负担最低。
- 官方数据访问方式包括搜索 API、Wikibase REST / Action API、SPARQL 查询服务、单实体 JSON/RDF 和完整 dump。
- 字段可含多语言标签、别名、短描述、结构化声明、引用和站点链接，但没有稳定且完整的“中国成语”分类，也不保证拼音、词义、典源或例句。
- 官方称全库超过 1.2 亿个实体；该数字不能转换成可靠的成语覆盖规模。
- 结论：适合给已审核词条补 Wikidata ID、别名或外部链接，不适合发现完整候选或生成教学内容。

### 原始来源

- 版权说明：https://www.wikidata.org/wiki/Wikidata:Copyright
- 数据访问说明：https://www.wikidata.org/wiki/Wikidata:Data_access
- SPARQL 服务：https://query.wikidata.org/
- 官方 dumps：https://dumps.wikimedia.org/wikidatawiki/latest/

## 6. 《现代汉语词典》在现流程中的定位

- 商务印书馆官方页面将《现代汉语词典》第 7 版列为中国社会科学院语言研究所词典编辑室编纂、商务印书馆出版的商业出版物，并提供纸书与正版 App；未提供可批量再利用的开放数据许可证或公开数据下载。
- 新华辞书语言知识智能服务平台用户协议称，平台信息、资料和文字等知识产权属于平台或权利人，未经合法授权及书面同意不得擅自修改、复制、发行或制作衍生品。
- 因此它可以作为编辑核查工具，但不能作为可复制的开放候选数据源。当前记录只写“现代汉语词典”，缺少版次、页码和核查人，也不足以审计究竟核对了哪些事实。

### 原始来源

- 商务印书馆《现代汉语词典》第 7 版：https://www.cp.com.cn/book/6afc8cd8-c.html
- 官方 App 介绍：https://www.cp.com.cn/Content/2020/11-20/1505014314.html
- 新华辞书平台用户协议：https://xhzd-business.cp.com.cn/legals/terms.html

## 推荐落地策略

1. 从固定 commit 的 THUOCL 抽取 `词目 + DF`，只生成 `DRAFT` 候选，并保留来源 URL、commit SHA、许可证和文件哈希。
2. 仅把 DF 当作历史新闻语料中的普及度信号；另做儿童适龄、价值观、歧义、专名和非成语过滤。
3. 如项目能接受 CC BY-SA 4.0，使用固定版本 CC-CEDICT 补简繁映射、普通话拼音和英文义项；将这些字段与自有字段分层并保留逐条 provenance。不能接受 ShareAlike 时，不导入其义项。
4. 中文儿童释义和现代例句由编辑独立创作，出处回到已进入公版的古籍原文逐项核验并准确引用，不从 chinese-xinhua、商业辞书或禁止改作的数据改写。
5. 教育部《成语典》和《现代汉语词典》只进入人工复核清单，不进入自动导入链路。
6. 将“彩云追月”单独退回编辑审核：至少三个候选源均不收录，且当前 chinese-xinhua 来源标注无法成立。

## 建议保存的审计元数据

每次候选导入至少保存：

- 来源名称、原始 URL、许可证 URL；
- 固定版本号或 commit SHA、抓取时间、SHA-256；
- 原始字段到项目字段的映射；
- 哪些字段为原样导入、格式转换、人工创作或人工核查；
- 审核人、审核日期及所用辞书的版次/页码；
- 署名文本、许可证副本及对外分发策略。

本次下载文件的 SHA-256（仅用于复核本报告，不表示已纳入仓库）：

- chinese-xinhua `idiom.json`：`1d4b4f454ce1c416d6a1ab2369d6e66c0ff99e04390172eef70790499e21ce19`
- THUOCL `THUOCL_chengyu.txt`：`c339d5d6e37d4f8ecdcb82f2a02b7fdfc66796f0a5215155f2aff8a77e89a7eb`
- 教育部《成语典》2026-06-25 ZIP：`99df354539f251c32bd923567a06af26cf3f4790690738d277e68c4a3cebc7aa`
- CC-CEDICT 2026-09-22 GZip：`98c1a804e9ecf103494c85c18300dcd792acced9d238350ebcd84297e77a2c30`
