# 03 — 本项目：DSH 通用机制 vs 项目特有实现

> 研究票：`.scratch/learn-dsh-plugin/issues/03-project-special-vs-common.md`
> 调查对象：仓库 `E:\workspace\GitRepository\dsh-claude-delegate`（0.8.1）
> 官方文档根：`E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\docs`（DSH 0.2.2-rc.5 随包中文文档）
> 本文只做「分类与必要性判断」，不重复模块依赖图（由另一张票负责）。

---

## 0. 一句话结论

本项目的 6500 行源码，在 DSH 机制层面只落在 **5 个注册面**上：`ctx.tools.register`（1 个工具）、`ctx.skills.register`（2 个技能）、`ClaudeCodeRemote`（1 个 `@Remote` 服务）、客户端 `ctx.slots.register`（1 个 `conversation.view` 占位）、以及消费 `ctx.jobs.start`（1 种后台作业）。其余约八成代码是这些注册面背后的**业务载荷**：Anthropic Agent SDK 适配、面板事件映射、会话续接注册表、实时输出通道。对「开发一个简单插件」而言，**只需要学 5 条 DSH 机制**（§3 中标 ★ 的行），其余都可跳过。

---

## 1. 判定标准（第一性原理）

先剥离术语，问三个根本问题：

1. **这段代码是不是在向 DSH 声明「我要贡献什么」？** 是 → 属于 DSH 插件机制，官方文档必有对应章节。
2. **这段代码是不是在实现「贡献物内部怎么干活」？** 是 → 属于插件业务，DSH 不关心它用什么库、什么协议。
3. **这段代码是不是在绕过某个外部依赖的限制？** 是 → 属于项目特有实现，与 DSH 插件开发无关。

据此把每条机制归入三类：

| 类别 | 定义 | 学习意义 |
|---|---|---|
| **通用** | DSH 官方文档有明确章节、任何插件都这么写 | 可迁移的插件开发知识 |
| **混合** | 外壳是官方机制，但填进去的内容/参数/规避手段是本项目特有 | 先学外壳，再读项目填法 |
| **特殊** | 官方文档无对应章节；属于本项目自创，或属于 Anthropic Agent SDK 等外部依赖 | 学 DSH 插件时可以整段跳过 |

「来源」再分四种，避免把外部 SDK 误当成 DSH，也避免把 fork 继承当成官方：

- **DSH**：`@deepseek-ai/*` 官方机制。
- **Anthropic SDK**：`@anthropic-ai/claude-agent-sdk`，既不是 DSH 也不是本项目发明。
- **本项目（fork 基线）**：从上游 `zhangjunjesse/dsh-claude-code` 继承的写法（依据 `README.md` §14 与 `CHANGELOG.md` 0.1.x–0.2.0）。
- **本项目（本仓库新增）**：README §14「相对上游的主要改动」明确列出的内容，或 CHANGELOG 0.7.0 之后的条目。

**「简单插件」的基线**取官方教程 `docs/user/develop/basic/tool.zh.md` 的 `greet` 示例：单个 `src/index.ts`，导出 `name` / `inject` / `apply`，内部一次 `ctx.tools.register(defineTool(...))`。凡是不服务于这个基线的机制，都先判为「可跳过」。

---

## 2. 本项目的 5 个注册面（先看骨架，再看载荷）

| 注册面 | 代码位置 | 官方机制 | 说明 |
|---|---|---|---|
| 工具 | `src/index.ts:1188-1480` | `ctx.tools.register` | 唯一面向模型的入口 `claude_code` |
| 技能 ×2 | `src/index.ts:1175-1176`；`src/delegation-skill.ts:12-201` | `ctx.skills.register` | `claude-code-delegation`、`parallel-dev` |
| Remote 服务 | `src/remote.ts:74-173` | `TypertRemoteService` + `@Remote` | 面板的 Host→Client RPC：`claudeCode/*` |
| 客户端 slot | `src/client/index.ts:34-39` | `ctx.slots.inject` + `ctx.slots.register` | 占用 `conversation.view` 的 `claude-code` 列表项 |
| 后台作业 | `src/index.ts:989-1148` | `ctx.jobs.start` | 消费 DSH jobs seam，不是新注册 |

其余 `tracker.ts` / `session-store.ts` / `live-shell.ts` / `output-file.ts` / `delegate-model.ts` / `client/*` 都是上述 5 个面的实现细节。

---

## 3. 对照表（机制 → 类别 → 落点 → 官方文档 → 简单插件必要性）

图例：

- 类别：**通用** / **混合** / **特殊**
- 必要性：**★ 必学**（写最小插件就要）/ **☆ 发布时**（打进 npm 组合包才要）/ **◐ 按需**（做 UI、后台作业、技能、配置才学）/ **○ 可跳过**（本项目业务，与 DSH 插件开发无关）

### 3.1 插件骨架与配置

| # | 机制 | 类别 | 本仓库落点 | 来源 | 官方文档章节 | 必要性 |
|---|---|---|---|---|---|---|
| 1 | Cordis 函数插件契约：`name` / `inject` / `apply(ctx, config)` | 通用 | `src/index.ts:20`, `:27`, `:1174` | DSH | `cordis-tutorial/01-first-plugin.zh.md` §编写插件；`cookbook/adding-a-package.zh.md` §1 | ★ 必学 |
| 2 | `inject` 声明与 PENDING 语义（服务就绪前不启动） | 通用 | `src/index.ts:27`；`src/client/index.ts:19` | DSH | `cordis-tutorial/03-services.zh.md` §使用 `inject` 消费服务；§可选依赖 | ★ 必学 |
| 3 | `Config` = 类型 + schemastery 运行时 schema | 通用 | `src/index.ts:68-96`, `:98-181` | DSH | `cordis-tutorial/05-config.zh.md` §可配置插件 | ◐ 按需 |
| 4 | 组合包 manifest：`dsh.bundle.patch` + `cordis.patch.yml` | 通用 | `package.json:26-29`；`cordis.patch.yml:1-17` | DSH | `user/develop/basic/publish.zh.md` §组合包 manifest；`architecture.zh.md` §Profile 与组合包 | ☆ 发布时 |
| 5 | 注册随插件 fiber 卸载而撤销（effect 生命周期） | 通用 | 隐式：`src/index.ts:1181-1185` 构造即注册；无显式清理代码 | DSH | `cordis-tutorial/02-lifecycle-and-effects.zh.md` §Effect；`subsystems/skills.zh.md:278-295`（disposer） | ★ 必学（概念） |
| 6 | 可选服务读取 `ctx.get()`（绕过 inject 要求） | 混合（机制通用，注释是项目踩坑） | `src/index.ts:21-26`, `:198-214`；`src/client/index.ts:30-32` | DSH 机制 + 本项目规避 | `cordis-api/context.zh.md` §ctx.get（:239-259）；`cordis-tutorial/03-services.zh.md` §可选依赖 | ◐ 按需 |

> 关于 #6：`ctx.get(name)` 是官方 API，语义是「读取服务但不建立 inject 依赖」（`docs/cordis-api/context.zh.md:242-250`）。本项目注释说本机 Cordis 4.x **没有 optional-inject 对象形式**（`src/index.ts:21-26`），这是项目踩坑记录，不是 DSH 文档承诺；学习时只需记住「可选依赖用 `ctx.get`，硬依赖用 `inject`」。

### 3.2 工具与技能

| # | 机制 | 类别 | 本仓库落点 | 来源 | 官方文档章节 | 必要性 |
|---|---|---|---|---|---|---|
| 7 | `defineTool` + `ctx.tools.register` | 通用（外壳） | `src/index.ts:3`, `:1188-1480` | DSH | `cookbook/extension-cookbook.zh.md` §工具插件；`subsystems/tools.zh.md` §ToolDefinition / §ctx.tools；`user/develop/basic/tool.zh.md` | ★ 必学 |
| 8 | 工具参数 DSL + 强制 `output.schema` + `output.render` | 通用 | `src/index.ts:1206-1327` | DSH | `subsystems/tools.zh.md:11-23`, `:108-162`；`cookbook/adding-a-tool.zh.md` §最小形态 | ★ 必学 |
| 9 | `presentCall`（工具调用卡片） | 通用 | `src/index.ts:1474-1479` | DSH | `subsystems/tools.zh.md:85-102`, §工具展示 UI 词汇（:629） | ◐ 按需 |
| 10 | 工具级 `timeoutMs`（协作式截止预算） | 通用 | `src/index.ts:1328` | DSH | `subsystems/tools.zh.md:63-70` | ◐ 按需 |
| 11 | `execute` 内调用 Anthropic `query()` | 特殊（外部 SDK） | `src/index.ts:5`, `:661-871`（`:716` 调用） | Anthropic SDK | 无 DSH 章节 | ○ 可跳过 |
| 12 | `buildQueryOptions`：把 RunRequest 映射为 SDK `Options` | 特殊（外部 SDK + 项目策略） | `src/index.ts:580-648` | Anthropic SDK + 本项目 | 无 | ○ 可跳过 |
| 13 | `config.subagents` → SDK `AgentDefinition` | 特殊（外部 SDK） | `src/index.ts:57-66`, `:171-181`, `:424-440`, `:1355` | Anthropic SDK | 无 | ○ 可跳过 |
| 14 | `ctx.skills.register(SkillRegistration)` | 通用（外壳） | `src/index.ts:1175-1176`；`src/delegation-skill.ts:12-201` | DSH | `subsystems/skills.zh.md` §Cordis API `ctx.skills`（:268-326，`register` 在 :295）；§skill 身份（:83-90） | ◐ 按需 |
| 15 | 技能正文与触发策略（委派 SOP / 并行开发 SOP） | 特殊 | `src/delegation-skill.ts:12-200`；`src/index.ts:249-299` | 本项目 | 无（内容自定） | ○ 可跳过 |

> **重要陷阱**：#13 的 `config.subagents` 是 **Claude Code 自己的 AgentDefinition**（`src/index.ts:57-66`, `:424-440`），与 DSH 的 `ctx.subagents` 提供方注册表**同名但无关**。DSH 的 subagent 机制见 `cookbook/extension-cookbook.zh.md` 功能→机制映射「subagent 委派」行与 `subsystems/subagent.zh.md`。本项目**没有**注册 `ctx.subagents`（`src/` 中无 `ctx.subagents` 引用），而是把 Claude Code 当普通外部工具调用；这是架构选择，不是 DSH 机制缺失。

### 3.3 后台作业

| # | 机制 | 类别 | 本仓库落点 | 来源 | 官方文档章节 | 必要性 |
|---|---|---|---|---|---|---|
| 16 | `ctx.jobs.start(JobSpec)` + `run(handle)` + `handle.append()` | 通用（外壳） | `src/index.ts:973-1148`（start `:989`，run `:1000`，append `:1019-1025`） | DSH | `subsystems/jobs.zh.md` §生产方约定（:67-122）、§JobHandle（:125-151）、§ctx.jobs（:443-549）；`cookbook/adding-a-tool.zh.md` §长时间运行的工作（:52-58） | ◐ 按需 |
| 17 | `JobHooks.done` / `JobOutcome{status,detail,result}` | 通用 | `src/index.ts:1047-1104`, `:1134-1168` | DSH | `subsystems/jobs.zh.md` §JobHooks（:155-171）、§JobOutcome（:173-191） | ◐ 按需 |
| 18 | 用 `ctx.get('jobs')` 取注册表，并把 seam 标成 `any` | 混合 | `src/index.ts:974`（`jobs: any`）、`:1385-1386` | 本项目适配 | `subsystems/jobs.zh.md` §ctx.jobs（抽象 seam，:443-445） | ○ 可跳过 |
| 19 | 两阶段超时：硬超时 + 周期警告事件 | 特殊 | `src/index.ts:1106-1132`；配置 `:110-112` | 本项目（CHANGELOG 0.3.2） | 无 | ○ 可跳过 |
| 20 | `JobTracker` 镜像：绝对偏移文本环 + 结构化事件环 | 特殊 | `src/tracker.ts:147-206`, `:311-409` | 本项目（CHANGELOG 0.3.0/0.3.1；fork 归属见 §8 存疑项） | 对比 `subsystems/jobs.zh.md` §输出环（:232-265）——官方已有 `readAt` 多读者 | ○ 可跳过 |
| 21 | UI 取消走插件自己的 AbortController，让作业正常结算 | 混合 | `src/index.ts:1431-1435`；`src/remote.ts:168-172`；理由见 `src/tracker.ts:1-12` | 本项目 | `subsystems/jobs.zh.md` §ctx.jobs `kill`（:506-516） | ○ 可跳过 |

> **可替代性提示**：官方 jobs seam 明确区分「模型消费游标 `read`」与「观察者绝对偏移 `readAt`」两条读路径（`subsystems/jobs.zh.md:234`, `:251-264`, `:504`）。因此 `tracker.ts` 的**文本**镜像原则上可换成 `ctx.jobs.readAt`；但结构化事件流（tool_use / thinking / console）没有官方等价物，仍需自建。项目注释称 `ctx.jobs.kill()` 会让模型收不到通知（`src/tracker.ts:4-9`），这一点在官方文档中没有直接表述，标为项目结论（见 §8）。

### 3.4 客户端与 RPC

| # | 机制 | 类别 | 本仓库落点 | 来源 | 官方文档章节 | 必要性 |
|---|---|---|---|---|---|---|
| 22 | `dsh.client` manifest + `exports["./client"]` | 通用 | `package.json:13-20`, `:30-36` | DSH | `subsystems/client-modules.zh.md` §扫描（:92-100）；`cookbook/adding-a-settings-card.zh.md:58-72` | ◐ 按需（有 UI 才要） |
| 23 | 单文件 bundle 契约 `window.__ModuleLoader__.load({id,factory})` + seed 模块白名单 | 混合 | `scripts/build-client.mjs:26-82`；`package.json:13-15` | 运行时契约（文档未覆盖）+ 本项目 esbuild 实现 | 官方 docs 未检到 `__ModuleLoader__`（见 §8）；`subsystems/client-modules.zh.md` 只讲 manifest/路由（:94, :102-104） | ◐ 按需（做 UI 必读脚本） |
| 24 | `ctx.slots.inject` + `ctx.slots.register`（`conversation.view` 列表项） | 通用 | `src/client/index.ts:19`, `:34-39` | DSH | `subsystems/slots.zh.md` §声明与生命周期（:19-52）、§扩展规则（:225-234）、§Conversation 层级（:138-185） | ◐ 按需 |
| 25 | `TypertRemoteService` + `@Remote` 方法 | 通用 | `src/remote.ts:74-83`, `:92-172` | DSH | `api-gateway.zh.md` §编程模型（:9-19）、§运行时调用（:126-136） | ◐ 按需 |
| 26 | 客户端 `connection.rpc.call('/api', 'claudeCode/<method>')` | 通用 | `src/client/api.ts:162-166` | DSH | `api-gateway.zh.md` §运行时调用（:128） | ◐ 按需 |
| 27 | SRC 回退的参数命名约束（普通标识符、避开 `session`/`agent`） | 混合（机制通用 + 项目约束） | `src/remote.ts:11-14` | DSH 机制 + 本项目 | `api-gateway.zh.md` §SRC 开发回退（:138-144） | ○ 可跳过 |
| 28 | 面板组件：任务分组、事件渲染、Markdown、CSS、i18n、轮询 | 特殊 | `src/client/ClaudeCodeView.tsx:226-227`；`EventView.tsx:149-271`；`md.ts`；`styles.ts`；`locales.ts` | 本项目 | 无 | ○ 可跳过 |
| 29 | 客户端惰性读 `ctx.jobs`（0.2 客户端服务），并提供 0.1.x 回退 | 混合 | `src/client/index.ts:27-33`；`src/client/types.ts:36-68` | 本项目适配 | 官方 docs 仅在 `config-catalog.zh.md:5113` 列出 `@deepseek-ai/dsh-client-ui-jobs` 包名，无 API 章节 | ○ 可跳过 |

> **#23 的边界**：官方文档教的是「在 package.json 声明 `dsh.client`、导出 `./client`，client-modules 会扫描并生成 `__DSH_BOOT__` 图」（`subsystems/client-modules.zh.md:92-104`）。但「bundle 必须是一个 `window.__ModuleLoader__.load` 调用、只有 seed 模块表可 require」是**运行时契约**，不在 docs 里。本项目的 `scripts/build-client.mjs` 用 esbuild banner/footer 包出这个形状，并在构建时断言 id 与白名单（`:41-50`, `:71-82`）。对学习者：这是「读脚本才能学到的 DSH 客户端工程知识」，不是官方文档章节。

### 3.5 会话、上下文与持久化

| # | 机制 | 类别 | 本仓库落点 | 来源 | 官方文档章节 | 必要性 |
|---|---|---|---|---|---|---|
| 30 | 读取 `agent.session.header.cwd` / `agent.session.id` | 混合（官方数据形状 + 项目用法） | `src/index.ts:225-247` | DSH 数据形状 + 本项目 | `subsystems/persistence.zh.md` §SessionHeader（:137-158，`cwd` 在 :158）；`subsystems/session.zh.md`（`Session.header` :478-485） | ◐ 按需 |
| 31 | 读 `ctx.sessionProjections` 的 `modelSelection`，派生默认模型/effort | 混合（官方服务 + 项目策略） | `src/index.ts:183-215`；`src/delegate-model.ts:13-35` | DSH 服务 + 本项目（CHANGELOG 0.4.0/0.5.0） | `architecture.zh.md` §会话日志「投影 seam」（:136）；`subsystems/session-projection.zh.md` §注册表（:233-241） | ○ 可跳过 |
| 32 | Claude `resume` 续接 + 自建 `~/.dsh/claude-delegate-sessions.json` 注册表 | 特殊 | `src/session-store.ts:71-75`, `:141-390`；`src/index.ts:881-909`, `:1374-1382` | Anthropic SDK + 本项目（0.8.1） | 无 DSH 章节；对比 `subsystems/persistence.zh.md`（DSH 持久化的是 session event log，不是外部 Claude 句柄） | ○ 可跳过 |
| 33 | `includePartialMessages` + SDK 消息 union → 面板事件 | 特殊（外部 SDK） | `src/index.ts:617`, `:722-836` | Anthropic SDK + 本项目 | 无 | ○ 可跳过 |

> **关键区分**：#32 的「会话持久化」与 DSH 的会话持久化**不是一回事**。DSH 的 `ctx.sessionPersistence` 持久化的是 DSH 自己的 `SessionEvent` 日志（`subsystems/persistence.zh.md:1-7`）；本项目的 JSON 文件存的是**外部 Claude Code 的 session id**，供下一次调用 `query({resume})`。前者是 DSH 通用机制，后者是项目自创的旁路存储。

### 3.6 实时输出与构建

| # | 机制 | 类别 | 本仓库落点 | 来源 | 官方文档章节 | 必要性 |
|---|---|---|---|---|---|---|
| 34 | 自建 in-process MCP server（`createSdkMcpServer`）承接长命令 | 特殊（外部 SDK） | `src/live-shell.ts:157-297`；`src/index.ts:681-712` | Anthropic SDK + 本项目（0.7.1） | 无 DSH 章节 | ○ 可跳过 |
| 35 | CLI 落盘输出回读 + 每会话路径白名单 | 特殊 | `src/output-file.ts:45-71`；`src/tracker.ts:325-341`；`src/remote.ts:150-161` | 本项目（0.8.1） | 无 | ○ 可跳过 |
| 36 | 输出/事件截断策略（保留尾部、环形上限、单条上限） | 特殊 | `src/index.ts:39-52`, `:451-505`；`src/tracker.ts:82-101` | 本项目 | 无 | ○ 可跳过 |
| 37 | 双 tsconfig + 构建产物断言 | 特殊 | `scripts/assert-artifacts.mjs:14-42`；`package.json:57`；`tsconfig.client.json` | 本项目 | 无官方章节（`cookbook/adding-a-package.zh.md` §6 只列仓库内 `pnpm` 验证命令） | ○ 可跳过 |

**分类统计**：37 条中，通用 16 条、混合 8 条、特殊 13 条。

---

## 4. 项目特有实现：解决什么问题、能否替换

| 模块 | 解决什么问题 | 能换成别的实现吗 | 依据 |
|---|---|---|---|
| Claude SDK 适配层（`src/index.ts:580-871`） | 把「委派一个任务」变成对 Anthropic Agent SDK 的一次 `query()` 调用并收集结果 | 能。任何 CLI / SDK / HTTP API 都能替换；DSH 完全不知道它的存在。替换边界就是 `execute()` 返回的规范化 JSON | 依赖声明 `package.json`；导入边界 `src/index.ts:5-6`；`RunOutcome` `:568-578` |
| `src/tracker.ts`（文本/事件镜像） | 面板需要多读者、绝对偏移、结构化事件；且不能消耗模型的 `job_output` 游标 | 部分能。**文本**可用官方 `ctx.jobs.readAt`（绝对偏移、不移动游标）替代；**结构化事件**没有官方等价物；**取消语义**可用官方 `kill` 但会改变「模型是否收到完成通知」的行为 | `subsystems/jobs.zh.md:234`, `:251-264`, `:504`；`src/tracker.ts:1-12` |
| `src/session-store.ts`（工作流注册表） | 跨进程记住外部 Claude 会话属于哪个「工作流名 + 目录」，让下一次 `resume` 找得回 | 能。换成 SQLite、DSH 的 session 事件、甚至环境变量都行；它只是「外部句柄 → 键」的映射 | `src/session-store.ts:1-28`；DSH 对照 `subsystems/persistence.zh.md:1-7` |
| `src/live-shell.ts`（实时输出通道） | Agent SDK 从不转发内置 Bash 的 stdout，长命令在面板上只剩心跳；于是插件自己 spawn 命令并逐行推事件 | 能。任何自建 MCP 工具 / 进程包装都能替代；也可以直接放弃「逐行实时输出」这个功能 | `src/live-shell.ts:1-16`（问题陈述）；`src/index.ts:678-680` |
| `src/output-file.ts`（落盘输出回读） | CLI 把超长输出写进文件并在结果里给出路径；面板要能分页读回 | 能。删掉「完整输出」按钮即可，不影响委派主链路 | `src/output-file.ts:1-16` |
| `src/remote.ts`（面板 RPC） | Harness 原生 job 列表只读，面板需要取消、事件流、工作流列表 | 能。官方 `ctx.jobs` + `dsh-api-job-controller` 的 `job.list` / `job.follow` Remote 流已覆盖名册与输出观察；本项目的自定义端口是为了事件流与取消语义 | `subsystems/jobs.zh.md:234`, `:315`；`src/remote.ts:1-15` |
| `src/client/*`（面板 UI） | 把委派过程可视化：按会话分组、工具卡片、实时输出、取消 | 能。slot 接口固定（`conversation.view`），组件可以整个换掉；甚至不做 UI，只用模型侧的 `job_output` | `subsystems/slots.zh.md:157-185`；`src/client/index.ts:34-39` |
| `src/delegate-model.ts`（跟随主模型/effort） | 默认让委派模型比主模型低一档（fable→opus, opus→sonnet），省钱且够用 | 能。写死 `model: 'sonnet'` 即可；这一层是产品策略，不是机制 | `src/index.ts:183-215`；`src/delegate-model.ts:13-35`；CHANGELOG 0.4.0/0.5.0 |
| `src/delegation-skill.ts`（随包技能） | 把「怎么派活」的 SOP 随插件一起安装，避免用户目录里再放一份 | 能。改成文件系统 skill（`<project>/.dsh/skills` 或 `~/.dsh/skills`）即可 | `subsystems/skills.zh.md` §本地发现优先级（:64-81）vs §ctx.skills `register`（:295） |

---

## 5. 「可跳过」清单及理由

按「跳过收益」排序。跳过的意思是：**学 DSH 插件开发时不必读**；读懂本项目时再按需回看。

| 可跳过项 | 具体范围 | 为什么可以跳过 |
|---|---|---|
| 1. Anthropic Agent SDK 全栈 | `query` / `Options` / `resume` / `includePartialMessages` / 消息 union / `AgentDefinition`（`src/index.ts:580-871`, `:424-440`） | 这是外部依赖的 API，不是 DSH 机制。DSH 官方文档零覆盖；换一个委托目标就全部作废 |
| 2. 实时输出通道 | `src/live-shell.ts` 全部；`src/index.ts:681-712` | 为绕开「SDK 不转发工具 stdout」而自建 MCP server；属于外部 SDK 限制的补丁，和插件机制无关 |
| 3. Claude 会话续接 | `src/session-store.ts` 全部；`src/index.ts:881-909`, `:1374-1382` | 自创的「工作流名 + 目录 → 外部 session id」注册表；DSH 的 persistence 是另一套（session event log） |
| 4. 监控面板整栈 | `src/tracker.ts`、`src/remote.ts`、`src/client/*` | 为「可视化后台任务」服务的完整 UI/RPC 栈。要做 UI 时先学 `slots.zh.md` + `api-gateway.zh.md` 两页，再回来看 |
| 5. 输出文件回读与截断 | `src/output-file.ts`；`src/index.ts:451-505`；`src/tracker.ts:82-101` | 纯面板体验优化，主链路（委派 → 结果）不依赖它 |
| 6. 模型/effort 跟随策略 | `src/delegate-model.ts`；`src/index.ts:183-215` | 产品默认值策略。只需知道「`ctx.get('sessionProjections')` 可读调用方模型」这一句 |
| 7. 两阶段超时与错误映射 | `src/index.ts:1106-1132`, `:319-440` | 产品级打磨（警告事件、可操作的报错文案），不是机制 |
| 8. 构建工程 | `scripts/build-client.mjs`、`scripts/assert-artifacts.mjs`、双 tsconfig | 本项目自己的构建约定。官方只要求 `dsh.client` + `exports["./client"]`；`__ModuleLoader__` 契约 docs 未覆盖 |
| 9. 安装层默认值 | `cordis.patch.yml` 的具体配置 | 机制只有一句「`dsh.bundle.patch` 指向一个 patch 文件」；文件里的 `permissionMode`、超时默认值是项目配置，不是知识 |
| 10. fork 历史与归属 | README §14、CHANGELOG 0.1–0.6 | 对理解代码有价值，但对「学 DSH 插件开发」是噪音。只有判断「这段能不能照抄」时才需要 |

---

## 6. 「不可跳过」清单（理解本项目）

这些是读懂本仓库**绕不开**的，但也仅限「读懂」，不必先于简单插件练习：

1. **工具注册与执行**：`src/index.ts:1188-1480`。`parameters` / `output.schema` / `render` / `execute` 四段结构，是本项目唯一面向模型的入口。
2. **后台作业**：`src/index.ts:973-1172`。`jobs.start` 的 `owner`（必须是 session id，不能是 Agent 对象，见 `:992-996`）、`handle.append` 与 `done.result` 的去重（`:1014`, `:1077-1079`）是 DSH 0.2 的关键适配。
3. **Remote 服务的参数约束**：`src/remote.ts:11-14`。SRC 模式按参数名生成 wire 字段，所以不能解构/默认值/rest。
4. **客户端 slot 注册时机**：`src/client/index.ts:34`。必须 `slots.inject('conversation.view', …)`，不能裸 `register`。
5. **技能是运行时注册的**：`src/index.ts:1175-1176`，不是从磁盘发现的；这决定了它随插件安装/卸载。
6. **可选服务用 `ctx.get`**：`src/index.ts:198-214`。这解释了为什么 `inject` 只有 `['tools','skills']`，而代码却读到了 `sessionProjections`。

---

## 7. 学习优先级（建议路线）

| 阶段 | 读什么 | 产出 |
|---|---|---|
| **T0（最小插件）** | `cordis-tutorial/01-first-plugin.zh.md` → `user/develop/basic/tool.zh.md` → `subsystems/tools.zh.md` §ToolDefinition | 能写一个 `greet` 工具插件并 `--patch` 挂载 |
| **T1（插件工程）** | `cordis-tutorial/05-config.zh.md` → `user/develop/basic/publish.zh.md` → `subsystems/skills.zh.md` §ctx.skills → `subsystems/jobs.zh.md` §生产方约定 + `cookbook/adding-a-tool.zh.md` §长时间运行的工作 | 能给插件加配置、打成 `dsh.bundle`、注册技能、跑后台作业 |
| **T2（客户端）** | `subsystems/client-modules.zh.md` §扫描 → `subsystems/slots.zh.md` §声明与生命周期/§Conversation 层级 → `api-gateway.zh.md` §编程模型/§运行时调用 | 能加一个 `conversation.view` tab，并通过 `@Remote` + `connection.rpc.call` 拿数据 |
| **T3（读本项目）** | 按 §2 五个注册面 → `src/index.ts` 工具段 → 作业段 → `remote.ts` → `tracker.ts` + `client/index.ts` → `live-shell.ts` / `session-store.ts` | 能解释「为什么 6500 行只贡献了 5 个面」 |

对应到本项目的源码阅读顺序：

1. `src/index.ts:20-27`（契约）→ `:98-181`（配置）→ `:1174-1186`（apply 装配）
2. `src/index.ts:1188-1480`（工具）
3. `src/index.ts:973-1172`（后台作业）
4. `src/remote.ts`（RPC）→ `src/client/index.ts`（slot）→ `src/client/api.ts:162-166`（RPC 调用）
5. `src/tracker.ts` + `src/client/ClaudeCodeView.tsx:226-500`（面板）
6. `src/live-shell.ts` + `src/session-store.ts`（外部 SDK 的两个补丁，最后读）

---

## 8. 出处汇总与不确定项

### 8.1 仓库出处

- 插件契约与装配：`src/index.ts:20`, `:27`, `:98-181`, `:1174-1186`
- 工具：`src/index.ts:3`, `:1188-1480`（参数 `:1206-1287`，输出 `:1288-1327`，执行 `:1329-1473`，presentCall `:1474-1479`）
- 技能：`src/index.ts:1175-1176`；`src/delegation-skill.ts:10-201`；`src/index.ts:249-299`
- 后台作业：`src/index.ts:973-1172`（`jobs.start :989`，`run :1000`，`append :1019-1025`，`done :1047-1104`，超时 `:1106-1132`）
- Remote：`src/remote.ts:74-173`
- 客户端：`src/client/index.ts:19-39`；`src/client/api.ts:162-166`
- 面板：`src/client/ClaudeCodeView.tsx:226-227`；`src/client/EventView.tsx:149-271`
- 外部 SDK 适配：`src/index.ts:580-871`；`src/live-shell.ts:157-303`；`src/output-file.ts:45-71`
- 会话注册表：`src/session-store.ts:71-75`, `:141-390`
- 构建：`package.json:8-36`, `:57`；`scripts/build-client.mjs:26-82`；`scripts/assert-artifacts.mjs:14-42`；`cordis.patch.yml:1-17`
- 来源声明：`README.md` §11（运行机制）、§14（派生来源与改动说明）；`CHANGELOG.md` 0.1.0–0.8.1

### 8.2 官方文档出处（相对 `E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\docs`）

- `cordis-tutorial/01-first-plugin.zh.md`：§编写插件
- `cordis-tutorial/02-lifecycle-and-effects.zh.md`：§Effect
- `cordis-tutorial/03-services.zh.md`：§使用 `inject` 消费服务、§可选依赖
- `cordis-tutorial/05-config.zh.md`：§可配置插件
- `cordis-api/context.zh.md`：§ctx.get（:239-259）
- `cookbook/adding-a-package.zh.md`：§1 创建包、§6 验证
- `cookbook/extension-cookbook.zh.md`：§工具插件、§功能→机制映射
- `cookbook/adding-a-tool.zh.md`：§最小形态、§长时间运行的工作
- `user/develop/basic/tool.zh.md`：全文（最小工具插件）
- `user/develop/basic/publish.zh.md`：§组合包 manifest
- `architecture.zh.md`：§Profile 与组合包、§会话日志、§新行为的归属位置
- `subsystems/tools.zh.md`：§ToolDefinition、§统一的 JSON 值 schema DSL、§ctx.tools
- `subsystems/skills.zh.md`：§提供方注册表、§本地发现优先级、§ctx.skills
- `subsystems/jobs.zh.md`：§生产方约定、§输出环、§消费方视图、§ctx.jobs
- `subsystems/client-modules.zh.md`：§扫描、§bundle 路由与 index 注入
- `subsystems/slots.zh.md`：§声明与生命周期、§Conversation 层级、§扩展规则
- `subsystems/session.zh.md`：`Session.header`（:478-485）
- `subsystems/persistence.zh.md`：§SessionHeader（:137-158）
- `subsystems/session-projection.zh.md`：§注册表 `ctx.sessionProjections`（:233-241）
- `api-gateway.zh.md`：§编程模型、§运行时调用、§SRC 开发回退
- `config-catalog.zh.md:5113`：`@deepseek-ai/dsh-client-ui-jobs` 仅列包名

### 8.3 不确定 / 推测项（阅读时请自行复核）

1. **0.3.x 面板与额度功能的 fork 归属**：`README.md` §14 把「监控面板」列为相对上游的新增能力，但 `CHANGELOG.md` 0.3.0 已记载面板、0.3.3 记载额度条。两者不一致；本文只把面板归为「本项目代码库既有」，不细分上游/本仓库。
2. **`ctx.jobs.kill()` 吞掉模型通知**：仅见 `src/tracker.ts:4-9` 的项目注释。官方 `subsystems/jobs.zh.md` §ctx.jobs `kill`（:506-516）只描述「请求取消并标记 stopping」，未直接说模型收不到通知。**推测**：这是本项目对 0.2 运行时行为的实测结论。
3. **`window.__ModuleLoader__.load` 契约**：在 0.2.2-rc.5 随包中文 docs 全量 grep 未检到该字样。**推测**：它属于 `@deepseek-ai/dsh-client-modules` 浏览器半的运行时契约（可能在其包 README，但 npm 包内未随附 README）。本项目 `scripts/build-client.mjs:1-15` 的注释是当前可用的第一手描述。
4. **客户端 `ctx.jobs` 的服务形状**：官方 docs 只在 `config-catalog.zh.md:5113` 列出 `@deepseek-ai/dsh-client-ui-jobs` 包名，没有 API 章节。本项目在 `src/client/types.ts:36-68` 用结构化镜像描述它，属于**按运行时逆向**，不是文档承诺。
5. **`config.subagents` 与 DSH `ctx.subagents`**：前者确定是 Anthropic SDK 的 `AgentDefinition`（`src/index.ts:424-440`）；本项目未使用 DSH 的 subagent provider。二者同名，学习时不要混淆。
