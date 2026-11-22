# 学习地图：从 dsh-claude-delegate 入手开发 DSH 插件

Labels: wayfinder:map

## Destination

一份单文件、可交互的中文 HTML 学习路线图（含练习）：让 TypeScript / React / 依赖注入都还不熟的读者，以本仓库为主线、按需补 Cordis 概念，逐模块读懂全部 20 个源文件，并通过「改项目练习 + 三选一毕业插件」达到能独立开发简单 DSH 插件的水平。

## Notes

- **领域**：DeepSeek Harness（DSH）插件开发、Cordis 插件框架、Claude Agent SDK。
- **权威资料**：本机 `E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\docs\`，版本锁定 `@deepseek-ai/dsh@0.2.2-rc.5`，中文文档齐全；本仓库 `src/`（20 个源文件：宿主 8 + 客户端 12，约 6498 行）。
- **学习者画像**：TypeScript / React / 依赖注入均不熟；计划必须安排「最小够用」的前置补课，不要求系统学完三者。
- **教学约定**：项目主线 + 按需补课；逐模块覆盖、不逐行；关键片段内嵌 HTML 并附「文件:行号」。
- **教学维度**：必须区分「官方最佳实践」与「本项目的偏离」；每个偏离点要讲清官方推荐、本项目做法、原因，以及学习者该不该模仿（见 `09 — 官方最佳实践与本项目的偏离`）。HTML 应有独立章节承载。
- **交付约定**：本图不直接写 HTML。所有决策票关闭后，由执行会话按 Decisions so far 产出 `docs/learn-dsh-plugin/index.html`（单文件、localStorage 记进度、练习可勾选）。
- **写作约定**：最终 HTML 教程正文必须调用 `humanizer-zh` 技能润色（用户 2026-11-20 要求）；事实、代码与出处不受润色影响。
- **research 票约定**：研究结果写到 `.scratch/learn-dsh-plugin/research/<slug>.md`，不建分支、不推送；票内用相对路径作为 context pointer。
- **网络白名单**：本机为公司 PC。任何需要联网的 exe（npm/pnpm 安装、dsh 拉包）执行前必须让用户确认是否在白名单内。已知 `node` / `npm` / `pnpm` / `git` / `bash` 在白名单。
- **票类型**：`research`（AFK，子代理调研）、`grilling`（HITL，与用户拍板）、`prototype`（HITL，原型确认）、`task`（需实际动手，解锁决策）。

## Decisions so far

<!-- 索引：每个关闭的票一行，指向票文件里的 ## Answer -->

- [01 — DSH 插件的最小完整链路](issues/01-dsh-plugin-minimal-chain.md)：插件分「Cordis 模块」与「可安装包」两层；最小可安装工具插件 = 模块 + package.json(`dsh.bundle.patch`) + cordis.patch.yml；客户端包需 `dsh.client.platform`、`exports["./client"]`、裸包名进入 Loader。
- [02 — 本项目的模块依赖图与走读顺序](issues/02-project-module-dependency-map.md)：实际 20 个源文件（宿主 8 + 客户端 12）；宿主两层星形 DAG，客户端以 `client/index` 为根；两端走 JSON wire、不共享编译期类型；已给出逐模块走读顺序与 66 条关键片段。
- [03 — 本项目：DSH 通用机制 vs 项目特有实现](issues/03-project-special-vs-common.md)：37 条机制中通用 16 / 混合 8 / 特殊 13；本项目只有 5 个 DSH 注册面，约八成代码是业务载荷；已给出必学/按需/可跳过清单。
- [04 — 前置知识的最小够用集](issues/04-prerequisite-minimum-set.md)：六阶段补课主干（TS → ESM/Node → Cordis/DI → React → 构建 → 选读）；先学 TS 联合类型与收窄、ESM/Node 异步、Cordis inject/get；`satisfies`、交叉类型、React Context、`ctx.on` 本仓库未用，可跳过。
- [09 — 官方最佳实践与本项目的偏离](issues/09-official-best-practices-deviations.md)：9 组官方最佳实践 + 15 个偏离逐项分析 + 8 个灰色地带；最值得警惕的是已弃用的 `sessionProjections.stateOf`、手写 RPC、自建 JobTracker 重复官方 jobs、`defineTool` 参数全是 `any`、`config.subagents` 与 DSH `ctx.subagents` 同名不同物。HTML 应把「不要模仿」的偏离单独标注。
- [05 — 阶段划分与每阶段验收标准](issues/05-stage-breakdown-acceptance.md)：定稿 8 阶段（环境 → TS/Node → Cordis → 工具/技能 → 宿主载荷 → 客户端 → 构建 → 毕业项目）；完整路径约 60–77h，最短路径约 35h；最佳实践采用「每阶段内联五段式 + 阶段 7 前总表」；每阶段 3–5 道开放题 + 一个动手验收。
- [06 — 练习设计与毕业项目规格](issues/06-exercise-and-capstone-spec.md)：每阶段 2–3 个必做练习（照着做 → 改一处 → 串起来），只给思路 + 参考位置；每阶段一个 `practice/stage-N` 分支；毕业项目三选一（A 文本统计 / B CLI 委托 / C UI 小组件）已给出完整规格与统一验收清单；HTML 练习区含折叠提示、勾选验收、localStorage 进度。
- [08 — 环境验证：最小插件能否跑通](issues/08-environment-verification.md)：整条链路实测跑通（配置组合 → 模块加载 → 工具注册 → 工具执行 → 本地安装/卸载 → 版本强制检查 → 模型真实调用工具）；`ctx.tools.register` 可直接吃原始 JSON Schema，零依赖纯 JS 最小插件成立；10 条坑（`--dump-config` 不加载模块、新 profile 无 app、peer 强制、全局 TS6 不兼容、tsc 报错仍产 JS、浏览器态 token 会过期等）。
- [07 — HTML 学习页原型](issues/07-html-prototype.md)：定稿变体 A（章节式）——顶部工具条 + 210px 吸顶目录 + 自适应正文（容器 1320px）；阶段字段、练习卡、代码块、术语提示、localStorage 进度、深浅色、打印策略全部定稿；B/C 变体放弃，原型保留在 `docs/learn-dsh-plugin/prototype.html` 作对照。

## Not yet specified

- 已拆成 5 张执行票：`.scratch/write-dsh-tutorial/`（01 骨架 → 02/03/04 内容 → 05 总表与收尾）。执行会话按票逐个产出 `docs/learn-dsh-plugin/index.html`；正文必须调用 `humanizer-zh`。

## Out of scope

- **发布到插件市场**（dshmarket / awesome-dsh-plugin）：非「独立开发简单插件」所需，最多作为 HTML 附录的选做延伸。
- **重构或重新实现本项目**：学习计划不要求改进现有代码。
- **通读 DSH 全部 61 篇子系统文档**：只覆盖与本项目相关、且服务于理解插件的部分。
- **fork 前上游 dsh-claude-code 的完整历史考古**：只在「派生来源」一节简述。
