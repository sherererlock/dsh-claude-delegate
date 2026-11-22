# 03 — 本项目：DSH 通用机制 vs 项目特有实现

Type: research
Status: resolved
Blocked by: —

## Question

本项目中哪些是 DSH 插件的通用机制，哪些是本项目特有实现？学习者分别要投入多少？

需要回答：

1. **通用机制清单**：Cordis 插件契约、工具注册、技能注册、配置 schema（schemastery）、客户端 slot 注入、jobs 服务、客户端单文件 bundle 与依赖白名单、构建产物断言。每一项在本仓库的落点（文件:行号）与官方文档章节。
2. **项目特有实现清单**：Claude Agent SDK 委托（`query`、`Options`、`resume`）、SDK 消息到面板事件的映射（`tracker.ts`）、实时输出通道（`live-shell.ts`）、会话持久化与恢复（`session-store.ts`）、后台作业与远程（`remote.ts`）、离线输出文件（`output-file.ts`）、面板 UI 组件（`client/*.tsx`）。每一项解决什么问题、能不能替换成别的实现。
3. **对照表**：通用 / 特殊 / 两者混合（例如「工具注册」是通用的，但工具内部调 SDK 是特殊的）。
4. **学习优先级**：对「开发一个简单插件」而言，哪些特殊性可以跳过、哪些是理解本项目不可跳过的。
5. **文档映射**：每个通用机制对应官方文档的哪一节；找不到对应章节的，标注为「本项目自创/社区模式」。

产出：

- 共性/特殊性对照表（机制 → 类别 → 落点 → 文档章节 → 对简单插件的必要性）
- 「可以跳过」清单及理由

## Answer

1. **分类结果**：37 条机制中，DSH 通用 16 条、混合 8 条、特殊 13 条。
2. **本项目的 DSH 注册面只有 5 个**：1 个工具、2 个技能、1 个 `@Remote` 服务、1 个 `conversation.view` slot；另消费 `ctx.jobs.start`。其余约八成代码是业务载荷（Claude Agent SDK 委托与监控面板）。
3. **对简单插件必学（★）**：Cordis `name` / `inject` / `apply`、`inject` 语义与生命周期、`defineTool` + `ctx.tools.register`、工具参数/输出/渲染。发布时再学 `dsh.bundle` + `cordis.patch.yml`。
4. **按需（◐）**：Config schema、`ctx.get` 可选服务、`presentCall`、`timeoutMs`、`ctx.skills.register`、`ctx.jobs.start`、`dsh.client`、`slots.inject/register`、`TypertRemoteService/@Remote`、`connection.rpc.call`。
5. **可跳过（○）**：Anthropic Agent SDK 全栈、`live-shell.ts`、`session-store.ts`、`tracker.ts` + `remote.ts` + `client/*` 监控栈、`output-file.ts`、模型/effort 跟随策略、两阶段超时与错误映射、构建脚本与产物断言、fork 历史。
6. **关键区分已标注**：`session-store.ts` 不是 DSH 的 `sessionPersistence`；`config.subagents` 是 Anthropic SDK 的 `AgentDefinition`，与 DSH `ctx.subagents` 无关；`__ModuleLoader__` 契约在官方 docs 全量 grep 无结果，属文档未覆盖的运行时契约（标注为推测）。
7. 每条结论均带 `文件:行号` 与官方文档章节；另含「可跳过」清单、项目特有实现的替换可能性表、T0–T3 学习路线、5 条不确定项。

完整研究：`.scratch/learn-dsh-plugin/research/03-project-special-vs-common.md`
