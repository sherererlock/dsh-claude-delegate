# 09 — 官方最佳实践与本项目的偏离

Type: research
Status: resolved
Blocked by: —

## Question

DSH 官方推荐的最佳实践是什么？本项目在哪些地方偏离了它们？学习者应该如何看待这些偏离？

需要回答：

1. **官方最佳实践清单**（从官方文档提炼，按主题分组，每条给文档出处）：
   - Cordis 契约：`name` / `inject` / `apply` 的写法、服务依赖声明、生命周期与清理
   - 工具注册：`defineTool` 的参数/输出/渲染、错误处理、超时
   - 配置：schemastery schema、默认值、patch 的 `config` 合并语义
   - 客户端：slot 注册时机、bundle 格式、依赖白名单、RPC
   - 构建与发布：`package.json` 字段、`dsh.bundle.patch`、`engines`/peer 版本声明
   - 会话/作业：何时用 DSH 的 jobs、sessionPersistence、subagents，何时自建
2. **逐项对照本项目**，分成三类：
   - **遵循**：哪里照做了，可作为正面示例
   - **偏离**：哪里没照做；给出 `文件:行号`、官方推荐出处、偏离的具体表现
   - **文档未覆盖**：官方没有写、只能看源码或社区约定的灰色地带
3. **偏离原因分析**：对每个偏离点解释可能的原因（fork 来源、历史遗留、cordis 4.x 限制、产品约束、性能取舍），并区分「有理由的取舍」与「可能是技术债」。
4. **对学习者的处理建议**：
   - 哪些偏离要当作「本项目特有知识」学习
   - 哪些要明确标注「不要模仿，官方推荐是 X」
   - 哪些是「官方文档没写，只能看源码/社区」的灰色地带
5. **产出可直接嵌入 HTML 的对照表**：官方推荐 → 本项目做法 → 差异 → 原因 → 学习者该怎么做。

权威来源：

- 本机 `@deepseek-ai/dsh/docs/`：`cordis-primer.zh.md`、`cookbook/extension-cookbook.zh.md`、`architecture.zh.md`、`capability-seams.zh.md`、`config-catalog.zh.md`、`subsystems/tools.zh.md`、`subsystems/client-modules.zh.md`、`subsystems/slots.zh.md`、`subsystems/jobs.zh.md`、`subsystems/persistence.zh.md`、`subsystems/session.zh.md`、`subsystems/subagent.zh.md`、`cordis-tutorial/*.zh.md`
- 本项目：`src/` 全部、`package.json`、`cordis.patch.yml`、`README.md`、`CHANGELOG.md`（尤其 0.4.1 关于 optional-inject 的说明）
- 与 `03 — 本项目：DSH 通用机制 vs 项目特有实现` 的分工：03 回答「是什么类别」，本票回答「官方推荐什么、本项目哪里没照做、为什么、学习者怎么对待」。不要重复分类表。

产出：

- 官方最佳实践清单（带出处）
- 遵循 / 偏离 / 文档未覆盖 三栏对照表
- 偏离原因与「该不该模仿」的判断
- 可直接进 HTML 的对照表

## Answer

1. **最佳实践骨架**：Cordis 契约与生命周期 → 硬依赖/可选依赖（`inject` vs `ctx.get`）→ 配置/patch 整体替换 → `defineTool`/输出/render/超时 → 技能注册 → jobs 生产方/`readAt`/`kill` → 客户端 manifest/slot/RPC → 会话持久化与 subagent → 构建发布（`engines.dsh`/peer/`files`）。
2. **最值得警惕的偏离（学习者最容易学错的地方）**：
   - `sessionProjections.stateOf(session, key)` 已被官方 `upgrade-guide/v0.2.1-rc.2` 明确弃用，应改用 `exec.agent.model.current()`（本项目 `src/index.ts:194-215`）。
   - Remote 走 SRC 运行时推断 + 客户端手写 RPC，没有严格 Typert 生成产物；参数名因此变成公开 wire 契约。
   - 自建 `JobTracker` 文本环与取消 RPC 重复了官方 `ctx.jobs.readAt` / `kill` / `ctx.remote.job`；`tracker.ts:1-12` 的「kill 吞通知」理由与当前文档相反。
   - `defineTool` 的 `args`/`value` 全是 `any`、output schema 无 `required`；配置的 `permissionMode`/`effort` 无枚举约束，`timeoutMs` 无下限，`0` 可能让工具注册失败。
   - `config.subagents` 是 Anthropic SDK 的 `AgentDefinition`，不是 DSH 的 `ctx.subagents`——同名不同物，最易建立错误心智模型。
3. **灰色地带（官方 docs 未覆盖）**：`window.__ModuleLoader__.load` 契约只在官方包 README/源码，不在 `docs/`；客户端 `ctx.jobs` 服务形状无文档；`dsh.client.inject` 是信息性字段，且含 `0.2.2-rc.5` 已不存在的 `dsh-client-runtime`。
4. **产出规模**：659 行，含 9 组最佳实践清单、遵循/偏离/文档未覆盖三栏、15 个偏离逐项分析、8 个灰色地带、可直接嵌入 HTML 的五列表；证据按「文档明确 / 官方包 README 或类型声明 / 代码推断 / 无法确认」四级标注。

完整研究：`.scratch/learn-dsh-plugin/research/09-official-best-practices-deviations.md`
