# 02 — 本项目的模块依赖图与走读顺序

Type: research
Status: resolved
Blocked by: —

## Question

本仓库 20 个源文件之间的依赖关系与建议走读顺序是什么？

需要回答：

1. 每个文件的职责（一句话）与主要导出。
2. 宿主侧 8 个文件（`index.ts`、`tracker.ts`、`remote.ts`、`live-shell.ts`、`session-store.ts`、`delegate-model.ts`、`delegation-skill.ts`、`output-file.ts`）之间的 import 依赖 DAG。
3. 客户端 12 个文件（`client/index.ts`、`api.ts`、`types.ts`、`ClaudeCodeView.tsx`、`EventView.tsx`、`JobDetailModal.tsx`、`OutputView.tsx`、`PersistedOutput.tsx`、`format.ts`、`locales.ts`、`md.ts`、`styles.ts`）之间的依赖 DAG；两端是否共享类型、如何共享。
4. 入口 `src/index.ts` 从模块加载到注册工具/技能的调用链；插件启动时发生了什么。
5. 客户端 `src/client/index.ts` 从 `apply` 到面板渲染的调用链；`createApi` 如何拿到宿主数据。
6. 按「先概念、后实现」原则给出逐模块走读顺序，标注每个模块的前置模块与可跳过理由。
7. 每个模块里最值得内嵌进 HTML 的关键函数/类型（给出 `文件:行号` 与一句话「为什么值得看」）。

产出：

- 依赖图（Markdown / ASCII，宿主侧与客户端侧分开）
- 走读顺序表（模块 → 前置 → 关键片段 → 预计阅读成本）
- 每模块关键片段清单（文件:行号）

## Answer

1. **实际规模**：20 个源文件（宿主 8 + 客户端 12），约 6498 行。票面原先的「17 个 / 宿主 6 / 客户端 11」是过期计数，已在此修正。
2. **宿主依赖**：两层星形 DAG。`src/index.ts` 依赖 6 个模块；`remote.ts` 再依赖 `tracker.ts`、`session-store.ts`、`output-file.ts`；其余为叶子，无环。
3. **客户端依赖**：以 `client/index.ts` 为根，`types.ts` / `locales.ts` / `styles.ts` 是叶子；`format.ts` 专门用于断开 `ClaudeCodeView ↔ JobDetailModal` 的潜在环。
4. **两端不共享编译期类型**：通过 `claudeCode/*` JSON wire 通信，类型结构镜像，客户端在 `api.ts:49-110` 重新校验。
5. **宿主启动链**：`apply` 注册 2 个 skill、1 个 `claudeCode` remote 服务、1 个 `claude_code` 工具；`execute → sessions.plan → 后台/前台 → runWithSession → runClaude → SDK 消息流`。
6. **面板链**：`client/index.ts apply` 注册 `conversation.view`；视图合并三路 job 源，选中任务 live 时 1 秒轮询 `readEvents/readOutput`，再交给 `EventView` / `OutputView`。
7. **推荐走读顺序**：`tracker → client/types → session-store → output-file → remote → (live-shell / delegation-skill) → index → client/api → 展示支撑模块 → EventView → ClaudeCodeView → client/index`。
8. 文档含 66 条关键片段（每模块 2–5 个）、12 段最小内嵌建议、10 条 HTML 需强调的实现约束；212 处 `文件:行号` 已脚本校验存在。

完整研究：`.scratch/learn-dsh-plugin/research/02-project-module-dependency-map.md`
