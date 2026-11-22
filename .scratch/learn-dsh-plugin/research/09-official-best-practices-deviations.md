# 09 — 官方最佳实践与本项目的偏离

> 研究票：`.scratch/learn-dsh-plugin/issues/09-official-best-practices-deviations.md`
> 调查对象：`E:\workspace\GitRepository\dsh-claude-delegate`（0.8.1）
> 官方文档根：`E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\docs`（DSH 0.2.2-rc.5 随包中文文档）
> 官方包根：`E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*`
> 分工：`03 — 本项目：DSH 通用机制 vs 项目特有实现` 回答「是什么类别」；本文回答「官方推荐什么、本项目哪里没照做、为什么、学习者该不该模仿」。本文不重复 03 的分类表。

---

## 0. 结论摘要

- **机制外壳大体遵循官方**：函数插件契约（`name` / `inject` / `apply`）、硬依赖用 `inject`、可选依赖用 `ctx.get`、`Config` 用 schemastery、工具用 `defineTool` + `ctx.tools.register`、后台任务用 `ctx.jobs.start`、客户端用 `ctx.slots.inject` + `ctx.slots.register`、RPC 用 `TypertRemoteService` + `@Remote`、分发用 `dsh.bundle.patch`——这些都能在官方文档里逐条对上。
- **最值得警惕的 5 个偏离**：
  1. **读调用方主模型用了已废弃 API**：`src/index.ts:194-215` 调 `sessionProjections.stateOf(session, key)`；官方 `docs/upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.zh.md` 已明确说明它被弃用并给出迁移路径，包内类型声明也标了 `@deprecated`。本场景应改用 owning domain service——`exec.agent.model.current()`。见 §4-D1。
  2. **Remote 走 SRC 运行时推断 + 客户端手写 RPC**，没有严格 Typert 生成产物（`typert.host.js` / `typert.remote-client.js` / `exports["./typert"]`）。这是仓外插件缺少生成入口时的现实折中，但不是官方主路径。见 §4-D2。
  3. **自建 JobTracker 文本环与取消 RPC**，重复了官方的 `ctx.jobs.readAt`（非消耗读）、`ctx.jobs.kill` 和客户端 `ctx.remote.job.*`。`src/tracker.ts:1-12` 说「kill 会让模型收不到通知」，而当前官方文档明确写「the owning agent still receives the completion notice」——理由与文档相反。见 §4-D3。
  4. **「看起来有校验，实际很松」**：`defineTool` 的 `args` / `value` 被写成 `any`（放弃类型推断），`output.schema` 没有 `required`；配置里 `permissionMode` / `effort` 是裸 `z.string()`，`timeoutMs` 没有下限。见 §4-D4、§4-D5。
  5. **`config.subagents` 是 Anthropic SDK 的 `AgentDefinition`，不是 DSH 的 `ctx.subagents`**。同名不同物，是本项目最容易让学习者建立错误心智模型的地方。见 §4-D7。

---

## 1. 证据分级与判定口径

本文所有结论都带一个证据标签：

| 标签 | 含义 | 读者应如何使用 |
|---|---|---|
| **【文档】** | 官方 `docs/` 有明确章节或句子 | 可以直接当规范引用 |
| **【包】** | 官方 npm 包的 README、源码 JSDoc 或 `.d.ts` 写明，但 `docs/` 未覆盖 | 可信；引用时注明「官方包文档，不在 docs」 |
| **【代码】** | 从本项目源码读出的行为 | 是事实，不一定是「官方推荐」 |
| **【推断】** | 根据代码、CHANGELOG、fork 历史推断的原因 | 需要复核；不要当结论背 |

判定分三类：

| 判定 | 定义 | 学习动作 |
|---|---|---|
| **遵循** | 本项目的写法与官方推荐一致（或就是官方示例的形态） | 可当正面示例照抄 |
| **偏离** | 官方有明确推荐，本项目没照做 | 先读「为什么」，再决定是否模仿；多数标为「本项目知识」 |
| **文档未覆盖** | 官方 `docs/` 没写，只能看包 README/源码/运行时契约 | 学「怎么自己找契约」，不要背结论 |

一个容易混淆的点先说明：**「偏离」不等于「错误」**。本项目的很多偏离有明确产品约束（面板、续跑、实时输出、跨版本兼容）。本文对每个偏离都给「有理由的取舍 / 可能是技术债」的判断，而不是一刀切。

---

## 2. 官方最佳实践清单（按主题）

### 2.1 Cordis 插件契约与生命周期

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| C1 | 插件导出 `name` + 可选 `inject` + `apply(ctx, config)`；服务可用 `Service` 子类形态 | `docs/cordis-tutorial/01-first-plugin.zh.md` §编写插件；`docs/cordis-primer.zh.md` §五个核心概念 | 函数插件不需要 `apply` 方法；对象形态才要求 |
| C2 | 所有注册都是可逆副作用；Cordis 管理的注册用返回的 disposer，Cordis 不管理的资源（定时器、连接、watcher）必须包 `ctx.effect()` 并返回 disposer | `docs/cordis-primer.zh.md` §实践规则；`docs/cordis-tutorial/02-lifecycle-and-effects.zh.md` §Effect、§已经属于 effect 的操作 | 拆除顺序有要求时，把相关工作放进同一个 effect |
| C3 | 不要手动编排启动顺序；用 `inject` 表达依赖，服务就绪前插件保持 PENDING | `docs/cordis-tutorial/03-services.zh.md` §使用 `inject` 消费服务 | 依赖消失时插件会随之卸载，服务恢复后重新加载 |
| C4 | 服务名在扁平命名空间内要有辨识度；不要与 harness 已占用的 `tools` / `llm` 等冲突 | `docs/cordis-tutorial/03-services.zh.md` §命名；`docs/cookbook/adding-a-package.zh.md` §3 确定包拓扑 | host/client 不要复用同一个 Context key |

### 2.2 服务依赖：硬依赖与可选依赖

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| S1 | 缺失时插件不能工作 → 写进 `inject`；缺失时仍能降级 → **不要**写 `inject`，在使用处 `ctx.get(name)` 探测 | `docs/cordis-tutorial/03-services.zh.md` §可选依赖；`docs/cordis-api/context.zh.md` §ctx.get(name, strict?) | `ctx.get` 默认 `strict: true`，只返回提供方 fiber 处于 active 的服务 |
| S2 | `inject` 不是启动时一次性检查；运行中服务消失会卸载依赖方 | `docs/cordis-tutorial/03-services.zh.md` §加载后仍会跟踪依赖关系 | 不要在闭包里长期持有可能失效的服务引用 |

### 2.3 配置

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| F1 | 导出同名 `Config` 接口 + schemastery schema；默认值写在 schema 里；不要导出普通对象 | `docs/cordis-tutorial/05-config.zh.md` §可配置插件；`docs/user/develop/basic/config.zh.md` §定义 Config 类型 | `apply` 永远收到「完整且经过验证」的配置 |
| F2 | **配置错误要响亮**：把约束写进 schema，非法配置在加载时 FAILED，而不是运行到一半才炸 | `docs/user/develop/basic/config.zh.md` §设计原则；`docs/cordis-tutorial/05-config.zh.md` §明确报错 | 「能否在 `cordis.yml` 改变它而不改代码」是可调参数的检验标准 |
| F3 | patch 按 id 定位行并**替换整个 `config`**，不是深合并；组合包应给用户大概率会保留的默认值，其余交给 schema | `docs/architecture.zh.md` §Profile 与组合包；`docs/user/develop/basic/publish.zh.md` §加载顺序 | 用户覆盖时必须重述该行需要的每一个键 |
| F4 | 组合包 manifest：`dsh.bundle.patch` 指向 patch 文件；`dsh.profile.bundles` 是有序层列表 | `docs/user/develop/basic/publish.zh.md` §组合包 manifest；`docs/architecture.zh.md` §Profile 与组合包 | 没有 `dsh.bundle` 的包只当普通依赖安装 |
| F5 | 用 `engines.dsh` 显式声明支持的 DSH 版本；没有时启动器回退检查 `@deepseek-ai/dsh*` peer 范围 | `docs/user/develop/basic/publish.zh.md` §组合包 manifest | 显式声明更清楚，也更容易在安装前拒绝不兼容版本 |

### 2.4 工具注册

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| T1 | 第一方工具用 `defineTool`；它推导并校验 `args`、把 `parameters` 编译成模型可见 JSON Schema | `docs/user/develop/basic/tool.zh.md`；`docs/cordis-tutorial/07-into-the-harness.zh.md` §工具插件 | `ctx.tools.register()` 也接受原始 `ToolDefinition`，但 `defineTool` 是第一方推荐 |
| T2 | `output` 是**必需的** canonical 输出声明：`schema` 校验每次成功返回值，`render` 纯投影成 `ContentBlock[]` | `docs/subsystems/tools.zh.md` §ToolDefinition — 一个已注册的工具 | `output` / `execute` / `presentCall` 等回调绝不能泄漏到模型请求 |
| T3 | 参数与输出用统一 JSON value DSL；对象节点必须显式 `additionalProperties`；必填属性标 `required: true` | `docs/subsystems/tools.zh.md` §统一的 JSON 值 schema DSL | 参数不匹配抛 `ToolArgsError`；输出不匹配抛 `ToolOutputError` |
| T4 | `execute` 必须观察或转发 `exec.signal`，并在自己拥有的工作停稳后才 settle | `docs/subsystems/tools.zh.md` §ToolDefinition（`execute` JSDoc） | 声明 `timeoutMs` 就等于断言「信号中止后能停稳」 |
| T5 | `timeoutMs` 是协作式预算，必须是正有限值；省略表示无截止；它永远不会发给模型 | `docs/subsystems/tools.zh.md` §ToolDefinition（`timeoutMs` JSDoc）、§ctx.tools | 注册表会检查「正有限值」等语义要求 |
| T6 | `presentCall` / `presentResult` 必须是纯函数，只能依赖 `args` / 结果；UI 会在流式与回放中调用 | `docs/subsystems/tools.zh.md` §工具展示 UI 词汇 | 返回 `card` 标签的渲染意图，不依赖任何客户端协议 |
| T7 | 执行策略优先用 `tools/*` 事件（`pre-execute` / `execute` / `post-execute` / `result`），不要改循环 | `docs/cookbook/extension-cookbook.zh.md` §钩子插件；`docs/architecture.zh.md` §新行为的归属位置 | 单调拒绝用 `ctx.tools.guard()`；包裹生命周期用 `tools/execute` |

### 2.5 技能

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| K1 | 运行时注册用 `ctx.skills.register(skill)`，注册是 effect，随插件卸载 | `docs/subsystems/skills.zh.md` §ctx.skills — SkillRegistry | `source` 可以是 `'runtime'`；project 条目 rank 高于 runtime，高于 user |
| K2 | 用户可编辑的内容优先走文件系统 skill（`.dsh/skills`、`.agents/skills` 等）；随包固定内容才用运行时/随包提供方 | `docs/subsystems/skills.zh.md` §本地发现优先级、§skill 身份 | 同名 runtime 条目 first-wins，重复会告警并返回 no-op disposer |

### 2.6 后台作业

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| J1 | 生产方实现 `JobSpec.run(handle): JobHooks`，**同步**返回 hooks；`owner` 是 **SessionId**，不是 Agent 对象 | `docs/subsystems/jobs.zh.md` §生产方约定、§ctx.jobs | 没有 owner 的 job 任何调用方都能看见 |
| J2 | 实时输出用 `handle.append(text, options)`；结果型 job 用 `JobOutcome.result`，模型在结算后第一次 `read` 拿到一次 | `docs/subsystems/jobs.zh.md` §生产方约定、§JobOutcome | `done` 在**资源释放后** resolve，不是工作一完成就 resolve |
| J3 | 观察者用 `ctx.jobs.readAt(id, from, caller)` 做**非消耗**绝对偏移读；模型消费游标走 `read` | `docs/subsystems/jobs.zh.md` §输出环、§ctx.jobs | 两条读路径读同一份字节，互不干扰 |
| J4 | 取消用 `ctx.jobs.kill(id, caller, reason)`；当前文档明确：kill 不是模型请求的取消，**owner agent 仍会收到完成通知** | `docs/subsystems/jobs.zh.md` §ctx.jobs `kill`、§ctx.jobController `kill` | UI 侧还有 `ctx.remote.job.kill` |
| J5 | 工具创建的后台任务应带 `JobSpec.toolCall`，让持久 `job/registered` / `job/settled` 记录能关联到创建它的工具调用 | `docs/subsystems/jobs.zh.md` §JobSpec、§Session 生命周期记录 | 字段可选，但官方说明了它的用途 |
| J6 | `JobSpec.outputLimitBytes` 限制「模型可见的完成通知/输出读」的字节数，与观察者无关 | `docs/subsystems/jobs.zh.md` §JobSpec | 不设置就走注册表默认 |
| J7 | 新增 `kind` 通过声明合并扩展 `JobKindMap` | `docs/subsystems/jobs.zh.md` §ID 与状态 | 注册表把 kind 当不透明 id 命名空间 |

### 2.7 客户端

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| U1 | 客户端插件在 `package.json` 声明 `dsh.client`（`platform: 'web'`、可选 `inject` 边、可选 `immediately`），并导出 `exports["./client"]` | `docs/subsystems/client-modules.zh.md` §扫描 | 扫描按 Loader entry 增量对账；缺 bundle 会让组合失败 |
| U2 | `dsh.client.inject` 是**信息性 package-name 依赖**，不是 Cordis 服务注入；额外模块请求用 `dsh.client.external` | 包内 `DshClientManifest` JSDoc（【包】）；`docs/subsystems/client-modules.zh.md` §扫描、§wire | 纯类型 import 会被擦除，不产生请求 |
| U3 | 向别人的 slot 贡献内容必须 `ctx.slots.inject(key, callback)` 包 `ctx.slots.register(...)`；裸 `register` 在 owner 尚未声明时会失败 | `docs/subsystems/slots.zh.md` §声明与生命周期、§扩展规则 | callback 会在每段声明生命周期内运行，owner 折叠时自动移除 |
| U4 | 增量扩展用新的 list/hoc `id` 或未占用的 keyed key；复用已有 `single` / keyed cell 是**有意替换** | `docs/subsystems/slots.zh.md` §Cardinality 与 scope、§扩展规则 | 新 entry id 与内置 tab 并存；复用 id 会替换 |
| U5 | Remote 方法用 `@Remote` / `@RemoteScope`；业务服务继承 `TypertRemoteService` 或 `bindTypertRemote()`；Client 用 `connection.rpc.call('/api', '&lt;ns&gt;/&lt;method&gt;', { args }, signal)` | `docs/api-gateway.zh.md` §编程模型、§运行时调用 | 方法签名会被严格分析：参数必须具名、必填、简单标识符 |
| U6 | 生产构建走严格 Typert 生成：Host `typert.host.js`、Client `typert.remote-client.js`，包导出 `./typert` 与 `./remote` | `docs/api-gateway.zh.md` §严格生成流水线 | 生成器是 Host aggregate 的唯一 `ts.Program` 种子 |
| U7 | SRC 是**开发回退**：从运行中函数解析简单参数名，不读类型、不生成 codec；Client 不会从运行中的 Host 发现 decorator | `docs/api-gateway.zh.md` §SRC 开发回退 | 参数名即 wire 字段名；不能解构/默认值/rest/重复名 |
| U8 | 客户端 bundle 是 `window.__ModuleLoader__.load({ id, factory })`；`id` 必须等于包名；`factory(require)` 只能解析 shell 的 seed 模块表 | 包内 `@deepseek-ai/dsh-client-modules/README.zh.md` §启动 manifest 注入、§共享模块；`src/client/manifest.ts` JSDoc（【包】） | 这是运行时契约，`docs/` 未覆盖 |

### 2.8 会话、持久化、子代理

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| P1 | DSH 的持久化是 `SessionEvent` 日志；`ctx.sessionPersistence` 提供 `create` / `open` / `stat` / `list`，逐会话 `SessionHandle` 承载 `read` / `append` / `flush` / `close` | `docs/subsystems/persistence.zh.md` §SessionHandle、§ctx.sessionPersistence | 单写者所有权由句柄租约把守；`flush` 才是持久性屏障 |
| P2 | 「必须在重新加载后仍然存在」的事实 → 会话事件；模型可见即已记录；插件贡献仅日志事件 | `docs/architecture.zh.md` §事件、§会话日志 | fork / 恢复 / transcript 都从持久 settlement 派生 |
| P3 | 读调用方当前模型选择用 owning domain service；投影注册表要求 consumer 在激活期 `await register()` 并保留 handle | `docs/subsystems/session-projection.zh.md` §注册表：ctx.sessionProjections；`@deepseek-ai/dsh-agent` `Model.current()`（【包】） | `sessionProjections.stateOf(session,key)` 已标 `@deprecated` |
| P4 | 委派给另一个 agent 产品的官方机制是 `ctx.subagents` 提供方注册表；已有 `dsh-subagent-claude-code` 等提供方 | `docs/cookbook/extension-cookbook.zh.md` §功能→机制映射（subagent 委派）；`docs/subsystems/subagent.zh.md` §提供方约定 | `SubagentProvider.start()` 返回一次执行句柄；本地子代理才有持久 Session |
| P5 | 需要独立目录时，子代理请求的 `cwd` 省略会继承父级当前目录 | `docs/subsystems/subagent.zh.md` §能力与 activation 请求 | 相对路径以父级当前有效目录解析 |

### 2.9 构建与发布

| # | 最佳实践 | 出处 | 要点 |
|---|---|---|---|
| B1 | `package.json`：`type: module`、`main: lib/index.js`、`types`、`exports["."]`；`@deepseek-ai/cordis` 同时在 peer 和 dev；每个 dsh peer 在 dev 中镜像 | `docs/cookbook/adding-a-package.zh.md` §1 创建包 | 这是 dsh 仓库内包的不变式；仓外插件至少应保持 peer/dev 成对 |
| B2 | `@deepseek-ai/schemastery` 是运行时校验器，放 `dependencies` | `docs/cookbook/adding-a-package.zh.md` §1 创建包 | 仓外插件若用 peer 共享实例，要确认宿主运行时可见 |
| B3 | `files` 精确列出发布产物；`src` 与声明映射随产物一起发布 | `docs/cookbook/adding-a-package.zh.md` §1 创建包 | 不要发布陈旧根声明文件 |
| B4 | 构建必须产出每个 `lib/client.js`；缺失会让激活明确失败 | 包内 `dsh-client-modules/README.zh.md` §构建要求（【包】） | 客户端 bundle 是构建产物，不是源码启动可替代的 |
| B5 | 能力 seam 三角色：Service Definition / Service Provider / Consumer；可替换能力才拆包 | `docs/architecture.zh.md` §能力 seam；`docs/capability-seams.zh.md` | 单一角色本身不是 seam |

---

## 3. 三栏对照：遵循 / 偏离 / 文档未覆盖

### 3.1 遵循（正面示例，可照抄）

| 条目 | 官方推荐（出处） | 本项目做法（文件:行号） | 说明 |
|---|---|---|---|
| 插件契约 | `name` / `inject` / `apply`（`cordis-tutorial/01` §编写插件） | `src/index.ts:20`, `:27`, `:1174` | 标准函数插件 |
| 硬依赖声明 | 缺失即不可用时写 `inject`（`cordis-tutorial/03` §使用 inject） | `src/index.ts:27` `['tools','skills']`；`src/client/index.ts:19` `['slots','connection']` | 工具/技能/槽位/连接都是硬依赖 |
| 可选依赖 | 缺失可降级 → `ctx.get(name)`（`cordis-tutorial/03` §可选依赖） | `src/index.ts:198-214` 读 `sessionProjections`；`src/index.ts:1385` 读 `jobs`；`src/client/index.ts:32` 读客户端 `jobs` | 与官方示例同形 |
| 配置形态 | 同名接口 + schemastery + 默认值（`cordis-tutorial/05` §可配置插件） | `src/index.ts:68-181` | 通过 schema 校验、补默认值 |
| 无硬编码部署参数 | 不同部署可能不同的参数必须是配置字段（`basic/config` §设计原则） | `src/index.ts:98-181` 把 model / timeout / proxy / shell 等全部暴露 | 正面示例 |
| 注册即 effect | `ctx.tools.register` / `ctx.skills.register` / `ctx.slots.register` 自动撤销（`cordis-tutorial/02` §已经属于 effect 的操作） | `src/index.ts:1175-1176`, `:1188`；`src/client/index.ts:34` | 没有手写 disposer |
| 工具定义 | `defineTool` + `parameters` + `output.schema` + `output.render` + `execute`（`basic/tool` 全文） | `src/index.ts:1188-1480` | 四段结构齐全 |
| 工具展示 | `presentCall` 纯函数、只依赖 args（`tools` §工具展示 UI 词汇） | `src/index.ts:1474-1479` | 返回 `card: 'generic'` |
| 执行取消 | `execute` 观察/转发 `exec.signal`（`tools` §ToolDefinition） | `src/index.ts:1399-1401`, `:1471` | 前台路径转发到 SDK abort |
| 工具超时声明 | `timeoutMs` 是协作式预算，声明即承诺可停稳（`tools` §ToolDefinition） | `src/index.ts:1328` | 声明本身合规；0 值与 per-call 语义见 D6 |
| 后台生产方 | `jobs.start({ kind, label, owner, run })`，`run` 同步返回 hooks（`jobs` §生产方约定） | `src/index.ts:989-1148` | 形态正确 |
| owner 用 SessionId | `JobSpec.owner` 是 Owning session（`jobs` §JobSpec） | `src/index.ts:992-996` | 0.7.1 的关键修复 |
| 输出环 | `handle.append()` 推流、`JobOutcome.result` 交结果（`jobs` §生产方约定） | `src/index.ts:1016-1025`, `:1076-1079` | 0.7.1 的关键修复 |
| 客户端清单 | `dsh.client.platform` + `exports["./client"]`（`client-modules` §扫描） | `package.json:13-16`, `:30-37` | 标准声明 |
| slot 贡献 | `ctx.slots.inject(key, () => register(...))`（`slots` §声明与生命周期） | `src/client/index.ts:34-39` | 与官方示例逐字同形 |
| 新 entry id | 新 tab 用新 id；复用 id 会替换（`slots` §Cardinality 与 scope） | `id: 'claude-code'`（`src/client/index.ts:36`） | 与 chat / trajectory 并存 |
| Remote 服务 | `TypertRemoteService` + `@Remote`（`api-gateway` §编程模型） | `src/remote.ts:74-172` | 服务 key `claudeCode` 有辨识度 |
| SRC 参数约束 | 普通标识符、无解构/默认值/rest、避开 lookup 参数名（`api-gateway` §SRC 开发回退） | `src/remote.ts:11-14`, `:92-172` | 注释与官方规则一致 |
| 组合包 patch | `dsh.bundle.patch` + `insert` 行（`publish` §组合包 manifest） | `package.json:26-29`；`cordis.patch.yml:10-17` | 标准安装路径 |
| patch 默认值 | 给用户大概率保留的默认值，其余交给 schema（`publish` §加载顺序） | `cordis.patch.yml` 只写 4 个键 | 不重复 schema 默认值 |
| 运行时技能 | `ctx.skills.register`，`source: 'runtime'` 是合法来源（`skills` §skill 身份、§ctx.skills） | `src/index.ts:1175-1176`；`src/delegation-skill.ts:12` | 注册是 effect |
| 会话 cwd | 读 `agent.session.header.cwd`（`persistence` §SessionHeader） | `src/index.ts:225-233` | 与内置 fs/bash/jobs 工具同源 |
| 产物断言 | 缺失 `lib/client.js` 会让激活失败（`client-modules` README §构建要求） | `scripts/assert-artifacts.mjs:14-42`；`package.json:55` | 比官方最低要求更强 |

### 3.2 偏离

| 条目 | 官方推荐（出处） | 本项目做法（文件:行号） | 判定与说明 |
|---|---|---|---|
| D1 读主模型 | owning domain service / 保留投影 handle（`session-projection` §注册表；`upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.zh.md` §变更/§迁移；包内 d.ts `@deprecated`） | `sessionProjections.stateOf(session,'modelSelection')`（`src/index.ts:194-215`, `:1330`） | **技术债**：用了已废弃便捷读，版本升级有风险 |
| D2 Remote 契约 | 严格 Typert 生成 + `./typert` / `./remote` 导出（`api-gateway` §严格生成流水线） | SRC 运行时推断 + 客户端手写 `connection.rpc.call`（`src/remote.ts:1-15`；`src/client/api.ts:162-166`；`package.json:8-18` 无 typert 导出） | **有理由的取舍**（仓外插件无生成入口），但脆弱 |
| D3 作业观察/取消 | `ctx.jobs.readAt` + `ctx.jobs.kill` / `ctx.remote.job.kill`（`jobs` §ctx.jobs、§ctx.jobController） | 自建 `JobTracker` 文本环 + `claudeCode/cancel`（`src/tracker.ts:1-12`；`src/remote.ts:163-172`） | **部分技术债**：结构化事件流需要自建；文本/取消可换官方 |
| D4 工具类型 | `defineTool` 推导 args/value，`output.schema` 强制 canonical 形状（`basic/tool`；`tools` §ToolDefinition） | `args: any, value: any`；output schema 无 `required`（`src/index.ts:1288-1329`） | **技术债**：放弃了 defineTool 的主要价值 |
| D5 配置约束 | 约束写进 schema，非法配置加载即失败（`basic/config` §设计原则；`cordis-tutorial/05` §明确报错） | `permissionMode`/`effort` 是 `z.string()`；`timeoutMs` 无 `min`（`src/index.ts:106-116`, `:110`） | **技术债**：非法值到运行时才炸 |
| D6 工具超时 | `timeoutMs` 必须正有限值；省略表示无截止（`tools` §ToolDefinition） | 无条件 `timeoutMs: config.timeoutMs`；per-call 只影响内部计时器（`src/index.ts:1328`, `:1340`） | **技术债/bug 风险**：`timeoutMs: 0` 可能注册失败；前台传更大值无效 |
| D7 子代理 | `ctx.subagents` provider 注册表；已有 `dsh-subagent-claude-code`，其 bundle 还会注册全局委派工具（本项目旧文档称 `subagent_claude_code`）（`extension-cookbook` §功能→机制映射；`upgrade-guide/v0.2.1-alpha.1/native-subagent-bundle-tools/guide.zh.md` §变更） | 自建 `claude_code` 工具；`config.subagents` 是 Anthropic `AgentDefinition`（`src/index.ts:57-66`, `:171-180`, `:424-439`, `:1355`） | **命名陷阱 + 架构选择**：不是 DSH subagent |
| D8 会话持久化 | `ctx.sessionPersistence` 存 `SessionEvent`；跨重载事实用会话事件（`persistence`；`architecture` §事件） | 自建 `~/.dsh/claude-delegate-sessions.json`；进程内 `active` 集合（`src/session-store.ts:71-76`, `:141-149`） | **有理由的旁路**：存的是外部 Claude 句柄；但无跨进程租约 |
| D9 客户端清单 | `dsh.client.inject` 是信息性字段；额外模块用 `external`（包内 `DshClientManifest` JSDoc） | `inject` 含不存在的 `@deepseek-ai/dsh-client-runtime`（`package.json:32-36`） | **陈旧元数据**：运行时无害，但误导 |
| D10 客户端构建 | 官方 tsdown client preset；bundle 只注册 factory，seed 表由 shell 决定（`client-modules` README §共享模块/§构建要求） | 手工 esbuild banner/footer + 硬编码 `SEED_MODULES`（`scripts/build-client.mjs:26-83`） | **文档未覆盖**：仓外可接受；白名单需手工维护 |
| D11 样式注入 | Cordis 不管理的资源包 `ctx.effect`（`cordis-tutorial/02` §Effect） | `installStyles()` 直接 append `&lt;style&gt;`（`src/client/styles.ts:883-891`；`src/client/index.ts:26`） | **小技术债**：幂等且 `data-plugin` 标记，但卸载不清理 |
| D12 发布清单 | 显式 `engines.dsh`；schemastery 进 `dependencies`；`files` 精确（`publish` §组合包 manifest；`adding-a-package` §1） | 无 `engines.dsh`（靠 peer 范围）；schemastery 在 peer；`files` 含整个 `lib`（`package.json:19-24`, `:61-73`） | **轻微偏离/可接受**：回退规则合法；发布前应验证 |
| D13 README 与实现 | 文档应准确描述工具参数（通用最佳实践） | README 把 `subagents` 列为工具参数（`README.md:154`），但工具 schema 没有它（`src/index.ts:1206-1287`） | **文档 bug**：学习者会被误导 |
| D14 作业类型 | 扩展 `JobKindMap`；`JobSpec.toolCall` 记录创建调用（`jobs` §ID 与状态、§JobSpec） | `jobs: any`；`kind: 'claude-code'` 未声明合并；未传 `toolCall`（`src/index.ts:974`, `:989-996`） | **技术债**：类型安全与持久关联缺失 |

### 3.3 文档未覆盖（灰色地带）

| 条目 | 事实来源 | 本项目做法 | 学习者该怎么看 |
|---|---|---|---|
| G1 `window.__ModuleLoader__.load` 契约 | 包内 `dsh-client-modules/README.zh.md` §启动 manifest 注入；`src/client/manifest.ts` JSDoc（【包】） | `scripts/build-client.mjs:1-15`, `:41-83` 手工实现并断言 | 这是真实的官方运行时契约，只是不在 `docs/`；学「读包 README/源码」 |
| G2 客户端 `ctx.jobs` 服务形状 | 官方 `docs/` 未列 API；`config-catalog` 只列 `dsh-client-ui-jobs` 包名（【文档】只到包名） | `src/client/types.ts:36-68`；`src/client/index.ts:32` | 属于按运行时逆向；官方文档化的替代是 `ctx.remote.job.*` |
| G3 `agent.model.current()` | `@deepseek-ai/dsh-agent` `runtime-types.d.ts:47-63`（【包】） | 未使用；改用 `sessionProjections.stateOf` | 这是官方 owning domain service，应该优先用 |
| G4 `sessionProjections.stateOf(session,key)` | 主文档 `session-projection.zh.md` 的 §注册表 未列；`docs/upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.zh.md` 有专章说明弃用与迁移；包内 d.ts 标 `@deprecated` | `src/index.ts:201-208` | 「能用」不等于「推荐」；deprecated 会先告警、后移除 |
| G5 仓外插件的 Typert 生成 | `docs/api-gateway.zh.md` 只描述仓内构建流水线（【文档】） | 选择 SRC 回退 | 官方没有给 npm 插件生成 `typert.remote-client.*` 的文档路径；这是现实空白 |
| G6 `dsh.client.inject` 的语义 | `DshClientManifest` JSDoc 说「informational」，`client-modules` 说「package-name dependency edges」（【包】两处措辞不完全一致） | 当作依赖边使用 | 记住它不是 Cordis 服务注入；模块请求看 `external` |
| G7 `ctx.jobs.kill` 是否通知模型 | `docs/subsystems/jobs.zh.md` §ctx.jobController `kill` 明确「still receives the completion notice」（【文档】） | `src/tracker.ts:1-12` 说「marks a job reported so the model never learns it was cancelled」 | 项目结论与当前文档相反；以文档为准，必要时实测 |
| G8 `optional-inject` 对象形式 | 官方 `docs/` 从未承诺 `{ required, optional }` 形态；只推荐「硬依赖 inject / 可选 ctx.get」（【文档】） | `src/index.ts:21-26` 注释记录 4.x 对象形式会死锁；`CHANGELOG.md:42-43` | 项目的结论正确；但「4.x 没有 optional-inject」是踩坑记录，不是文档条款 |

---

## 4. 偏离逐项分析

### D1 用已废弃的 `sessionProjections.stateOf` 读主模型

- **表现（【代码】）**：`src/index.ts:194-215` 先 `ctx.get('sessionProjections')`，再调 `projections.stateOf(a.session, 'modelSelection')`，取 `pending ?? lastUsed`；`src/index.ts:1330` 在每次 `execute` 读取。
- **官方推荐（【文档】+【包】）**：
  - `docs/subsystems/session-projection.zh.md` §注册表：`ctx.sessionProjections`：consumer 应「await registration during activation, and retain its ready handle」；读取用 `handle.stateOf(session)`。
  - `docs/upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.zh.md` §变更 / §迁移：注册表级 `stateOf(session, key): unknown` **已弃用**；当没有任何插件注册该 key 时它返回 `undefined`（所属插件未组合、尚未注册、或已释放最后一次注册）。迁移方式是「替换为所属服务的方法（例如 `ctx.agents.turnBoundaryOf(session)`），或所有者内部的 `handle.stateOf(session)`；替换之前须处理其 `undefined` 结果」。
  - 包内 `@deepseek-ai/dsh-session-projection/lib/types/index.d.ts:225-227`：registry 级 `stateOf(session, key)` 标 `@deprecated`，JSDoc 写「Use an awaited registration's `handle.stateOf(session)` or the owning domain service」。
  - 本场景的 owning domain service 是 `Agent.model`：`@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:47-63` 的 `Model.current(): Readonly&lt;ModelSelection&gt; | undefined`；`exec.agent.model.current()` 直接可得，且语义覆盖「recorded choice > last request > live options」。
- **差异**：项目的读法能工作（registry 仍保留废弃方法，首次读会打一次 deprecation warning），但绕过了官方推荐的稳定面，且 `pending ?? lastUsed` 需要自己补 `options` 回退；官方还提醒该方法在「key 未注册」时返回 `undefined`，项目通过 optional chaining 把「服务未加载」与「key 未注册」都落到同一个 `options` 回退，行为上可接受，但排障时无法区分原因。
- **可能原因（【推断】）**：0.4.0 写出这段时，该方法可能尚未正式弃用；`v0.2.1-rc.2` 的 upgrade guide 才把它列为弃用。另外 `sessionProjections` 是可选服务，项目为了「没有 projection 的 profile 也能加载」选择了运行时探测，`ctx.get` + 运行时 `typeof` 检查是最省事的写法；fork 基线与 0.2.0-rc.2 的类型环境也可能促成了这个形状。
- **判断**：**可能是技术债**。功能可用，但踩在 deprecated 面上；DSH 后续移除该便捷读时会静默降级到 `agent.options.model`（创建时值，不含 mid-session 切换与 effort）。
- **学习者该怎么做**：在 `execute` 里用 `exec.agent?.model.current()`；如果必须兼容没有该 API 的旧版，再按「owning domain service → projection handle → options」三级回退，并把回退写成显式注释。不要照抄 `stateOf(session,key)`。

### D2 Remote 走 SRC 回退 + 客户端手写 RPC

- **表现（【代码】）**：`src/remote.ts:1-15` 明确说「The harness ships no Client→Host channel for background jobs... It is a plain `TypertRemoteService`: the api-gateway discovers `@Remote` methods by reflecting over live services (its SRC mode), which needs no typert codegen.」；`src/client/api.ts:162-166` 直接 `connection.rpc.call('/api', 'claudeCode/&lt;method&gt;', { args })`；`package.json:8-18` 只有 `.` 和 `./client`，没有 `./typert` / `./remote`。
- **官方推荐（【文档】）**：`docs/api-gateway.zh.md` §严格生成流水线要求业务包产出 `typert.host.js` / `typert.remote-client.js`，并通过 `./typert` / `./remote` 暴露；Client 通过 `ctx.remote.&lt;namespace&gt;` 调用生成的方法。§SRC 开发回退明确把它定位为「开发回退」：从运行中函数解析参数名、不读类型、不生成 codec；「Client Remote 也拒绝挂载缺少严格 codec 的 SRC 描述符」。
- **差异**：项目在**生产**里使用 SRC + 手写 RPC，而不是严格生成的 Remote client namespace。优点是不需要 codegen、参数名即 wire 字段；缺点是：
  - 没有编译期参数/返回类型校验；
  - 参数名成为公开契约，重命名会破坏线上调用；
  - 官方明确说 SRC 是「较弱的临时描述符」，且严格 endpoint 撤回后不会降级到 SRC。
- **可能原因（【推断】）**：仓外插件没有文档化的 Typert 生成入口——生成器以 Host aggregate 为唯一 `ts.Program` 种子，npm 插件不可能把自己的源码塞进 DSH 的构建。项目要么改 DSH 构建，要么走 SRC。SRC 是唯一可行的运行时路径。
- **判断**：**有理由的取舍**，但属于「官方文档没给仓外插件铺路」的空白。对外部插件可接受；对能进 DSH 仓库的插件，应走严格生成。
- **学习者该怎么做**：先学严格生成流水线的概念（为什么需要 codec、lookup、资源授权）；如果做仓外插件，把 SRC 参数名当 API 契约，写一个最小契约测试（调用每个 `@Remote` 方法并断言字段），不要依赖 TypeScript 类型来保证 wire 兼容。

### D3 自建 JobTracker 文本环与取消 RPC

- **表现（【代码】）**：
  - `src/tracker.ts:1-12`：`ctx.jobs.read()` 有与模型共享的单一游标，`ctx.jobs.kill()`「marks a job reported so the model never learns it was cancelled」；因此面板读自己的 mirror、走自己的 AbortController。
  - `src/index.ts:919-953` 自建 `createBuffer()`（绝对偏移、多读者）；`src/remote.ts:110-140` 提供 `readOutput` / `readEvents`；`src/remote.ts:163-172` 提供 `cancel`。
- **官方推荐（【文档】）**：
  - `docs/subsystems/jobs.zh.md` §输出环 / §ctx.jobs：`readAt(id, from, caller)` 是**非消耗**绝对偏移读，与模型游标互不干扰；`kill(id, caller, reason)`「request cancellation, then mark the job stopping」。
  - `docs/subsystems/jobs.zh.md` §ctx.jobController `kill`：kill 的 reason 是 `cancelled by the user`，「it is not one the model requested, so the owning agent still receives the completion notice」。
  - 客户端侧有文档化的 `ctx.remote.job.list(request)` / `follow(request)` / `kill(request)`。
- **差异**：
  - **文本输出**：官方 `readAt` 已经提供与项目 `createBuffer().read` 同形的能力（绝对偏移、多读者、不消耗游标）。项目对后台 job 的文本 mirror 是重复实现。
  - **取消**：官方 `kill` 会调用生产方的 `JobHooks.cancel`，项目的 `run()` 返回的 `cancel` 正是 `abort.abort('cancelled')`；因此 `kill` 能达到同样效果，而且按文档模型仍会收到通知。项目注释的「kill 吞掉通知」与当前文档相反（见 G7）。
  - **结构化事件**：`thinking` / `tool_use` / `tool_result` / `console` / `warning` 没有官方等价物，必须自建。
  - **前台委派**：`foreground-&lt;n&gt;` 不是 harness job，没有 jobId，必须走自己的 mirror。
- **可能原因（【推断】）**：面板在 0.3.0 落地时，官方 jobs 观察 API 还没有 `readAt` / `ctx.remote.job`（或项目基于 fork 时的旧版本文档）；`ctx.jobs.kill` 的旧行为可能确实吞过通知，后来官方修了，项目注释没跟着更新。fork 历史 + 多版本兼容（0.1.x / 0.2）也促使项目自己兜底。
- **判断**：**部分技术债**。结构化事件与前台委派的自建是有理由的；后台 job 的文本读取与取消，按 0.2.2-rc.5 文档应优先用官方 seam。保留 mirror 作为「统一多来源」的适配层可以，但不应把它当成官方机制缺失的证据。
- **学习者该怎么做**：先读 `jobs.zh.md` 的「输出环」「ctx.jobs」「ctx.jobController」三节；做面板时优先 `ctx.remote.job.list/follow/kill`；只有需要逐块事件（tool_use/thinking）时才自建事件环。不要把 `tracker.ts` 的注释当官方结论。

### D4 `defineTool` 的类型推断被 `any` 绕过，`output.schema` 没有 `required`

- **表现（【代码】）**：
  - `src/index.ts:1329` `async execute(args: any, exec)`；`src/index.ts:1308` `render: (_args: any, value: any) => ...`。
  - `output.schema`（`src/index.ts:1288-1307`）是 `type: 'object'` + `additionalProperties: false` + `properties`，但**没有 `required` 数组**；每个属性也没有 DSL 的 `required: true`。
- **官方推荐（【文档】）**：
  - `docs/user/develop/basic/tool.zh.md`：`defineTool` 根据 `parameters` 推导并校验 `args`；`execute` 返回 `output.schema` 声明的规范值。
  - `docs/cordis-tutorial/07-into-the-harness.zh.md` §工具插件：`defineTool` 将 `parameters` 规约转换为模型可见 JSON Schema，推导 `args` 类型，并在 `execute` 前校验参数。
  - `docs/subsystems/tools.zh.md` §ToolDefinition：`output` 是**必需的 canonical 输出声明**，`schema` 会「enforced against every successful canonical value」。
- **差异**：项目仍然调用 `defineTool`（外壳正确），但把它的两个核心价值——参数类型推断、输出形状校验——都绕过了：
  - `args: any` 让模型传错参数时的类型提示消失；
  - 无 `required` 让 `{}` 也算合法 canonical 值，`render` 里只能靠 `??` 兜底；
  - `value: any` 让 `render` 与 schema 脱钩，schema 改了编译器不会提醒。
- **可能原因（【推断】）**：fork 基线早期用的可能是手写 `ToolDefinition`，后来换成 `defineTool` 但没回头补类型；参数多达 20 个、`outputSchema` 是 `type: 'json'`，作者可能觉得推断收益低。
- **判断**：**可能是技术债**。运行时仍会校验（defineTool 会校验），但「写起来像有类型、实际没有」比纯 JavaScript 更危险。
- **学习者该怎么做**：保持 `defineTool` 的推断；`parameters` 里每个必填项写 `required: true`；`output.schema` 的对象属性也标必填；如果确实需要动态形状，用 `{ type: 'json' }` 明确表达，而不是 `any` 逃逸。

### D5 配置 schema 约束不足

- **表现（【代码】）**：
  - `permissionMode: z.string()`（`src/index.ts:106`）——合法值是 6 个枚举，但 schema 不校验。
  - `effort: z.string()`（`src/index.ts:116`）——合法值是 `low/medium/high/xhigh/max`，但 schema 不校验。
  - `timeoutMs: z.number()`（`src/index.ts:110`）、`maxTurns`、`maxBudgetUsd`、`shellTimeoutMs` 都没有 `min`。
- **官方推荐（【文档】）**：
  - `docs/user/develop/basic/config.zh.md` §设计原则：「配置错误要响亮」；在 schema 中表达自身完备的约束，使无效配置在插件加载时失败。
  - `docs/cordis-tutorial/05-config.zh.md` §明确报错：无效配置让 fiber 进入 FAILED，并给出准确错误。
- **差异**：非法 `permissionMode` / `effort` 会一路传到 Anthropic SDK，等到第一次委派才失败；非法 `timeoutMs`（0、负数、NaN）可能让工具注册失败（见 D6）。这违反了「加载时失败」的官方原则。
- **可能原因（【推断】）**：`PERMISSION_MODES` / `EFFORT_LEVELS` 已经是常量，作者可能想在 tool 参数 enum 与 config 之间复用，最后只在 tool 参数用了 enum；config 保持 `z.string()` 以允许未来新增值而不改 schema。
- **判断**：**可能是技术债**。可以接受「model 是开放字符串」，但不能接受「permissionMode/effort 是开放字符串」。
- **学习者该怎么做**：用 `z.union([...PERMISSION_MODES])` / `z.union([...EFFORT_LEVELS])`；数值加 `.min(1)` / `.max(...)`；如果确实要允许扩展，用「已知枚举 + 自定义字符串」的显式策略，并写进描述。

### D6 工具超时：静态 `timeoutMs` 与 per-call `timeoutMs` 的错位

- **表现（【代码】）**：
  - `src/index.ts:1328` 在注册时写死 `timeoutMs: config.timeoutMs`。
  - `src/index.ts:1340` per-call 的 `args.timeoutMs` 只进入内部 `RunRequest.timeoutMs`，由 `src/index.ts:1106-1112` 的定时器 abort SDK。
  - 前台路径同时有 harness 的 tool-call timeout policy（若 profile 加载了 `@deepseek-ai/dsh-tool-call-timeout-policy`，其预算基于注册时的 `config.timeoutMs`）和内部定时器（基于 `args.timeoutMs ?? config.timeoutMs`）。
- **官方推荐（【文档】）**：
  - `docs/subsystems/tools.zh.md` §ToolDefinition（`timeoutMs` JSDoc）：协作式预算，必须正有限值；省略表示无截止；声明它等于断言工具会转发 `exec.signal` 并在中止后停稳。
  - `docs/subsystems/tools.zh.md` 注册表说明：`timeoutMs` 必须是正有限值。
- **差异**：
  - 前台传一个**更大**的 `args.timeoutMs` 不会延长 harness 的预算——harness 仍按 `config.timeoutMs` 先中止；工具描述说「overrides the plugin config」，语义不准确。
  - `config.timeoutMs = 0`（schema 允许）会让注册时的 `timeoutMs: 0` 触发「正有限值」检查，可能导致整个插件 fiber FAILED。
  - 两阶段警告（`warnTimeoutMs` / `warnIntervalMs`）是产品增强，官方没有对应机制；这部分不是偏离，但需要和 harness 超时区分。
- **可能原因（【推断】）**：0.3.2 加两阶段超时时，后台任务还没有 harness 的 tool-call 约束；后来接入 `defineTool` 时直接把 config 值塞进去，没有处理 0 和 per-call 覆盖。
- **判断**：**技术债 + 潜在 bug**。后台模式下 per-call `timeoutMs` 是有效的（工具调用已返回），前台模式下只能缩短、不能延长。
- **学习者该怎么做**：注册时用 `...(config.timeoutMs > 0 ? { timeoutMs: config.timeoutMs } : {})`；per-call 覆盖只用于后台，或在描述里明确「只能缩短前台预算」；两阶段警告放在自己的 `run()` 里，不要试图用 `timeoutMs` 表达。

### D7 `config.subagents` 不是 DSH 的 `ctx.subagents`

- **表现（【代码】）**：
  - `src/index.ts:57-66` 定义 `SubagentConfig`；`:171-180` 用 schemastery `z.dict(z.object({ description, prompt, tools, disallowedTools, model, maxTurns, initialPrompt, background }))`；`:424-439` 转成 Anthropic `AgentDefinition`；`:1355` 塞进 SDK `options.agents`。
  - 全仓库没有 `ctx.subagents` 的注册或调用。
- **官方推荐（【文档】）**：
  - `docs/cookbook/extension-cookbook.zh.md` §功能→机制映射「subagent 委派」行：`ctx.subagents` 提供方注册表（`dsh-subagent-spawn-in-process` / `dsh-subagent-fork-in-process` / `dsh-subagent-acp` / `dsh-subagent-codex` / `dsh-subagent-claude-code` / `dsh-subagent-dsh-sdk`）+ `dsh-tool-subagent` 向模型暴露一个已配置的提供方。
  - `docs/upgrade-guide/v0.2.1-alpha.1/native-subagent-bundle-tools/guide.zh.md` §变更：`@deepseek-ai/dsh-subagent-claude-code` 的 bundle 现在会把委派工具注册为 **Host 全局工具**（包括 minimal 在内的所有预设都可见），委派走共享的托管 activation API——工具返回子级 ID，完成结果通过已记录的通知发给父 Agent。
  - `docs/subsystems/subagent.zh.md` §提供方约定：`SubagentProvider.start()` 返回一次外部执行句柄；本地子代理才有持久 Session、inbox、多轮。
- **差异**：两个「subagent」完全不同：
  - **DSH 的 `ctx.subagents`**：DSH 管理的子代理树，拥有 session、深度限制、结果投递、目录发现。
  - **本项目的 `config.subagents`**：传给 Claude Code CLI 的 `AgentDefinition`，是 Claude Code 自己的 Agent 工具配置，发生在被委派的 Claude 进程内部。
- **可能原因（【推断】）**：项目的产品目标是「把 Claude Code 当一个外部工具」，而不是「把 Claude Code 接成 DSH 子代理」。接成 DSH 子代理会失去面板、resume、实时输出通道这些围绕 `claude_code` 工具构建的能力；上游 fork 也已经是工具形态。
- **判断**：**架构选择 + 命名陷阱**。选择工具形态有理由；但 `config.subagents` 这个命名会让学习者以为是 DSH 机制。README 没有明确区分。
- **学习者该怎么做**：记住两条线——要 DSH 管理子代理（深度、目录、消息、Team），用 `ctx.subagents` 或现成的 `dsh-subagent-claude-code`；要让 Claude Code 自己派生小助手，用 SDK 的 `agents`（本项目的 `config.subagents`）。不要把两者混为一谈。

### D8 自建 `session-store.ts` 与 DSH `sessionPersistence`

- **表现（【代码】）**：
  - `src/session-store.ts:1-28` 说明这是「workstream name + cwd → 外部 Claude session id」的注册表；`:71-76` 存到 `$DSH_HOME/claude-delegate-sessions.json`；`:141-149` 用进程内 `active` Set 标记「有 run 在飞」的 key。
  - `src/index.ts:881-909` 在每次成功后 `sessions.remember(...)`；`:1374-1382` 在每次调用前 `sessions.plan(...)`。
- **官方推荐（【文档】）**：
  - `docs/subsystems/persistence.zh.md` §SessionHandle / §ctx.sessionPersistence：DSH 的持久化是 `SessionEvent` 日志，`SessionHandle` 是单写者租约；`flush` 是持久性屏障。
  - `docs/architecture.zh.md` §事件：「当某个事实必须在重新加载后仍然存在时，使用会话事件。」
  - `docs/architecture.zh.md` §新行为的归属位置：「添加持久会话状态 → 扩展 `SessionEventMap`；从日志渲染和回放。」
- **差异**：两者不是一回事：
  - DSH `sessionPersistence` 存的是 **DSH 自己的** `SessionEvent` 日志，用于恢复 agent 对话。
  - 本项目存的是**外部 Claude Code 的 session id**，用于下一次 `query({ resume })`。DSH 的会话日志并没有为「外部 Claude 句柄」提供现成语义（插件可以扩展 `SessionEventMap` 承载它，但那是另一条路，且会把外部句柄带进 DSH 的日志词汇）。
  - 项目的 `active` 集合只在**进程内**互斥；两个 DSH 进程仍可能同时 resume 同一个 Claude session。官方 `SessionHandle` 的跨进程写租约正是为解决这类问题设计的，但它管不了外部 Claude 会话。
- **可能原因（【推断】）**：产品需要「同一个工作流名 + 目录自动续接」，而 DSH 没有「外部会话句柄」的持久化原语；fork 基线也已经在用文件。把注册表放进 `$DSH_HOME` 是最小摩擦的做法。
- **判断**：**有理由的旁路**，但有两个值得记录的局限：跨进程无互斥；注册表是旁路状态，不参与 DSH 的 fork/回放。若未来要更强的可观测性，可以把「workstream 注册/续接」作为插件贡献的仅日志会话事件（`architecture` §会话日志「插件贡献的仅日志事件」），但不要把外部 session id 塞进模型可见历史。
- **学习者该怎么做**：先分清「DSH 会话持久化」与「外部产品句柄持久化」。不要因为本项目有 `session-store.ts` 就以为 `ctx.sessionPersistence` 是可选品；相反，凡是 DSH 自己的状态，优先用会话事件/官方 seam。旁路文件只用于官方 seam 表达不了的外部句柄。

### D9 客户端清单：`dsh.client.inject` 的陈旧项与语义混淆

- **表现（【代码】）**：`package.json:30-37`：
  ```json
  "dsh": {
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-ui-conversation"
      ]
    }
  }
  ```
  `@deepseek-ai/dsh-client-runtime` 在 0.2.2-rc.5 的安装树中**不存在**（`find` 无结果）。
- **官方推荐（【包】）**：`DshClientManifest.inject` 的 JSDoc 写「Informational package-name dependencies, not Cordis service injection.」；`docs/subsystems/client-modules.zh.md` §扫描说它是「可选的 `inject` 边」，§wire 说「Package-name dependency edges used for factory arrival and plugin composition」。额外模块请求应使用 `dsh.client.external`。
- **差异**：项目把一个不存在的包名放进信息性字段；运行时没有造成故障（因为它是信息性的），但会让读者误以为它参与了依赖注入，也会在包名/版本变化时留下噪音。
- **可能原因（【推断】）**：上游 fork 时期 `dsh-client-runtime` 可能是一个真实包，0.2 线重命名/合并后没有同步；`inject` 字段从未被运行时严格校验，所以一直没暴露。
- **判断**：**陈旧元数据**，不是功能 bug；属于低成本可修项。
- **学习者该怎么做**：`dsh.client.inject` 只当「信息性 package 依赖」；真正需要额外模块时用 `external`；Cordis 服务依赖写在客户端插件的 `export const inject = [...]` 里。两者同名但语义不同。

### D10 手工 esbuild bundle 与硬编码 seed 表

- **表现（【代码】）**：`scripts/build-client.mjs:1-15` 的注释准确描述了契约；`:26-39` 硬编码 12 个 `SEED_MODULES`；`:41-50` 用 banner/footer 包成 `window.__ModuleLoader__.load({ id, factory })`；`:70-83` 断言开头、id、以及「每个 require 都在 seed 表里」。实际产物只 require `react` 和 `react/jsx-runtime`。
- **官方推荐（【包】）**：`dsh-client-modules/README.zh.md` §启动 manifest 注入 / §共享模块：bundle 通过 `window.__ModuleLoader__.load` 注册 factory；shell 初始化冻结的 `PLATFORM_MODULES`；每个动态 bundle 精确针对该基座解析 external；`dsh.client.external` 只添加基座之外的精确请求。官方仓库内客户端包使用共享 tsdown preset（`adding-a-package.zh.md` §2 注册）。
- **差异**：项目没有用官方 preset，而是手工维护 seed 白名单。因为本项目 bundle 只依赖 React，当前白名单是超集，不会出错；但它不是从宿主 `PLATFORM_MODULES` 派生，宿主换版本/换表时不会自动发现。
- **可能原因（【推断】）**：仓外构建没有文档化的 preset 入口；esbuild 是最小依赖；fork 基线的构建脚本已经存在。
- **判断**：**文档未覆盖下的合理工程**。对学习者：这是「读脚本才能学到的 DSH 客户端工程知识」，不是官方章节。
- **学习者该怎么做**：如果能在 DSH 仓库内构建，用官方 preset；如果在仓外，照这个形状写，但至少把「每个 require 必须在宿主 seed 表」写成构建断言（本项目已经这样做），并在 README 记录契约来源。

### D11 `installStyles()` 不在 `ctx.effect` 内

- **表现（【代码】）**：`src/client/index.ts:26` 在 `apply` 里调用 `installStyles()`；`src/client/styles.ts:883-891` 用 `document.getElementById` 去重，然后 append 一个带 `data-plugin` 的 `&lt;style&gt;`。没有返回 disposer。
- **官方推荐（【文档】）**：`docs/cordis-tutorial/02-lifecycle-and-effects.zh.md` §Effect：「对于 Cordis 尚未管理的资源，例如定时器、连接或 watcher，应将其包装在 `ctx.effect()` 中并返回 disposer。」；§已经属于 effect 的操作列出哪些注册自动撤销，DOM 样式不在其中。
- **差异**：样式标签在插件卸载/HMR 后仍留在页面。因为样式是全局、幂等、带 `data-plugin` 标记，实际影响很小；但它不符合「资源随 fiber 撤销」的模型。
- **判断**：**小技术债**。不是功能问题，是生命周期整洁度问题。
- **学习者该怎么做**：事件监听、定时器、WebSocket、observer 一律 `ctx.effect`（本项目在组件内的 `addEventListener` 已经正确返回 cleanup）；全局主题/样式可以接受手动注入，但要幂等并标记 owner。

### D12 发布清单的轻微偏离

- **表现（【代码】）**：`package.json` 没有 `engines.dsh`；`@deepseek-ai/schemastery` 在 `peerDependencies` + `devDependencies`，不在 `dependencies`；`files` 是 `["lib", "lib/client.js", "cordis.patch.yml", "CHANGELOG.md"]`（`lib` 已覆盖 `lib/client.js`）；devDependencies 里有 `dsh-agent` / `dsh-brand` / `dsh-invariants` / `dsh-llm` / `dsh-scope` / `dsh-session`，源码未直接 import。
- **官方推荐（【文档】+【包】）**：
  - `docs/user/develop/basic/publish.zh.md` §组合包 manifest：优先 `engines.dsh`；没有时回退 `@deepseek-ai/dsh*` peer 范围。
  - `docs/cookbook/adding-a-package.zh.md` §1：schemastery 放 `dependencies`；`files` 精确；每个 dsh peer 在 dev 镜像。
- **差异**：项目靠 peer 范围（`&gt;=0.1.0-rc.6 &lt;0.3.0`）表达兼容性，符合回退规则；但显式 `engines.dsh` 更清楚。schemastery 作为 peer 的意图可能是「与宿主共享同一个 schema 实例」，但官方仓内不变式要求它是运行时依赖；仓外插件要确认 profile 解析时能找到它。多余 devDeps 只是发布/安装噪音。
- **判断**：**可接受 / 轻微技术债**。不影响功能，但发布前应在一个干净 profile 里 `dsh plugin add` 验证。
- **学习者该怎么做**：抄官方清单；显式写 `engines.dsh`；`files` 用精确列表；peer 与 dev 成对；运行 `npm pack --dry-run` 检查 tarball。

### D13 README 与实现不一致（附带发现）

- **表现（【代码】）**：`README.md:154` 把 `subagents` 列为 `claude_code` 的工具参数（「默认值：配置值」），但 `src/index.ts:1206-1287` 的参数表里没有 `subagents`；它只存在于 `Config`（`:171-180`）。
- **官方推荐**：这是通用文档质量问题，不是 DSH 特定条款；官方 `adding-a-package.zh.md` §4 要求包 README 准确记录 API。
- **判断**：**文档 bug**。学习者如果按 README 传 `subagents`，参数会被忽略（或者被 `defineTool` 的未知参数校验拒绝，取决于参数校验策略）。
- **学习者该怎么做**：以工具 `parameters` 与 `output.schema` 为准；README 的参数表要交叉核对源码。

### D14 作业类型安全与 `toolCall` 关联

- **表现（【代码】）**：`src/index.ts:974` 把 jobs seam 标成 `any`；`:989-996` 传 `kind: 'claude-code'`，但没有声明合并 `JobKindMap`；`:989-1148` 没有传 `toolCall`。
- **官方推荐（【文档】）**：`docs/subsystems/jobs.zh.md` §ID 与状态：`JobKindMap` 由插件声明合并扩展；§JobSpec：`toolCall?` 是「Creating tool invocation, retained in the durable lifecycle records」。
- **差异**：运行时正常（注册表把 kind 当不透明字符串），但 TypeScript 完全失去 jobs 的类型检查；`job/registered` / `job/settled` 记录缺少创建它的 tool call 关联，面板/审计无法从持久记录反查。
- **可能原因（【推断】）**：为了同时兼容 0.1.x 与 0.2 的 jobs 形状，作者用 `any` 抹平差异（0.2 的 owner/result 变化已在 0.7.1 修过）。
- **判断**：**技术债**。peer 范围已经钉在 0.1.0-rc.6–0.2.x，可以用类型声明合并 + 局部适配函数替代 `any`。
- **学习者该怎么做**：在插件里 `declare module '@deepseek-ai/dsh-jobs' { interface JobKindMap { 'claude-code': 'claude-code' } }`；给 `jobs.start` 一个窄接口；从 `execute(args, exec)` 里把 `exec.callId` / `exec.rootCallId` 传进 `toolCall`。

### D15 产品级附加：错误映射与模型/effort 跟随（不是机制偏离，但要知道边界）

- **错误映射（【代码】）**：`src/index.ts:357-401` 的 `ERROR_HINTS` + `describeFailure()` 把 SDK/CLI 的原始失败映射成可操作中文提示（认证、计费、限流、403/代理、模型无效、resume 失效、预算超限等），并保留原始 detail。
  - **官方对应**：DSH 工具没有「错误文案映射」机制；`execute` 抛错后由工具流水线记录。官方文档只要求工具不要伪造结构化失败身份（`docs/subsystems/tools.zh.md` §ToolDefinition 的 `finalizeContent` 说明）。
  - **判断**：**产品级增强，合理**。它不是 DSH 最佳实践，但也不违背任何条款。
  - **学习者该怎么做**：人读文案可以学；**不要**让上游逻辑去正则匹配这些文案做分支——机器可读的分支应依赖结构化字段（本项目在 `RunOutcome` / `Plan.note` 里提供了部分结构化信息）。如果要做同类映射，确保保留原始 detail，避免二次排障时丢信息。
- **模型/effort 跟随（【代码】+【推断】）**：`src/delegate-model.ts:13-35` 是纯策略（fable→opus、opus→sonnet、sonnet→sonnet；effort 只透传 Claude Code 认识的档位），`src/index.ts:1335-1348` 按「显式参数 > 跟随主会话 > config 回退」组装。
  - **官方对应**：DSH 没有「委派模型降一档」的推荐；这是产品策略（`CHANGELOG.md:45-46` 0.4.0 / `:40` 0.5.0 明确写「user-decided policy」）。但**读取主模型选择的机制**属于 DSH 面，应按 D1 用 `agent.model.current()`。
  - **判断**：**有理由的产品取舍**；机制部分有技术债（D1）。
  - **学习者该怎么做**：把 `delegate-model.ts` 当「策略与机制分离」的正面示例（纯函数、可单测、无服务依赖）；但读主模型时不要复制 `stateOf(session,key)`。

---

## 5. 文档未覆盖的灰色地带（展开）

| 编号 | 灰色地带 | 事实来源 | 风险 | 学习建议 |
|---|---|---|---|---|
| G1 | `window.__ModuleLoader__.load({ id, factory })` 是客户端 bundle 的运行时契约，但 `docs/` 全量没有这个字样 | 包内 `dsh-client-modules/README.zh.md` §启动 manifest 注入；`src/client/manifest.ts` JSDoc；本项目 `scripts/build-client.mjs:1-15` | 只看 `docs/` 会以为「导出 `./client` 就够了」 | 读官方包 README + 源码；把「id 必须等于包名、factory 只 require seed 表」当硬契约 |
| G2 | 客户端 `ctx.jobs` 服务（`watchRows` / `observe` / `kill`）没有 API 文档 | `config-catalog.zh.md` 只列 `dsh-client-ui-jobs` 包名；本项目 `src/client/types.ts:36-68` 是逆向形状 | 版本变化会静默失效（0.2 已经移除过 `jobsBySession`） | 优先 `ctx.remote.job.list/follow/kill`；读内部服务必须写兼容层与失败提示 |
| G3 | `agent.model.current()` 是公开类型但没有 docs 章节 | `@deepseek-ai/dsh-agent` `runtime-types.d.ts:47-63`；`model-selection.d.ts:15-20` | 学习者不知道有这个 API，转而去读投影 | 记住「owning domain service 优先」；类型声明也是官方契约 |
| G4 | `sessionProjections.stateOf(session,key)` 在包内标 `@deprecated`，docs 页面不列 | `dsh-session-projection/lib/types/index.d.ts:225-227`；运行时首次读会 `logger.warn` | 继续用会先告警、后移除 | 用 `handle.stateOf(session)` 或 `agent.model.current()` |
| G5 | 仓外插件的 Typert 生成没有文档路径 | `docs/api-gateway.zh.md` §严格生成流水线只描述仓内 | 只能走 SRC；SRC 是「较弱描述符」 | 把 SRC 参数名当公开 API 并写契约测试；能进仓就走严格生成 |
| G6 | `dsh.client.inject` 的「信息性」与「package edges」两种措辞 | `DshClientManifest` JSDoc vs `client-modules.zh.md` §wire | 容易误以为它是 DI | 服务注入看 `export const inject`；模块请求看 `external` |
| G7 | `ctx.jobs.kill` 是否通知模型 | `jobs.zh.md` §ctx.jobController `kill` 明确「still receives the completion notice」；本项目 `tracker.ts:1-12` 相反 | 基于错误前提做出的自建取消路径 | 以当前文档为准；升级 DSH 后实测一次再决定是否保留自建 |
| G8 | Cordis 4.x 没有 optional-inject 对象形式 | 官方 docs 从未承诺该形式，只推荐 `ctx.get`；本项目 `src/index.ts:21-26` + `CHANGELOG.md:42-43` 记录死锁 | 照抄旧博客/旧 API 会 PENDING 死锁 | 硬依赖 `inject`，可选 `ctx.get`；不要发明 `{required, optional}` |

---

## 6. 学习者处理建议（三张清单）

### 6.1 可以照抄（官方机制 + 本项目写法正确）

1. **插件骨架**：`name` / `inject` / `apply`，配置用同名接口 + schemastery。
2. **可选依赖**：`ctx.get('service')`，不要写进 `inject`。
3. **工具四段式**：`parameters` / `output.schema` / `output.render` / `execute`；加 `presentCall`。
4. **`exec.signal` 转发 + `timeoutMs` 声明**（但注意 D6 的 0 值与 per-call 语义）。
5. **后台作业生产方**：`jobs.start({ kind, label, owner: sessionId, run })`，`run` 同步返回 `{ cancel, done }`，推流用 `handle.append`，结果用 `JobOutcome.result`。
6. **客户端 slot 贡献**：`ctx.slots.inject(key, () => ctx.slots.register({ name, id, order }, Component))`。
7. **客户端清单**：`dsh.client.platform: 'web'` + `exports["./client"]`。
8. **组合包**：`dsh.bundle.patch` + `cordis.patch.yml` 的 `insert` 行；patch 只写用户大概率保留的默认值。
9. **构建断言**：缺 `lib/client.js` 直接失败；新增模块时同步更新产物清单。
10. **运行时技能**：`ctx.skills.register` + `source: 'runtime'`，随插件安装/卸载。

### 6.2 不要照抄（官方推荐是 X）

| 不要照抄 | 官方推荐 | 原因 |
|---|---|---|
| `sessionProjections.stateOf(session,key)` | `agent.model.current()` 或 awaited `handle.stateOf(session)` | 已 deprecated，未来会移除 |
| `args: any` / `value: any` + 无 `required` 的 output schema | `defineTool` 推断 + 完整 canonical schema | 放弃校验等于放弃工具契约 |
| `permissionMode: z.string()` / `effort: z.string()` | `z.union([...枚举])` + `.min()` | 配置错误应在加载时响亮失败 |
| 无条件 `timeoutMs: config.timeoutMs` | 正有限值或省略；per-call 语义写清 | 0 值会让注册失败；前台大值无效 |
| 自建文本输出环 + 自建取消（仅后台 job） | `ctx.jobs.readAt` + `ctx.jobs.kill` / `ctx.remote.job.kill` | 官方已提供非消耗读与通知语义 |
| `dsh.client.inject` 当依赖注入用 | Cordis `inject` 用服务名；模块请求用 `dsh.client.external` | 两者语义不同 |
| `jobs: any` + 不声明 `JobKindMap` | 类型声明合并 + 窄接口 | 失去编译期保护 |
| 手工样式注入不清理 | 非 Cordis 资源包 `ctx.effect` | 卸载/HMR 后残留 |
| `config.subagents` 当 DSH 子代理 | DSH 子代理用 `ctx.subagents` | 同名不同物 |
| README 说 `subagents` 是工具参数 | 以 `parameters` 源码为准 | 文档与实现不一致 |

### 6.3 只作为「本项目知识」学习（不要迁移到别的插件）

1. Anthropic Agent SDK 的 `query()` / `Options` / `resume` / `includePartialMessages` / `AgentDefinition`。
2. `src/live-shell.ts` 的自建 MCP shell（为了绕开「SDK 不转发 Bash stdout」）。
3. `src/output-file.ts` 的 CLI 落盘输出回读 + 每会话路径白名单。
4. `src/tracker.ts` 的结构化事件环（`thinking` / `tool_use` / `tool_result` / `console` / `warning`）。
5. `src/session-store.ts` 的 workstream 注册表（外部 Claude 句柄的旁路持久化）。
6. `src/delegate-model.ts` 的 fable→opus / opus→sonnet 跟随策略（产品默认值，不是机制）。
7. 两阶段超时警告、错误文案映射、GBK 回退、`taskkill /T /F` 进程树清理。
8. `cordis.patch.yml` 里的具体默认值（`permissionMode: acceptEdits`、`timeoutMs: 7200000`）。
9. `scripts/build-client.mjs` 的 esbuild 包装细节（契约可学，实现不必抄）。
10. fork 历史与 `CHANGELOG` 0.1–0.8 的演进。

---

## 7. 可直接嵌入 HTML 的对照表

> 使用说明：下表是「官方推荐 → 本项目做法 → 差异 → 原因 → 学习者该怎么做」五列；所有 `&lt;` 已转义，单元格内没有裸 `&lt;` 或 `|`，可直接粘进 HTML 的 `&lt;table&gt;`（或先转成 Markdown 表格）。

<table>
<thead>
<tr>
<th>官方推荐</th>
<th>本项目做法</th>
<th>差异</th>
<th>原因</th>
<th>学习者该怎么做</th>
</tr>
</thead>
<tbody>
<tr>
<td>读调用方当前模型用 owning domain service：<code>exec.agent.model.current()</code>（或 awaited projection handle）。出处：<code>session-projection.zh.md</code> §注册表；<code>upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.zh.md</code> §迁移；<code>dsh-agent</code> 类型声明。</td>
<td><code>ctx.get('sessionProjections').stateOf(session,'modelSelection')</code>，取 <code>pending ?? lastUsed</code>。<code>src/index.ts:194-215</code>、<code>:1330</code>。</td>
<td>用了 registry 上已标 <code>@deprecated</code> 的便捷读；没有用 agent 的公开 API；需要自己补 options 回退。</td>
<td>0.4.0 时为兼容「没有 projection 的 profile」选择运行时探测；当时未意识到该方法是废弃面；fork 历史。</td>
<td>用 <code>exec.agent.model.current()</code>；必须兼容旧版时做显式三级回退，不要照抄 <code>stateOf(session,key)</code>。</td>
</tr>
<tr>
<td>Remote 走严格 Typert 生成：<code>typert.host.js</code> / <code>typert.remote-client.js</code>，包导出 <code>./typert</code> 与 <code>./remote</code>，Client 用 <code>ctx.remote.&lt;ns&gt;</code>。出处：<code>api-gateway.zh.md</code> §严格生成流水线。</td>
<td>SRC 运行时推断 + 客户端手写 <code>connection.rpc.call('/api','claudeCode/x')</code>。<code>src/remote.ts:1-15</code>、<code>:74-172</code>；<code>src/client/api.ts:162-166</code>；<code>package.json:8-18</code> 无 typert 导出。</td>
<td>没有生成产物、没有 Client namespace；参数名就是 wire 字段；没有编译期 codec。</td>
<td>仓外插件没有文档化的 Typert 生成入口；SRC 是官方唯一写明的回退；fork 基线已用 SRC。</td>
<td>先理解严格流水线；仓外只能用 SRC 时，把参数名当公开契约并写契约测试；能进仓就走严格生成。</td>
</tr>
<tr>
<td>后台 job 的文本观察用 <code>ctx.jobs.readAt</code>（非消耗、绝对偏移）；取消用 <code>ctx.jobs.kill</code> 或 <code>ctx.remote.job.kill</code>。出处：<code>jobs.zh.md</code> §输出环、§ctx.jobs、§ctx.jobController。</td>
<td>自建 <code>JobTracker</code> 文本环 + <code>claudeCode/cancel</code>。<code>src/tracker.ts:1-12</code>、<code>:919-953</code>；<code>src/remote.ts:110-172</code>。</td>
<td>重复了官方非消耗读与 kill；取消理由「kill 会让模型收不到通知」与当前文档相反；但结构化事件与前台委派确实没有官方等价物。</td>
<td>面板 0.3.0 落地时官方观察 API 可能还没有 <code>readAt</code>/<code>ctx.remote.job</code>；旧版 kill 行为可能确实吞通知；多版本兼容。</td>
<td>优先官方 seam；只有 thinking/tool_use 逐块事件与前台无 jobId 的场景才自建；不要把 tracker 注释当官方结论。</td>
</tr>
<tr>
<td><code>defineTool</code> 推导并校验 <code>args</code>；<code>output.schema</code> 强制 canonical 形状；对象属性标必填。出处：<code>basic/tool.zh.md</code>；<code>tools.zh.md</code> §ToolDefinition。</td>
<td><code>execute(args: any, exec)</code>、<code>render(_args: any, value: any)</code>；output schema 无 <code>required</code>。<code>src/index.ts:1288-1329</code>。</td>
<td>放弃了 defineTool 的类型推断与输出必填校验；schema 与 render 脱钩。</td>
<td>fork 基线 + 参数多 + 快速迭代；<code>outputSchema</code> 是 <code>type:'json'</code>，作者可能觉得推断收益低。</td>
<td>保留推断；必填项写 <code>required: true</code>；动态形状用 <code>{ type: 'json' }</code> 明确表达，不要用 <code>any</code> 逃逸。</td>
</tr>
<tr>
<td>配置约束写进 schema，非法配置在加载时 FAILED。出处：<code>basic/config.zh.md</code> §设计原则；<code>cordis-tutorial/05</code> §明确报错。</td>
<td><code>permissionMode</code>/<code>effort</code> 是 <code>z.string()</code>；<code>timeoutMs</code>/<code>maxTurns</code>/<code>maxBudgetUsd</code> 无 <code>min</code>。<code>src/index.ts:106-116</code>。</td>
<td>非法枚举/范围要等到运行时才炸；与「配置错误要响亮」相悖。</td>
<td>枚举常量已存在，但只在 tool 参数用了；config 保留开放字符串以备未来值。</td>
<td>用 <code>z.union([...枚举])</code> + <code>.min()</code>；确实要开放时写显式策略并说明。</td>
</tr>
<tr>
<td><code>timeoutMs</code> 必须正有限值；省略表示无截止；per-call 语义要清晰。出处：<code>tools.zh.md</code> §ToolDefinition。</td>
<td>注册时无条件 <code>timeoutMs: config.timeoutMs</code>；per-call 只进内部计时器。<code>src/index.ts:1328</code>、<code>:1106-1112</code>、<code>:1340</code>。</td>
<td><code>config.timeoutMs=0</code> 可能让注册失败；前台传更大 per-call 值不会延长预算。</td>
<td>0.3.2 的两阶段超时与后来接入 defineTool 的静态预算叠加；fork 历史。</td>
<td>只在 &gt;0 时声明 <code>timeoutMs</code>；per-call 说明「只能缩短前台预算」；警告逻辑放自己的 <code>run()</code>。</td>
</tr>
<tr>
<td>委派给另一个 agent 产品用 <code>ctx.subagents</code> 提供方注册表；官方已有 <code>dsh-subagent-claude-code</code>，其 bundle 还会注册全局工具。出处：<code>extension-cookbook.zh.md</code> §功能→机制映射；<code>upgrade-guide/v0.2.1-alpha.1/native-subagent-bundle-tools/guide.zh.md</code> §变更；<code>subagent.zh.md</code>。</td>
<td>自建 <code>claude_code</code> 工具；<code>config.subagents</code> 是 Anthropic SDK 的 <code>AgentDefinition</code>。<code>src/index.ts:57-66</code>、<code>:171-180</code>、<code>:424-439</code>、<code>:1355</code>。</td>
<td>两个「subagent」完全不同：DSH 管理子代理树 vs Claude Code 内部 Agent 工具配置；本项目未接入 DSH 子代理树。</td>
<td>产品要面板、resume、实时输出；工具形态比 provider 形态更适合；上游 fork 已是工具。</td>
<td>不要把 <code>config.subagents</code> 当 DSH 机制；要 DSH 子代理就用 <code>ctx.subagents</code>；要 Claude Code 内部助手就用 SDK <code>agents</code>。</td>
</tr>
<tr>
<td>持久化用 <code>ctx.sessionPersistence</code> 存 <code>SessionEvent</code>；必须跨重载的事实用会话事件。出处：<code>persistence.zh.md</code>；<code>architecture.zh.md</code> §事件。</td>
<td>自建 <code>$DSH_HOME/claude-delegate-sessions.json</code>；进程内 <code>active</code> 集合。<code>src/session-store.ts:71-76</code>、<code>:141-149</code>。</td>
<td>旁路存储；没有跨进程写租约；不参与 DSH 的 fork/回放。</td>
<td>存的是外部 Claude Code 的 session id，DSH 没有对应原语；fork 基线已用文件。</td>
<td>分清「DSH 会话持久化」与「外部句柄持久化」；DSH 自己的状态优先会话事件；旁路文件只存官方 seam 表达不了的外部句柄。</td>
</tr>
<tr>
<td><code>dsh.client.inject</code> 是信息性 package 依赖；额外模块请求用 <code>dsh.client.external</code>。出处：<code>DshClientManifest</code> JSDoc；<code>client-modules.zh.md</code> §扫描/§wire。</td>
<td><code>inject</code> 含不存在的 <code>@deepseek-ai/dsh-client-runtime</code>。<code>package.json:32-36</code>。</td>
<td>陈旧包名；读者会误以为它是 Cordis 服务注入。</td>
<td>上游 fork 时代的包名，0.2 线重命名/合并后未同步；字段不被严格校验。</td>
<td>服务依赖写 <code>export const inject</code>；模块请求写 <code>external</code>；<code>dsh.client.inject</code> 只当信息性元数据。</td>
</tr>
<tr>
<td>客户端 bundle 只注册 factory；seed 表由 shell 的 <code>PLATFORM_MODULES</code> 决定；缺失 <code>lib/client.js</code> 激活失败。出处：<code>dsh-client-modules/README.zh.md</code> §启动 manifest 注入/§共享模块/§构建要求。</td>
<td>手工 esbuild banner/footer + 硬编码 12 个 <code>SEED_MODULES</code>；构建时断言 id 与 require 白名单。<code>scripts/build-client.mjs:26-83</code>。</td>
<td>没有用官方 tsdown preset；白名单是超集且不随宿主表更新；但当前只 require React，实际安全。</td>
<td>仓外构建没有文档化 preset；esbuild 依赖最小；fork 基线已有脚本。</td>
<td>契约可学、实现不必抄；至少把「每个 require 必须在 seed 表」写成构建断言；能进仓就用官方 preset。</td>
</tr>
<tr>
<td>非 Cordis 管理的资源包 <code>ctx.effect</code> 并返回 disposer。出处：<code>cordis-tutorial/02</code> §Effect。</td>
<td><code>installStyles()</code> 直接 append <code>&lt;style&gt;</code>，不返回 disposer。<code>src/client/styles.ts:883-891</code>；<code>src/client/index.ts:26</code>。</td>
<td>样式标签在卸载/HMR 后残留；但幂等、带 <code>data-plugin</code> 标记。</td>
<td>全局主题样式，作者判断生命周期与插件一致即可；fork 历史。</td>
<td>事件/定时器/连接必须 <code>ctx.effect</code>；全局样式可手动注入，但要幂等并标记 owner。</td>
</tr>
<tr>
<td>发布用 <code>engines.dsh</code> 显式声明兼容范围；schemastery 进 <code>dependencies</code>；<code>files</code> 精确。出处：<code>publish.zh.md</code> §组合包 manifest；<code>adding-a-package.zh.md</code> §1。</td>
<td>无 <code>engines.dsh</code>（靠 peer 范围 <code>&gt;=0.1.0-rc.6 &lt;0.3.0</code>）；schemastery 在 peer；<code>files</code> 含整个 <code>lib</code>。<code>package.json:19-24</code>、<code>:61-73</code>。</td>
<td>依赖回退规则合法；显式声明更清楚；schemastery 的运行时可见性依赖宿主解析。</td>
<td>与宿主共享同一 schema 实例的意图；fork 基线；仓外插件清单习惯。</td>
<td>显式写 <code>engines.dsh</code>；<code>files</code> 用精确列表；peer 与 dev 成对；发布前在干净 profile 里 <code>dsh plugin add</code> 验证。</td>
</tr>
<tr>
<td>配置 patch 按 id 替换整个 <code>config</code>，不是深合并；用户覆盖要重述每个键。出处：<code>architecture.zh.md</code> §Profile 与组合包；<code>publish.zh.md</code> §加载顺序。</td>
<td>组合包 patch 只写 4 个键，其余靠 schema 默认；README §6 的示例也只列部分键，未提醒整体替换。<code>cordis.patch.yml:10-17</code>；<code>README.md:162-185</code>。</td>
<td>今天这些键的默认值恰好一致，所以没有实际差异；但用户覆盖时容易丢键。</td>
<td>官方语义如此；作者按「schema 默认值补缺省」理解，但没有把「覆盖=替换」写进 README。</td>
<td>记住：patch 覆盖 <code>config</code> 要写全；schema 默认值只补「没写的键」，不会与上一层合并。</td>
</tr>
<tr>
<td>工具创建的后台 job 应带 <code>JobSpec.toolCall</code>；新增 kind 用声明合并扩展 <code>JobKindMap</code>。出处：<code>jobs.zh.md</code> §JobSpec、§ID 与状态。</td>
<td><code>jobs: any</code>；<code>kind: 'claude-code'</code> 未声明合并；未传 <code>toolCall</code>。<code>src/index.ts:974</code>、<code>:989-996</code>。</td>
<td>类型安全缺失；持久 <code>job/settled</code> 记录无法关联创建它的工具调用。</td>
<td>为了抹平 0.1.x / 0.2 的 jobs 形状差异；fork 历史。</td>
<td>peer 已钉死版本，可以声明合并 + 窄接口；从 <code>exec.callId</code> 传 <code>toolCall</code>。</td>
</tr>
<tr>
<td>包 README 应准确记录公开 API。出处：<code>adding-a-package.zh.md</code> §4 编写包 README（通用质量要求）。</td>
<td>README 把 <code>subagents</code> 列为工具参数（<code>README.md:154</code>），但工具 schema 没有它（<code>src/index.ts:1206-1287</code>）。</td>
<td>文档与实现不一致；按 README 传参会无效。</td>
<td>参数可能从早期的 per-call 形态移到 config 后，README 未同步。</td>
<td>以 <code>parameters</code> / <code>output.schema</code> 源码为准；README 参数表要与源码交叉核对。</td>
</tr>
</tbody>
</table>

---

## 8. 出处与不确定项

### 8.1 项目出处（相对仓库根）

- 插件契约与配置：`src/index.ts:20`, `:21-27`, `:68-181`
- 主模型读取：`src/index.ts:194-215`, `:1330`
- 模型/effort 策略：`src/delegate-model.ts:13-35`
- 工具注册：`src/index.ts:1188-1480`（参数 `:1206-1287`，输出 `:1288-1327`，执行 `:1329-1473`，presentCall `:1474-1479`）
- 后台作业：`src/index.ts:973-1172`（`jobs.start` `:989`，`run` `:1000`，`append` `:1019-1025`，`done` `:1047-1104`，超时 `:1106-1132`）
- 前台委派与 tracker：`src/index.ts:1399-1472`
- 会话注册表：`src/session-store.ts:1-28`, `:71-76`, `:141-149`
- Remote：`src/remote.ts:1-15`, `:74-172`
- 客户端 slot：`src/client/index.ts:19`, `:25-39`
- 客户端 RPC：`src/client/api.ts:162-166`
- 样式注入：`src/client/styles.ts:883-891`
- 构建：`package.json:8-18`, `:19-24`, `:26-38`, `:55-73`；`scripts/build-client.mjs:26-83`；`scripts/assert-artifacts.mjs:14-42`；`cordis.patch.yml:10-17`
- README/CHANGELOG：`README.md:133-206`, `:283-293`, `:331-364`；`CHANGELOG.md:42-43`（0.4.1 optional-inject）、`:30-32`（0.7.0 peer 范围）、`:3-10`（0.8.1 续接/面板）

### 8.2 官方文档出处（相对 `@deepseek-ai/dsh/docs`）

- `cordis-primer.zh.md` §五个核心概念、§分发模式、§实践规则
- `cordis-tutorial/01-first-plugin.zh.md` §编写插件
- `cordis-tutorial/02-lifecycle-and-effects.zh.md` §Effect、§Fiber 状态机、§已经属于 effect 的操作
- `cordis-tutorial/03-services.zh.md` §使用 `inject` 消费服务、§加载后仍会跟踪依赖关系、§可选依赖、§命名
- `cordis-tutorial/05-config.zh.md` §可配置插件、§明确报错、§Volatile 字段
- `cordis-tutorial/07-into-the-harness.zh.md` §工具插件、§观察插件
- `cordis-api/context.zh.md` §ctx.get(name, strict?)
- `cookbook/extension-cookbook.zh.md` §工具插件、§钩子插件、§UI 插件、§功能→机制映射
- `cookbook/adding-a-package.zh.md` §1 创建包、§2 在根配置中注册、§3 确定包拓扑、§4 编写包 README
- `user/develop/basic/tool.zh.md` 全文
- `user/develop/basic/config.zh.md` §设计原则、§Schema 校验、§配合 HMR
- `user/develop/basic/publish.zh.md` §组合包 manifest、§加载顺序、§让表层组合包持有自己的命令行
- `architecture.zh.md` §Profile 与组合包、§事件、§轮次流程、§会话日志、§能力 seam、§新行为的归属位置
- `capability-seams.zh.md` 全文（能力 seam 三角色图）
- `subsystems/tools.zh.md` §ToolDefinition、§统一的 JSON 值 schema DSL、§执行、§工具展示 UI 词汇、§ctx.tools
- `subsystems/jobs.zh.md` §ID 与状态、§Session 生命周期记录、§生产方约定、§输出环、§服务行为、§ctx.jobController、§ctx.jobs
- `subsystems/persistence.zh.md` §SessionHandle、§flush 检查点、§SessionHeader、§CreateSessionOptions、§ctx.sessionPersistence
- `subsystems/session-projection.zh.md` §注册表：`ctx.sessionProjections`
- `subsystems/subagent.zh.md` §能力与 activation 请求、§提供方约定：SubagentProvider、§ctx.subagents
- `subsystems/client-modules.zh.md` §wire、§扫描、§bundle 路由与 index 注入、§ctx.clientModules
- `subsystems/slots.zh.md` §声明与生命周期、§Cardinality 与 scope、§Conversation 层级、§扩展规则
- `subsystems/skills.zh.md` §提供方注册表、§本地发现优先级、§skill 身份、§ctx.skills
- `api-gateway.zh.md` §编程模型、§组件职责、§严格生成流水线、§运行时调用、§SRC 开发回退
- `upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.zh.md` §变更、§迁移（registry 级 `stateOf` 弃用）
- `upgrade-guide/v0.2.1-alpha.1/native-subagent-bundle-tools/guide.zh.md` §变更（`dsh-subagent-claude-code` bundle 的全局委派工具）
- `config-catalog.zh.md` 开头说明

### 8.3 官方包 README / 源码（不在 `docs/`）

- `@deepseek-ai/dsh-client-modules/README.zh.md` §声明客户端插件、§浏览器加载什么、§共享模块、§构建要求、§启动 manifest 注入
- `@deepseek-ai/dsh-client-modules/src/client/manifest.ts` JSDoc（`ClientBundleRegistration`、`DshWindow.__ModuleLoader__`）
- `@deepseek-ai/dsh-package-manifest/src/types.ts` `DshClientManifest`（`inject` 是 informational）
- `@deepseek-ai/dsh-session-projection/lib/types/index.d.ts:225-227`（`stateOf` 标 `@deprecated`）
- `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:47-63`（`Model.current()`）
- `@deepseek-ai/dsh-agent/lib/types/model-selection.d.ts:15-20`（`ModelSelectionProjectionState` 的 `pending` / `lastUsed`）
- `@deepseek-ai/dsh-agent/lib/types/types.d.ts:69-83`（`ModelSelection` 字段）
- `@deepseek-ai/dsh-api-job-controller` 的 `kill` JSDoc（模型仍收到完成通知）

### 8.4 无法确认 / 需要复核

1. **`@deepseek-ai/dsh-client-runtime` 是否曾经真实存在**：0.2.2-rc.5 安装树中没有；项目声明它时是否对应 0.1.x/0.2.0-rc.2 的某个包，无法从本机确认。因 `dsh.client.inject` 是信息性字段，当前不影响运行。
2. **`ctx.jobs.kill` 在 0.2.0-rc.2 是否吞通知**：项目注释如此说，0.2.2-rc.5 文档说仍通知。可能是版本修复，也可能是项目误读；需要按实际版本做一次行为测试。
3. **`config.timeoutMs = 0` 是否必然导致注册失败**：文档说注册表检查「timeoutMs 必须为正有限值」，但 `defineTool` 是否在 0 时抛错取决于实现；建议用最小插件在目标 DSH 版本实测。
4. **`sessionProjections.stateOf` 的移除时间**：当前是 deprecated + 首次读告警，`upgrade-guide/v0.2.1-rc.2` 已给迁移路径；具体移除版本没有路线图，无法确认。
5. **`dsh.client.inject` 是否参与 Cordis 组合**：`DshClientManifest` 说 informational，`client-modules.zh.md` §wire 说 package edges 用于 factory arrival 与 plugin composition；两处措辞不完全一致。项目删除 `dsh-client-runtime` 前应先确认目标 DSH 版本的组合阶段是否校验 inject 边。
6. **`config.subagents` 的 per-call 化**：README 说它是工具参数，源码说它只在 config；无法确认是文档滞后还是曾有 per-call 形态。以源码为准。
7. **`schemastery` 作为 peer 在干净 profile 中是否总能解析**：取决于 pnpm peer 安装与 profile 解析顺序；未在本机做干净 profile 安装验证。
