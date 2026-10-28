# PubMed NBIB Exporter

Chrome / Edge 浏览器扩展：自动拆分 PubMed 检索范围，通过网页原生 **Send to → Citation manager → All results → Create file** 批量下载 NBIB，供 EndNote 等文献管理软件导入。

**当前版本：2.0.1** · 中文界面 · Manifest V3 · 无需服务器和 API Key

[下载 v2.0.1 安装包](dist/PubMed-NBIB-Native-v2.0.1.zip) · [详细使用说明](使用说明.md) · [English](README.en.md)

## 解决的问题

做 Meta 分析时，检索命中一万篇以上的文献，手动试日期、逐段下载很麻烦。这个项目用于自动处理这些重复操作，也欢迎使用者反馈问题。

PubMed 网页单次 Citation manager 导出最多 10000 条。面对超过上限的检索结果，手动反复尝试日期节点很耗时。本扩展自动查询数量、缩短日期范围，并逐段操作网页原生导出。

## 功能

- 输入完整检索式、起止日期，支持发表日期 DP、Entrez 收录日期 EDAT、记录创建日期 CRDT。
- 每段默认最多 9999 条；超限时按日期二分，同一天仍超限则继续按 PMID 范围二分。
- 由 PubMed 自己生成 NBIB；插件不调用 EFetch，不组装、拼接或改写文献正文。
- 按日期、序号、预计篇数命名原生下载文件；检查下载完成、文件非空及 .nbib 后缀。
- 使用原生搜索框提交完整检索式，兼容网站生成的 longquery 短链接，避免插件拼出超长 URL。
- 支持当前分段完成后暂停、断点恢复、保存任务清单。

## 安装

1. 下载上面的 ZIP 安装包并解压。
2. Chrome 地址栏打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”。
4. 选择**直接包含 manifest.json 的文件夹**。
5. 点击扩展图标，确认页面顶部显示 `原生 SEND TO 导出 · v2.0.1`。

也可在 GitHub 点击 **Code → Download ZIP**，解压后加载仓库根目录。此项目尚未上架 Chrome / Edge 扩展商店。

## 使用

1. 在 PubMed 清除不需要的侧栏筛选器，把需要的过滤条件写入检索式。
2. 在扩展中填写完整检索式和起止日期。两端日期均包含，不支持 #1 等网页历史检索编号。
3. 点击“开始原生导出”。保持工具页与专用 PubMed 标签页打开，电脑不要休眠。
4. 文件保存至浏览器默认下载目录下的 `PubMedNative_时间_编号` 文件夹。
5. 保存任务清单，导入 EndNote 后核对记录并去重。

示例检索式：`asthma[Title] AND child[MeSH Terms]`。

**请勿在导出专用页手动检索或同时发起其他 PubMed 下载。** 若遇验证页面，请手动处理后回工具页重试。关闭工具页后不会主动推进后续分段，已开始的网页下载可能继续。

## EndNote 导入

如果 .nbib 已关联 EndNote，可双击文件；否则在 EndNote 使用 **File → Import → File**，Import Option 选择 **PubMed (NLM)**。详见 [EndNote 官方说明](https://support.clarivate.com/Endnote/s/article/EndNote-Importing-references-from-PubMed-s-new-website?language=en_US)。

## 数据与限制

- ESearch **仅用于查询数量**。文献文件由 PubMed 网页原生 Citation manager 导出。
- 原生文件不做跨段去重。发表日期可能同时涉及电子版和纸质版，同一 PMID 可能出现在多个日期段；请在 EndNote 去重。
- 每段篇数是网页导出前显示的数量，未读取原生文件内容逐条核验。分段篇数之和不代表去重后总数。
- PubMed 会持续更新。界面会核对网页数量与接口预计数量，但不提供数据库快照保证。
- 网页结构、浏览器策略、验证页面或其他下载扩展可能影响运行。失败时停止，不会自动切换为 API 内容下载。
- v2.0.1 已获用户试用成功反馈，并通过 18 项离线测试；维护环境尚未独立完成浏览器与 EndNote 端到端验证，也未验证十万篇规模。建议先跑小范围。

## 权限与隐私

| 权限 / 域名 | 用途 |
| --- | --- |
| downloads | 识别、命名原生下载并核对保存完成 |
| storage | 在当前浏览器本地保存任务进度和下载状态 |
| webRequest | 观察专用 PubMed 页的请求 URL、时间和标签页编号，以识别下载归属；不修改请求或读取响应正文 |
| pubmed.ncbi.nlm.nih.gov | 填写原生搜索框并操作 Citation manager |
| eutils.ncbi.nlm.nih.gov | 提交检索式，查询各范围的数量 |

没有分析统计、遥测或第三方中转服务器。检索式按功能需要发送至 NCBI，任务与下载状态保存于当前浏览器。任务清单可能包含检索式和本地下载路径，请自行决定是否公开。

## 开发与测试

仅测试需要 Node.js 20 或更新版；日常使用扩展不需要 Node.js。无第三方运行依赖，无构建步骤。

```sh
npm test
npm run check
python scripts/package.py
```

`test.mjs` 使用模拟网页和浏览器 API，覆盖拆分、原生按钮流程、下载归属、长检索式、原生短链接、空文件拒绝和断点恢复。这些测试不等于真实网页端到端测试。

`python scripts/package.py` 生成 `dist/PubMed-NBIB-Native-v2.0.1.zip` 和 SHA-256 校验文件。安装包通过显式文件列表构建，不包含个人检索任务、下载记录或本机缓存。

## 反馈

请通过 [Issues](https://github.com/KNKdevKNK/PubMed-NBIB-Exporter/issues) 报告浏览器版本、扩展版本、出错阶段及经过脱敏的错误文本。请勿上传敏感检索式、任务清单、个人信息或完整浏览器配置。

## 许可证与声明

本次发布尚未指定开源许可证。本项目是独立的社区工具，与 NCBI、NLM、NIH、Clarivate 或 EndNote 无隶属或背书关系。

PubMed 和 EndNote 的名称、数据及服务仍受其各自条款约束。

## 参考

- [PubMed 原生 Citation manager 导出说明](https://pubmed.ncbi.nlm.nih.gov/help/#export-citations-into-citation-management-software)
- [NCBI E-utilities 文档](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
