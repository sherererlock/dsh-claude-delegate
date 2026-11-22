# 02 — 本项目的模块依赖图与走读顺序（研究结果）

> 对应票：`.scratch/learn-dsh-plugin/issues/02-project-module-dependency-map.md`
>
> 研究对象：本仓库 `src/` 下的全部源文件（实际 **20 个**，约 **6498 行**）。
>
> 代码快照：`main` 分支当前工作区（最近提交 `4feb2c1`）。本文所有 `文件:行号` 均按该快照的 `Read` 行号核对过；未修改任何源码或票文件，未执行联网与 git 操作。

---

## 0. 先给结论

1. **实际是 20 个文件，不是 17 个**：宿主侧 8 个、客户端 12 个。票面写的「17 个 / 宿主 6 / 客户端 11」是过期计数，但票里列出的文件名恰好是 20 个（见 §1）。
2. **两半区完全不在编译期共享代码**：`src/` 与 `src/client/` 之间没有任何 import。两端靠 JSON wire 协议（`claudeCode/*`）通信，类型是「结构镜像 + 客户端重新校验」，不是共享类型包。
3. **宿主依赖图是一棵两层星形树**：`src/index.ts` 是组合根，向下依赖 6 个模块；`remote.ts` 再依赖 `tracker.ts`、`session-store.ts`、`output-file.ts`；其余 5 个是叶子。无环。
4. **客户端依赖图是一棵以 `client/index.ts` 为根的树**：`types.ts`、`locales.ts`、`styles.ts` 是叶子；`format.ts` 被单独拆出，专门用来断开 `ClaudeCodeView → JobDetailModal → ClaudeCodeView` 的潜在环。无环。
5. **启动时只做四件注册**：注册 2 个 skill、1 个宿主 remote 服务（`claudeCode`）、1 个工具（`claude_code`），再创建进程内的 `JobTracker` 与 `SessionStore`（后者懒加载磁盘）。
6. **面板的数据来自三条 job 源**：0.2 的 `jobs` 客户端服务、0.1 的 `session.jobsBySession` 镜像、插件自己的 `listJobs` 轮询；结构化事件与文本各用一个绝对偏移游标读取，刷新只在选中任务仍 live 时进行。

---

## 1. 范围校正：20 个文件（8 宿主 + 12 客户端）

票文件第 9 行写「17 个源文件」，第 14 行写「宿主侧 6 个文件」却列出了 8 个，第 15 行写「客户端 11 个文件」却列出了 12 个。以实际 `src/` 目录为准：

| 半区 | 数量 | 文件 |
| --- | ---: | --- |
| 宿主侧（Node / DSH 进程） | 8 | `index.ts`、`tracker.ts`、`remote.ts`、`live-shell.ts`、`session-store.ts`、`delegate-model.ts`、`delegation-skill.ts`、`output-file.ts` |
| 客户端（Web 浏览器 bundle） | 12 | `client/index.ts`、`client/api.ts`、`client/types.ts`、`client/ClaudeCodeView.tsx`、`client/EventView.tsx`、`client/JobDetailModal.tsx`、`client/OutputView.tsx`、`client/PersistedOutput.tsx`、`client/format.ts`、`client/locales.ts`、`client/md.ts`、`client/styles.ts` |
| **合计** | **20** | 约 **6498** 行（按本次 `Read` 行号累计） |

> 下游影响：`map.md` 第 7、12 行也写「17 个源文件」；第 12 行的「约 6500 行」与实际相符，说明只是计数文字过期，文件清单本身没有遗漏。写 HTML 时应按 20 个模块覆盖，否则会漏掉 `live-shell.ts`、`output-file.ts`、`delegate-model.ts`、`PersistedOutput.tsx`、`OutputView.tsx`、`JobDetailModal.tsx` 等 6 个模块。

两半区对应的构建出口也印证了边界（`package.json:8-18`）：

- 宿主 bundle：`"." → ./lib/index.js`
- 客户端 bundle：`"./client" → ./lib/client.js`

客户端 bundle 只保证能解析 `react` / `react/jsx-runtime`（见 `src/client/md.ts:4-8` 的注释），因此客户端所有展示逻辑都必须是零依赖的。

---

## 2. 文件职责与主要导出

### 2.1 宿主侧（8 个）

| 文件 | 行数 | 一句话职责 | 主要导出 |
| --- | ---: | --- | --- |
| `src/index.ts` | 1481 | 插件宿主入口：注册 skills / remote / tool，并把一次委派从参数解析跑到 Agent SDK 流与结算。 | `name`、`inject`、`Config`、`SubagentConfig`、`apply`；并 re-export `delegateModelFor`、`delegateEffortFor` |
| `src/tracker.ts` | 409 | 进程内的事件与作业数据模型：事件环缓冲、按 session 隔离的 `JobTracker`、输出文件白名单。 | `TrackedStatus`、`TrackedRead`、`ClaudeEvent`、`TrackedEventRead`、`EventBuffer`、`createEventBuffer`、`TrackedSettlement`、`TrackedJob`、`TrackedRegistration`、`JobInfo`、`toJobInfo`、`JobTracker` |
| `src/remote.ts` | 173 | 面板的宿主 RPC 服务（`claudeCode/*`），把 tracker / session-store / output-file 暴露给客户端。 | `JobInfoWire`、`ReadOutputResult`、`ReadEventsResult`、`CancelOutcome`、`ReadOutputFileResult`、`WorkstreamWire`、`ClaudeCodeRemote` |
| `src/live-shell.ts` | 303 | 自建 MCP shell 工具 `mcp__dsh__shell`，把长命令输出逐行流式送进事件流。 | `LIVE_SHELL_SERVER`、`LIVE_SHELL_TOOL`、`LIVE_SHELL_TOOL_ID`、`LiveShellStream`、`LiveShellOptions`、`LiveShell`、`resolveBash`、`createLiveShell`、`LIVE_SHELL_SYSTEM_RULE` |
| `src/session-store.ts` | 390 | 工作流名 + 目录 → Claude session id 的持久化注册表，以及续接决策。 | `StoredSession`、`WorkstreamInfo`、`defaultSessionFile`、`excerpt`、`ago`、`ResumePlan`、`PlanInput`、`SessionStore` |
| `src/delegate-model.ts` | 36 | 由调用方主会话的 model / effort 推导委派默认值的纯策略模块。 | `delegateModelFor`、`EFFORT_LEVELS`、`delegateEffortFor` |
| `src/delegation-skill.ts` | 201 | 运行时注册的「Claude Code 委派规程」skill 内容（模板 + 操作事实）。 | `DELEGATION_SKILL` |
| `src/output-file.ts` | 71 | CLI 自己落盘（`Full output saved to:`）的输出文件的只读窗口读取。 | `MAX_OUTPUT_WINDOW`、`OutputWindow`、`readOutputWindow` |

### 2.2 客户端侧（12 个）

| 文件 | 行数 | 一句话职责 | 主要导出 |
| --- | ---: | --- | --- |
| `src/client/index.ts` | 40 | 客户端入口：装样式、构造 api + view、注册 `conversation.view` 槽。 | `inject`、`apply` |
| `src/client/api.ts` | 228 | `/api` 上的 `claudeCode/*` RPC 客户端与 payload 防御式校验。 | `ClaudeCodeApiError`、`ClaudeCodeApi`、`createApi` |
| `src/client/types.ts` | 221 | 浏览器侧的结构化类型镜像：DSH 客户端服务面 + 插件 wire 协议。 | `JobStatus`、`JobView`、`SessionListSnapshot`、`UseSessions`、`JobsClient`、`JobsState`、`ObservedOutput`、`ViewProps`、`RpcResult`、`ConnectionService`、`SlotRegisterOptions`、`SlotsService`、`Context`、`JobInfo`、`ReadOutputResult`、`ReadOutputFileResult`、`ClaudeEvent`、`ReadEventsResult`、`WorkstreamView` |
| `src/client/ClaudeCodeView.tsx` | 731 | 面板编排者：合并三路 job 源、按会话分组、轮询事件 / 文本、渲染 tab / pane / actions。 | `createClaudeCodeView` |
| `src/client/EventView.tsx` | 490 | 把扁平事件流折叠成原生风格的工具卡 / 思考块 / 终端块并渲染。 | `EventViewProps`、`EventView` |
| `src/client/JobDetailModal.tsx` | 109 | 单个委派任务的详情弹窗。 | `JobDetailModalProps`、`JobDetailModal` |
| `src/client/OutputView.tsx` | 98 | 纯文本实时输出窗格（没有结构化事件时的 fallback）。 | `OutputViewProps`、`OutputView` |
| `src/client/PersistedOutput.tsx` | 101 | CLI 落盘输出文件的尾部加载与向前分页。 | `PersistedOutputProps`、`PersistedOutput` |
| `src/client/format.ts` | 43 | 时长 / 时钟 / 状态文案格式化。 | `formatDuration`、`formatClock`、`statusLabel` |
| `src/client/locales.ts` | 166 | 中英文文案字典与 `t` / `tf`。 | `zh`、`en`、`LocaleKey`、`t`、`tf` |
| `src/client/md.ts` | 316 | 零依赖 Markdown → React 渲染器（安全、memo 化）。 | `MarkdownProps`、`Markdown` |
| `src/client/styles.ts` | 891 | 类名表 + 一次性注入的样式表 + 工具色哈希。 | `CSS`、`toolToneClass`、`installStyles` |

---

## 3. 依赖 DAG

### 3.1 宿主侧

```
                         ┌────────────────────────────────────────────┐
                         │ src/index.ts                               │
                         │ 组合根：apply / defineTool / execute       │
                         └───┬────────┬────────┬────────┬────────┬────┘
                             │        │        │        │        │
        ┌────────────────────┘        │        │        │        └─────────────────┐
        ▼                             ▼        ▼        ▼                          ▼
  src/tracker.ts            src/remote.ts  ...  src/session-store.ts      src/delegation-skill.ts
  （叶子，零 import）            │              （叶子，仅 node:*）        （叶子，仅 type import）
                             │
              ┌──────────────┼───────────────────┐
              ▼              ▼                   ▼
       src/tracker.ts  src/session-store.ts  src/output-file.ts
                                              （叶子，node:fs/promises）

  另外两个由 index.ts 直接依赖的叶子：
  src/live-shell.ts（叶子，SDK + node:*）
  src/delegate-model.ts（叶子，零 import）
```

等价的边列表（`*` 表示 type-only）：

| 起点 | 终点 | 性质 |
| --- | --- | --- |
| `src/index.ts` | `tracker.ts` | runtime（`JobTracker`、`createEventBuffer`）+ type（`ClaudeEvent`、`EventBuffer`、`TrackedSettlement`） |
| `src/index.ts` | `remote.ts` | runtime（`new ClaudeCodeRemote`） |
| `src/index.ts` | `session-store.ts` | runtime（`new SessionStore`）+ type（`ResumePlan`） |
| `src/index.ts` | `delegation-skill.ts` | runtime（`DELEGATION_SKILL`） |
| `src/index.ts` | `live-shell.ts` | runtime（`createLiveShell`、`LIVE_SHELL_SERVER`、`LIVE_SHELL_SYSTEM_RULE`、`LIVE_SHELL_TOOL_ID`、type `LiveShell`） |
| `src/index.ts` | `delegate-model.ts` | runtime（`delegateModelFor`、`delegateEffortFor`、`EFFORT_LEVELS`） |
| `src/remote.ts` | `tracker.ts` | runtime（`toJobInfo`）+ type（`ClaudeEvent`、`JobInfo`、`JobTracker`、`TrackedStatus`） |
| `src/remote.ts` | `session-store.ts` | runtime（`SessionStore.describe`）+ type（`WorkstreamInfo`） |
| `src/remote.ts` | `output-file.ts` | runtime（`readOutputWindow`） |
| 其余 5 个文件 | — | 无本地 import |

要点：

- `src/index.ts` 是唯一的组合根；没有任何模块反向 import 它。
- `src/tracker.ts` 零 import（连 `node:*` 都没有），是纯数据模型，适合作为第一读。
- `src/remote.ts` 是唯一的「适配器层」：它把三个领域模块聚合成 RPC 面，自己不持有业务状态。
- `src/live-shell.ts` 是一个独立子系统，只通过 `createLiveShell` 的 `onLine / onStart / onEnd` 回调与主流程耦合。

### 3.2 客户端侧

```
                         ┌────────────────────────────────────────────┐
                         │ src/client/index.ts                        │
                         │ 组合根：apply / slots.register             │
                         └──┬───────┬───────────────┬────────┬───────┘
                            │       │               │        │
              ┌─────────────┘       │               │        └──────────────┐
              ▼                     ▼               ▼                       ▼
        src/client/api.ts   ClaudeCodeView.tsx   styles.ts              locales.ts
              │                     │
              │ type                ├── api.ts (type)
              ▼                     ├── types.ts (type)
        src/client/types.ts         ├── EventView.tsx
                                    │     ├── styles.ts
                                    │     ├── md.ts ──────────────► styles.ts
                                    │     ├── locales.ts
                                    │     ├── PersistedOutput.tsx
                                    │     │     ├── styles.ts
                                    │     │     ├── locales.ts
                                    │     │     └── types.ts (type)
                                    │     └── types.ts (type)
                                    ├── OutputView.tsx ──► styles.ts, locales.ts
                                    ├── JobDetailModal.tsx ──► format.ts, styles.ts, locales.ts, types.ts
                                    ├── format.ts ──► locales.ts, types.ts (type)
                                    ├── styles.ts
                                    └── locales.ts
```

等价的边列表（`*` 表示 type-only）：

| 起点 | 终点 |
| --- | --- |
| `client/index.ts` | `api.ts`、`ClaudeCodeView.tsx`、`styles.ts`、`locales.ts`、`types.ts*` |
| `client/ClaudeCodeView.tsx` | `api.ts*`、`types.ts*`、`EventView.tsx`、`OutputView.tsx`、`JobDetailModal.tsx`、`format.ts`、`styles.ts`、`locales.ts` |
| `client/EventView.tsx` | `styles.ts`、`md.ts`、`locales.ts`、`PersistedOutput.tsx`、`types.ts*` |
| `client/JobDetailModal.tsx` | `types.ts*`、`format.ts`、`styles.ts`、`locales.ts` |
| `client/OutputView.tsx` | `styles.ts`、`locales.ts` |
| `client/PersistedOutput.tsx` | `styles.ts`、`locales.ts`、`types.ts*` |
| `client/format.ts` | `locales.ts`、`types.ts*` |
| `client/api.ts` | `types.ts*` |
| `client/md.ts` | `styles.ts` |
| `client/types.ts`、`client/locales.ts`、`client/styles.ts` | 无 |

要点：

- 叶子是 `types.ts`、`locales.ts`、`styles.ts`。`md.ts` 只依赖 `styles.ts`，是一个几乎独立的解析器。
- `format.ts` 是**为了断环而存在**的：`ClaudeCodeView` 要渲染 `JobDetailModal`，而弹窗又需要与 tab 相同的时长 / 状态文案；如果弹窗反向 import 视图就会成环（`src/client/format.ts:1-7` 明确写了这一点）。
- `ClaudeCodeView.tsx` 依赖所有展示组件；它是客户端的容器组件，`client/index.ts` 再把它交给槽。

### 3.3 两端如何共享类型

**结论：不共享代码，只共享 JSON wire 形状。** 两端分别打 bundle，客户端解析不到宿主的 `declare module` 增强，因此 `client/types.ts` 选择「只复述实际用到的结构」（`src/client/types.ts:1-8`）。对应关系如下：

| 概念 | 宿主定义（真相源） | 客户端镜像 | 共享方式 |
| --- | --- | --- | --- |
| 结构化事件 `ClaudeEvent` | `src/tracker.ts:34-69` | `src/client/types.ts:161-195` | 结构复制；客户端在 `src/client/api.ts:49-110` 逐字段重建，未知 `type` 直接丢弃 |
| 作业列表 `JobInfo` | `src/tracker.ts:271-286` | `src/client/types.ts:117-132` | JSON；宿主 wire 变体 `JobInfoWire` 把 `model` 强制为 `string \| null`（`src/remote.ts:22-29`） |
| `readOutput` 结果 | `src/remote.ts:32-37` | `src/client/types.ts:135-140` | JSON |
| `readEvents` 结果 | `src/remote.ts:40-45` | `src/client/types.ts:198-203` | JSON |
| `readOutputFile` 结果 | `src/remote.ts:51-61` | `src/client/types.ts:143-153` | JSON |
| 工作流注册表行 | `src/session-store.ts:48-58` + `src/remote.ts:68-71` | `src/client/types.ts:207-221` | JSON；宿主预格式化 `summary` |
| DSH 客户端运行时（`Context`、`SlotsService`、`ConnectionService`、`JobsClient`、`ViewProps`） | — | `src/client/types.ts:46-114` | 客户端独有；宿主完全不知道 |

这种设计的直接后果：

- **宿主可以比客户端新**：客户端 `toEvent` 的 `default: return null`（`src/client/api.ts:107-109`）会安静跳过不认识的 event，而不是让整个面板抛错。
- **客户端不能信任 wire**：`createApi` 会检查 `{ ok, value }` 信封（`src/client/api.ts:29-31, 170-172`），`readEvents` 会重建每个事件（`src/client/api.ts:190-209`），`listWorkstreams` 会逐行丢弃坏行（`src/client/api.ts:116-138`）。
- **类型漂移是显式成本**：修改 `tracker.ts` 的 `ClaudeEvent` 时，必须同步 `client/types.ts` 与 `api.ts` 的重建逻辑；这是本仓库唯一的「双写」点，也是写 HTML 时值得画成「契约边界」的地方。

### 3.4 分层结论

| 层 | 宿主侧 | 客户端侧 |
| --- | --- | --- |
| 契约 / 数据模型 | `tracker.ts`（零依赖）、`session-store.ts` 的 `ResumePlan` | `types.ts`（零依赖） |
| 领域策略 | `session-store.ts`（续接）、`delegate-model.ts`（默认值） | `format.ts`、`locales.ts` |
| 适配器 / 子系统 | `remote.ts`（RPC）、`live-shell.ts`（MCP shell）、`output-file.ts`（文件窗口） | `api.ts`（RPC 客户端）、`md.ts`（解析器） |
| 展示组件 | — | `EventView`、`OutputView`、`JobDetailModal`、`PersistedOutput` |
| 容器 | — | `ClaudeCodeView.tsx` |
| 组合根 | `index.ts` | `client/index.ts` |

---

## 4. 宿主启动 / 注册调用链

### 4.1 模块加载阶段

`src/index.ts` 被 DSH 加载时，模块顶层没有 I/O，只有声明与常量：

- `name = 'claude-code'`（`src/index.ts:20`）——插件名。
- `inject = ['tools', 'skills']`（`src/index.ts:27`）——只有这两个服务就绪后 `apply` 才会被调用。注释明确说明：这个 Cordis 版本没有 optional-inject，`sessionProjections` 必须在调用时用 `ctx.get()` 读取（`src/index.ts:21-26`）。
- `Config` 的 schemastery schema（`src/index.ts:98-181`）——配置面在模块加载时构造，但不读取值。
- `PARALLEL_DEV_SKILL`（`src/index.ts:249-299`）——第二个内置 skill 的内容常量。

### 4.2 `apply(ctx, config)` 注册阶段

```
DSH runtime
│
├─ import src/index.ts
│   ├─ name = 'claude-code'                       src/index.ts:20
│   ├─ inject = ['tools', 'skills']                src/index.ts:27
│   └─ Config = z.object({ ... })                  src/index.ts:98
│
└─ apply(ctx, config)                              src/index.ts:1174
    ├─ ctx.skills.register(DELEGATION_SKILL)       src/index.ts:1175
    ├─ ctx.skills.register(PARALLEL_DEV_SKILL)     src/index.ts:1176（定义 :249）
    ├─ new JobTracker()                            src/index.ts:1181
    ├─ new SessionStore()                          src/index.ts:1184（磁盘懒加载）
    ├─ new ClaudeCodeRemote(ctx, tracker, sessions) src/index.ts:1185
    │   └─ super(ctx, 'claudeCode')                src/remote.ts:80
    │       └─ @Remote 方法由 api-gateway 反射发现  src/remote.ts:92,101,110,129,150,168
    └─ ctx.tools.register(defineTool({ ... }))     src/index.ts:1188
        └─ execute(args, exec)                     src/index.ts:1329
```

`apply` 本身是同步的（`src/index.ts:1174-1481`）：注册动作全部完成就返回，真正的委派发生在模型调用 `claude_code` 工具时。

### 4.3 一次工具调用的两条路径

```
execute(args, exec)                                src/index.ts:1329
├─ currentMainSelection(ctx, exec.agent)           src/index.ts:194
│   └─ ctx.get('sessionProjections')               src/index.ts:201
├─ 组装 RunRequest                                 src/index.ts:1331-1363
├─ preflight(req)                                  src/index.ts:320
├─ sessionOwnerId(exec.agent)                      src/index.ts:241
├─ sessions.plan({ cwd, owner, ... })              src/index.ts:1374
│   └─ 实现                                      src/session-store.ts:234
├─ if (plan.resume !== undefined) req.resume = ... src/index.ts:1382
│
├─ if (args.run_in_background)
│   ├─ const jobs = ctx.get('jobs')                src/index.ts:1385
│   ├─ sessions.begin(plan.key)                    src/index.ts:1389
│   ├─ startBackgroundJob(jobs, req, owner, ...)   src/index.ts:1391（定义 :973）
│   │   ├─ jobs.start({ kind, label, owner, run }) src/index.ts:989
│   │   │   └─ run(handle)                         src/index.ts:1000
│   │   │       └─ runWithSession(...)             src/index.ts:1049
│   │   ├─ tracker.register({ jobId, read, ... })  src/index.ts:1152
│   │   └─ done.then(() => tracker.settle(...))    src/index.ts:1165
│   └─ return { kind: 'background', jobId }        src/index.ts:1392
│
└─ else（前台）
    ├─ new AbortController()                       src/index.ts:1399
    ├─ tracker.register({ jobId: 'foreground-N' }) src/index.ts:1420
    ├─ sessions.begin(plan.key)                    src/index.ts:1438
    ├─ runWithSession(req, abort, sessions, plan)  src/index.ts:1439（定义 :881）
    │   └─ runClaude(req, abort, onDelta, onEvent) src/index.ts:890（定义 :661）
    │       ├─ createLiveShell({ ... })            src/index.ts:682（定义 src/live-shell.ts:157）
    │       ├─ query({ prompt, options })          src/index.ts:716
    │       └─ for await (const msg of stream)     src/index.ts:722
    ├─ tracker.settle(jobId, { status: 'completed' }) src/index.ts:1440
    └─ sessions.end(plan.key)                      src/index.ts:1470
```

`runWithSession` 额外处理一种失败：如果这次是「自动续接」（`plan.mode === 'continued'`）且 SDK 报会话不存在，就清掉 `req.resume` 重跑一次并把 `plan.mode` 改成 `'new'`（`src/index.ts:896-906`）。这让「上次会话被清理」不会变成任务失败。

### 4.4 SDK 运行与两条流

`runClaude`（`src/index.ts:661-871`）是整个插件的核心循环。它同时服务两个完全不同的观察者：

```
query() 的异步消息流
├─ msg.type === 'assistant'
│   ├─ text      → output += ...；把 delta 未覆盖的部分 onEvent({type:'text'})
│   ├─ thinking  → onEvent({type:'thinking'})
│   └─ tool_use  → onDelta('\n[tool] Name\n')；onEvent({type:'tool_use'})
├─ msg.type === 'user'（工具结果）
│   └─ 非 replay 的 tool_result → capTailText + persistedOutputPaths → onEvent
├─ msg.type === 'stream_event'
│   └─ text_delta → onDelta(text) + onEvent({type:'text'})；deltaText 去重
├─ msg.type === 'tool_progress'
│   └─ onEvent({type:'tool_progress'})
└─ msg.type === 'result'
    └─ 汇总 cost / turns / duration / structured_output → onEvent({type:'result'})
```

两条流的分工（`src/index.ts:651-659` 的注释写得很清楚）：

- **`onDelta` 是文本流**：给模型的 `job_output` 消费，token 级、只追加；前台只写入 `full` 缓冲，后台还会写 `pending` 与 jobs seam 的 ring。
- **`onEvent` 是结构化流**：给面板消费，按完整内容块产生一条事件；不镜像 partial delta，避免面板逐字符闪烁。

后台路径的 `onDelta` 还会把文本同时写入 `pending`（给 `job_output` 的读-清游标）和 `full`（给面板的绝对偏移游标），并对 `handle.append` 做一次去重（`src/index.ts:1016-1026`）。这是理解「为什么模型读输出和面板读输出不会互相抢字节」的关键。

---

## 5. 客户端 `apply` → 面板渲染调用链

### 5.1 `apply` 注册阶段

```
client/index.ts apply(ctx)                         src/client/index.ts:25
├─ installStyles()                                 src/client/index.ts:26
│   └─ 幂等注入 <style id="dsh-claude-delegate-panel">  src/client/styles.ts:883
├─ const jobs = ctx.get?.<JobsClient>('jobs')      src/client/index.ts:32
├─ const ClaudeCodeView = createClaudeCodeView(    src/client/index.ts:33
│       createApi(ctx.connection), jobs)
│   ├─ createApi(connection)                       src/client/api.ts:162
│   └─ createClaudeCodeView(api, jobs)             src/client/ClaudeCodeView.tsx:226
└─ ctx.slots.inject('conversation.view', () =>     src/client/index.ts:34
      ctx.slots.register({
        name: 'conversation.view',
        id: 'claude-code',
        order: 100,
        label: () => t('view.label'),
      }, ClaudeCodeView))
```

`inject = ['slots', 'connection']`（`src/client/index.ts:19`）是客户端激活的全部前置；`jobs` 故意用 `ctx.get` 懒查，因此 bundle 在 0.1.x 客户端（没有该服务）上也能加载（`src/client/index.ts:27-32`）。

### 5.2 首次渲染

```
ClaudeCodeView({ sessionId, useSessions })          src/client/ClaudeCodeView.tsx:227
├─ panel = panelOf(sessionId)                       :233（模块级缓存 :113-128）
├─ native   = (jobs?.state ?? NO_ROSTER)(...)       :231
├─ mirrored = useSessions(s => s.jobsBySession?.[sessionId]) :232
├─ tracked  ← api.listJobs 轮询（2s）               :260-281
├─ rows = ordered(mergeRows(native, mirrored, tracked)) :239-242
├─ groups = groupsOf(rows)                          :291（实现 :161）
├─ selected = panel.selected ?? defaultSelection()  :296
├─ register ← api.listWorkstreams                   :352-374
├─ live read loop（仅选中组 live 时 1s 轮询）        :381-441
│   ├─ api.readEvents(sessionId, jobId, offset)      :410
│   └─ api.readOutput(sessionId, jobId, offset)      :394
├─ renderRun(job)                                   :510
│   ├─ EventView（有事件时）                         :516
│   │   └─ toNodes → Markdown / PersistedOutput      :149 / src/client/md.ts:306 / :358
│   └─ OutputView（无事件时 fallback）               :526
└─ JobDetailModal（detailFor 有值时）                :718
```

三个 row 源缺一不可：

1. `jobs.state`（0.2 的客户端 jobs 服务）——状态推送最及时，但可能滞后于作业启动。
2. `useSessions(state.jobsBySession)`（0.1 的 session store 镜像）——兼容旧客户端。
3. `api.listJobs`（插件自己的 tracker）——唯一能保证「刚启动的委派立即出现」的源，因为它直接读宿主 `JobTracker`。

`mergeRows` 按 `id` 去重并保留最早出现的那份（`src/client/ClaudeCodeView.tsx:57-63`），`ordered` 再按「live 优先、按开始时间；settled 按结束时间倒序」排序（`:135-143`）。

### 5.3 刷新策略

- **roster**：`listJobs` 固定 2 秒轮询（`TRACKED_POLL_MS`，`src/client/ClaudeCodeView.tsx:48, 260-281`），且失败会显示错误而不是静默空列表（注释 `:270-276`）。
- **元数据 / 注册表**：依赖 `lifecycle = rows.map(id:status).join(',')` 变化触发（`:350-374`），状态一变就重新拉 `listJobs` + `listWorkstreams`；注册表拉取失败被吞掉（它是便利功能）。
- **实时事件 / 文本**：只在「选中组里有 live 任务」时 1 秒轮询（`src/client/ClaudeCodeView.tsx:434-436`）；状态变化会触发最后一次读取（依赖列表包含 `currentStatus`）。
- **所有 run 都拉**：一个 tab 可能包含多次调用，`pull()` 对整个 `currentJobs` 循环（`:426-431`），因此续接会话的 tab 能看到历史轮次。
- **两个独立游标**：`panel.outputs` 与 `panel.events` 各自保存 `offset`；面板读事件不会消耗模型的 `job_output` 字节（宿主侧 `EventBuffer.read` 不移动游标，`src/tracker.ts:129-144`）。

### 5.4 `createApi` 如何拿到宿主数据

客户端没有为插件生成 typed client，而是直接使用 connection 服务的通用一元 RPC：

```
client API 调用（例：listJobs）
  → call('listJobs', { sessionId })                       src/client/api.ts:176
  → connection.rpc.call('/api', 'claudeCode/listJobs', { args }, signal)
                                                          src/client/api.ts:166
  → api-gateway 按 `/api/<namespace>/<method>` 分发
  → ClaudeCodeRemote.listJobs(sessionId)                  src/remote.ts:102
  → tracker.list(sessionId)                               src/tracker.ts:395
  → toJobInfo(job)                                        src/tracker.ts:292
  → { ok: true, value } 信封
  → api.ts 检查信封并返回 value                            src/client/api.ts:170-172
```

另外三条典型路径：

```
readEvents:
  client.readEvents → remote.readEvents                   src/remote.ts:130
  → tracker.require(sessionId, jobId)                      src/tracker.ts:387
  → job.readEvents(offset)                                 src/tracker.ts:356
  → EventBuffer.read(offset)                               src/tracker.ts:186

readOutput:
  client.readOutput → remote.readOutput                    src/remote.ts:111
  → tracker.require(...) → job.read(offset)                src/remote.ts:112-114
  → 文本缓冲的绝对偏移读取（接口声明见 src/tracker.ts:233）

readOutputFile:
  client.readOutputFile → remote.readOutputFile            src/remote.ts:151
  → tracker.requireOutputPath(sessionId, filePath)         src/tracker.ts:335
  → readOutputWindow(path, offset, limit)                  src/output-file.ts:45
```

安全边界值得单独强调：`readOutputFile` 不接受浏览器随手给的任意路径。路径必须先出现在该 session 自己的事件流里，由 `tracker.allowOutputPath` 登记（`src/index.ts:1033-1035` 后台、`:1416-1418` 前台），之后 `requireOutputPath` 才放行（`src/tracker.ts:325-340`）。

### 5.5 渲染树

```
<div className={CSS.root} data-conversation-composer-overlay>
├─ 工作流注册表（可折叠）                     src/client/ClaudeCodeView.tsx:563-581
├─ tab strip（每个 Claude 会话一个 tab）       :583-622
│   └─ 每个 tab: 状态点 + 截断标签 + 轮次 + ⓘ 详情
├─ pane                                        :624
│   ├─ paneHead（状态 / 轮次 / 费用 / 耗时）    :635-650
│   ├─ error（可选）                            :652
│   ├─ 每个 run:
│   │   ├─ 用户气泡（这一轮的任务原文）          :675-679
│   │   └─ renderRun                            :510
│   │       ├─ EventView（结构化事件）
│   │       └─ OutputView（纯文本 fallback）
│   └─ actions（取消 / 复制输出 / 复制会话 id）  :685-712
└─ JobDetailModal（可选）                       :718-727
```

`EventView` 内部再由 `toNodes` 把扁平事件折叠成：

- `text`（相邻文本合并，Markdown 渲染，可切原文）
- `thinking`（默认折叠）
- `tool`（参数预览 + `tool_result` 按 `tool_use_id` 挂到对应卡片）
- `console`（`mcp__dsh__shell` 的逐行输出，按 `run` id 分块，`exit …` 作为 footer）
- `result` / `warning` / `meta` / `orphanResult`

---

## 6. 推荐走读顺序（先概念、后实现）

### 6.1 顺序表

> 「前置」列只列**读懂该文件所必需**的模块；标注「可先黑盒」的依赖可以先跳过、知道它提供什么即可。
>
> 成本是首次阅读估算（含理解与回看），不是纯阅读时间。

| 序 | 模块（行数） | 先建立的概念 | 前置 | 预计成本 | 跳过策略 |
| ---: | --- | --- | --- | ---: | --- |
| 1 | `src/tracker.ts`（409） | 宿主数据模型：`ClaudeEvent`、事件环、`JobTracker` | 无 | 30 min | **不可跳过**；后面 remote / index / 面板全部引用它 |
| 2 | `src/client/types.ts`（221） | 客户端契约：DSH 客户端服务面 + wire 类型 | 无；建议紧接 1 对照 | 15 min | **不可跳过**；它是客户端侧的「真相镜像」 |
| 3 | `src/session-store.ts`（390） | 续接概念：工作流名 + 目录 → session id | 无 | 25 min | **不可跳过**；第 9 步 `execute` 要用 |
| 4 | `src/delegate-model.ts`（36） | 默认 model / effort 的纯策略 | 无 | 3 min | 可跳过；需要改默认策略时再看 |
| 5 | `src/output-file.ts`（71） | CLI 落盘输出的分页读取 | 无 | 5 min | 可先黑盒；读 `remote.ts` 前补 |
| 6 | `src/remote.ts`（173） | 宿主 RPC 面与文件白名单 | 1、3、5 | 12 min | **不可跳过**；客户端所有数据都从这里出 |
| 7 | `src/live-shell.ts`（303） | 自建 MCP shell 的完整子系统 | 无 | 20 min | 首轮可跳过；不影响主线，改长命令输出时再看 |
| 8 | `src/delegation-skill.ts`（201） | 运行时 skill 的注册形态与内容 | 无 | 5 min（略读） | 可跳过正文，只读 12-18 行 |
| 9 | `src/index.ts`（1481） | 入口、注册、执行、SDK 流 | 1、3、4、6、7、8（5 可黑盒） | 75 min | **不可跳过**；建议分三段读（见 6.2） |
| 10 | `src/client/api.ts`（228） | 浏览器 → 宿主的 RPC 客户端 | 2 | 12 min | **不可跳过** |
| 11 | `src/client/locales.ts`（166） | 文案字典与 `t` / `tf` | 无 | 3 min（略读） | 可跳过字典正文 |
| 12 | `src/client/styles.ts`（891） | 类名表 + 一次性注入 | 无 | 5 min（略读） | 可跳过 CSS 正文 |
| 13 | `src/client/format.ts`（43） | 时长 / 时钟 / 状态格式化 | 2、11 | 3 min | 可略读 |
| 14 | `src/client/md.ts`（316） | 零依赖 Markdown → React | 12 | 15 min | 可跳过；除非要改文本渲染 |
| 15 | `src/client/PersistedOutput.tsx`（101） | 尾载 + 向前分页 | 2、10、11 | 6 min | 可选；读「完整输出」功能时再看 |
| 16 | `src/client/OutputView.tsx`（98） | 纯文本窗格 + sticky scroll | 11、12 | 5 min | 可略读 |
| 17 | `src/client/JobDetailModal.tsx`（109） | 详情弹窗 | 2、11、12、13 | 5 min | 可略读 |
| 18 | `src/client/EventView.tsx`（490） | 扁平事件 → 渲染树 | 2、11、12、14、15 | 30 min | **不可跳过**；面板的核心渲染 |
| 19 | `src/client/ClaudeCodeView.tsx`（731） | 面板总编排 | 2、10、11、12、13、16、17、18 | 40 min | **不可跳过**；建议最后读 |
| 20 | `src/client/index.ts`（40） | 客户端入口与槽注册 | 2、10、11、12、19 | 3 min | **不可跳过**；可先扫一眼骨架 |

### 6.2 三种阅读路径

**A. 主线路径（约 4 小时，推荐第一次走）**

`1 tracker → 2 client/types → 3 session-store → 6 remote → 9 index → 10 client/api → 18 EventView → 19 ClaudeCodeView → 20 client/index`

这条路径覆盖「数据模型 → 续接 → RPC → 入口 → 客户端传输 → 渲染 → 编排 → 注册」，足以理解 80% 的行为。`index.ts` 分三段读：

1. `1-181`：`name` / `inject` / `Config`，先看插件对外形态。
2. `1174-1481`：`apply` 与 `execute`，看注册和一次调用的生命周期。
3. `580-871`：`buildQueryOptions` + `runClaude`，看 SDK 如何被驱动。

**B. 全量路径（约 5–6 小时）**

按 6.1 的 1 → 20 顺序读完。适合要改多处代码或写 HTML 的人。

**C. 自顶向下速览（约 1.5–2 小时）**

`20 client/index（只看 apply） → 19 ClaudeCodeView（只看 226-242、260-281、381-441、510-532） → 18 EventView（只看 toNodes） → 10 api（只看 createApi） → 6 remote（只看 listJobs / readEvents） → 9 index（只看 apply / execute） → 1 tracker（只看 ClaudeEvent / createEventBuffer）`

适合先建立调用方向，再回头补细节。注意这不是拓扑序，只是「先看骨架」。

### 6.3 可跳过清单与理由

| 模块 | 什么时候可以跳过 | 什么时候必须回头 |
| --- | --- | --- |
| `delegate-model.ts` | 不关心默认 model / effort 的推导 | 要改「跟随主会话模型」策略时 |
| `live-shell.ts` | 只关心委派主流程；它是独立的 MCP 工具子系统 | 要理解 `mcp__dsh__shell`、长命令实时输出、进程树终止时 |
| `delegation-skill.ts` | 只读 `SkillRegistration` 形状即可，正文是给模型看的规程 | 要写自己的 skill 或改委派模板时 |
| `locales.ts` | 不关心中英文案；读 `t` / `tf` 与 key 命名即可 | 要加 UI 文案时 |
| `styles.ts` | 891 行里绝大部分是 CSS；读 `CSS` 类名表与 `installStyles` 即可 | 要调面板视觉 / 布局时 |
| `md.ts` | 独立的 Markdown 解析器，不参与数据流 | 要改文本渲染、链接安全策略时 |
| `PersistedOutput.tsx` | 不关心「完整输出」文件回读 | 要理解 `readOutputFile` 的分页与 allow-list 时 |
| `OutputView.tsx` | 只是无事件时的纯文本 fallback | 要调 sticky scroll / 文本截断时 |
| `JobDetailModal.tsx` | 109 行，纯展示；知道它读 `JobInfo` + `JobView` 即可 | 要改详情字段时 |
| `client/types.ts` 的 DSH 运行时部分 | 不关心 `JobsClient` / `SlotsService` 的兼容层 | 要在别的 DSH 版本上跑时 |

---

## 7. 每模块关键片段（可内嵌进 HTML）

> 选取标准：**能独立说明一个机制**、且不依赖大段上下文。长函数建议在 HTML 里截取指定行段，而不是整段粘贴。

### 7.1 宿主侧

#### `src/tracker.ts`

- `src/tracker.ts:34-69` — `ClaudeEvent`：宿主与客户端共同遵守的事件联合类型；面板所有渲染分支都从这里分叉。
- `src/tracker.ts:137-205` — `EventBuffer` + `createEventBuffer()`：JSON-lines 环缓冲、绝对偏移读取；解释「面板读事件不会偷走模型游标」。
- `src/tracker.ts:311-409` — `JobTracker`：按 owner session 隔离的作业镜像，含 `allowOutputPath` / `requireOutputPath` 文件白名单。
- `src/tracker.ts:292-308` — `toJobInfo()`：`TrackedJob` → wire 形态，展示「内部字段裁剪 + `undefined` 省略」的序列化约定。

#### `src/remote.ts`

- `src/remote.ts:74-83` — `ClaudeCodeRemote` + `super(ctx, 'claudeCode')`：`TypertRemoteService` 的最小注册形态。
- `src/remote.ts:102-104` — `listJobs`（上一行是 `@Remote`）：最简单的 `@Remote` 方法；`model: job.model ?? null` 的原因（gateway 拒绝 `undefined`）。
- `src/remote.ts:130-140` — `readEvents`：无状态绝对偏移读；多个窗口可以同时读同一个 job。
- `src/remote.ts:151-161` — `readOutputFile`：先 `requireOutputPath` 再读，是安全边界的最佳示例。
- `src/remote.ts:169-172` — `cancel`：走插件自己的 AbortController，避免 `ctx.jobs.kill()` 吞掉模型的完成通知。

#### `src/live-shell.ts`

- `src/live-shell.ts:28` — `LIVE_SHELL_TOOL_ID`：MCP 工具命名规则 `mcp__<server>__<tool>`。
- `src/live-shell.ts:67-87` — `resolveBash`：Windows 上 Git Bash 与 `WindowsApps\bash.exe`（WSL stub）的区分。
- `src/live-shell.ts:109-125` — `takeLines`：按字节切行，避免 GBK 多字节字符在 chunk 边界被切坏。
- `src/live-shell.ts:157-297` — `createLiveShell`：每次委派创建一个 SDK MCP server；`onLine` / `onStart` / `onEnd` 把输出接到事件流。
- `src/live-shell.ts:127-139` — `killTree`：Windows 用 `taskkill /T /F` 杀整棵进程树。

#### `src/session-store.ts`

- `src/session-store.ts:110-121` — `ResumePlan`：续接决策的完整输出形状。
- `src/session-store.ts:234-339` — `plan`：explicit / fresh / busy / continued / unnamed 的全部策略分支；读这一个函数就懂续接。
- `src/session-store.ts:354-383` — `remember`：成功运行后才写回 session id、runs、description / lastTask。
- `src/session-store.ts:172-184` — `save`：temp + rename 原子写，失败静默；理解「便利功能不能拖垮委派」。

#### `src/delegate-model.ts`

- `src/delegate-model.ts:13-20` — `delegateModelFor`：substring 匹配别名与完整 id（fable→opus、opus→sonnet、sonnet→sonnet）。
- `src/delegate-model.ts:23` — `EFFORT_LEVELS`：schema 与 follow 逻辑共用的单一真相。
- `src/delegate-model.ts:32-36` — `delegateEffortFor`：只透传 CLI 认识的 effort 档位。

#### `src/delegation-skill.ts`

- `src/delegation-skill.ts:12-18` — `DELEGATION_SKILL` 头部：`SkillRegistration` 的字段（name / description / whenToUse / source / content）。
- `src/delegation-skill.ts:120-150` — 「本插件操作事实」：skill 内容如何把工具参数、后台作业、面板、shell 通道写进模型可读的规程。
- `src/delegation-skill.ts:18` — `source: 'runtime'`：随插件安装注册，避免用户 skills 目录出现第二份副本。

#### `src/output-file.ts`

- `src/output-file.ts:45-71` — `readOutputWindow`：绝对 / 负偏移、窗口大小 clamp、`prevOffset` / `hasMoreBefore` 分页契约。
- `src/output-file.ts:20` — `MAX_OUTPUT_WINDOW`：单次读取上限，防止一次把 200 MB 拉进内存。
- `src/output-file.ts:23-34` — `OutputWindow`：面板分页所需的全部字段。

#### `src/index.ts`

- `src/index.ts:20-27` — `name` + `inject`：插件身份与激活前置；注释解释为何 optional 服务不能写进 inject。
- `src/index.ts:98-181` — `Config`：schemastery 配置面；每个字段的 description 本身就是插件文档。
- `src/index.ts:1174-1186` — `apply`：全部注册动作（skills、tracker、sessions、remote）在 13 行内。
- `src/index.ts:1329-1473` — `execute`：工具处理函数的完整生命周期（参数 → plan → 后台 / 前台 → settle）。
- `src/index.ts:661-871` — `runClaude`：SDK 消息循环；`onDelta` 文本流与 `onEvent` 结构化流的分工。

### 7.2 客户端侧

#### `src/client/index.ts`

- `src/client/index.ts:19` — `inject = ['slots', 'connection']`：客户端激活只依赖两个服务。
- `src/client/index.ts:25-39` — `apply`：装样式、取可选 jobs、构造 api / view、注册槽。
- `src/client/index.ts:34-39` — `slots.inject` 包裹 `slots.register`：槽未声明时不会抛错，生命周期正确。

#### `src/client/api.ts`

- `src/client/api.ts:162-173` — `createApi` + `call`：`{ args }` 请求包、`{ ok, value }` 响应包、网络 / 协议错误映射。
- `src/client/api.ts:49-110` — `toEvent`：逐字段白名单重建 wire event，未知类型丢弃，保证向前兼容。
- `src/client/api.ts:141-159` — `ClaudeCodeApi`：面板能调用的全部宿主方法。
- `src/client/api.ts:116-138` — `toWorkstream`：注册表行的防御式解析。

#### `src/client/types.ts`

- `src/client/types.ts:161-195` — `ClaudeEvent`：宿主 `tracker.ts` 联合类型的客户端镜像。
- `src/client/types.ts:105-114` — `Context`：第三方 bundle 为什么必须自己声明 DSH 客户端上下文。
- `src/client/types.ts:46-55` — `JobsClient`：0.2 的 jobs 服务面；可选方法体现版本兼容。
- `src/client/types.ts:72-75` — `ViewProps`：`conversation.view` 插槽收到的 props。

#### `src/client/ClaudeCodeView.tsx`

- `src/client/ClaudeCodeView.tsx:226-242` — `createClaudeCodeView` + 三路 row 合并：面板数据源的入口。
- `src/client/ClaudeCodeView.tsx:161-173` — `groupsOf`：按 `claudeSessionId` 把多次调用折叠成一个 tab。
- `src/client/ClaudeCodeView.tsx:381-441` — live read effect：两个绝对游标、所有 run 都拉、只在 live 时 1 秒轮询。
- `src/client/ClaudeCodeView.tsx:510-532` — `renderRun`：有事件走 `EventView`，无事件走 `OutputView`。
- `src/client/ClaudeCodeView.tsx:101-128` — `PanelState` + `panelOf`：tab 切换卸载后仍保留输出 / 选中态。

#### `src/client/EventView.tsx`

- `src/client/EventView.tsx:149-269` — `toNodes`：扁平事件 → text / thinking / tool / console / result 节点。
- `src/client/EventView.tsx:201-236` — console 归并：按 `run` id 把并行命令的输出分块。
- `src/client/EventView.tsx:325-362` — `renderResult`：结果折叠、头部省略提示、完整输出文件入口。
- `src/client/EventView.tsx:271-294` — `EventView`：1000 条 DOM 上限、jobId 变化时重置、贴底滚动。

#### `src/client/JobDetailModal.tsx`

- `src/client/JobDetailModal.tsx:46-58` — 组件 + 实时耗时计算（宿主 `durationMs` 优先）。
- `src/client/JobDetailModal.tsx:48-52` — ESC 关闭：全局 keydown 监听。
- `src/client/JobDetailModal.tsx:35-44` — `Row`：缺值统一显示 `-`。

#### `src/client/OutputView.tsx`

- `src/client/OutputView.tsx:30-43` — `toLines`：50 万字符 / 2000 行双上限，保尾部。
- `src/client/OutputView.tsx:45-60` — 组件 + sticky scroll：`following` 状态与 `useLayoutEffect` 贴底。

#### `src/client/PersistedOutput.tsx`

- `src/client/PersistedOutput.tsx:50-68` — 初始加载：用 `-WINDOW_BYTES` 先取文件尾。
- `src/client/PersistedOutput.tsx:70-85` — `loadEarlier`：精确请求 `[start - WINDOW, start)`，避免接缝重复。
- `src/client/PersistedOutput.tsx:29-33` — `formatBytes`：B / KB / MB 的人类可读大小。

#### `src/client/format.ts`

- `src/client/format.ts:12-20` — `formatDuration`：最多两个相邻单位。
- `src/client/format.ts:23-31` — `formatClock`：今天只显示时间，跨天带日期。
- `src/client/format.ts:34-43` — `statusLabel`：把 5 种 `JobStatus` 映射到 4 个文案键。

#### `src/client/locales.ts`

- `src/client/locales.ts:11-77` — `zh`：key 集合的真相源，也是 HTML 术语表的好素材。
- `src/client/locales.ts:151-161` — `isChinese` + `t`：document.lang → navigator.language → zh 的降级。
- `src/client/locales.ts:164-166` — `tf`：单占位符 `{n}` 替换。

#### `src/client/styles.ts`

- `src/client/styles.ts:13-116` — `CSS` 类名表：所有组件共享的样式 token。
- `src/client/styles.ts:125-131` — `toolToneClass`：FNV-ish hash → 6 种工具色，稳定且无依赖。
- `src/client/styles.ts:883-891` — `installStyles`：按 id 幂等注入 `<style>`。

#### `src/client/md.ts`

- `src/client/md.ts:54-57` — `safeHref`：只放行 `http(s)`，其余降级为纯文本。
- `src/client/md.ts:70-147` — `parseInline`：单次左到右扫描、不回溯；处理代码 / 链接 / 强调。
- `src/client/md.ts:169-292` — `parseBlocks`：块级解析主循环（fence / heading / quote / list / paragraph）。
- `src/client/md.ts:306-316` — `Markdown`：`memo` + `try/catch`，解析失败退回纯文本。

---

## 8. 若 HTML 只放一个最小片段集（12 段）

按「每段解释一个机制」挑选，建议优先内嵌：

1. `src/index.ts:20-27` — `name` + `inject`：DSH 插件的身份与激活前置。
2. `src/index.ts:1174-1186` — `apply`：一个插件的全部注册动作。
3. `src/index.ts:98-181` — `Config`（可只截取 3-4 个字段）：配置如何声明。
4. `src/tracker.ts:34-69` — `ClaudeEvent`：宿主 / 客户端共同的事件契约。
5. `src/tracker.ts:147-205` — `createEventBuffer`：绝对偏移环缓冲。
6. `src/session-store.ts:234-339`（可只截 243-274 + 299-338） — `plan`：续接策略。
7. `src/remote.ts:74-83` + `102-104` — `@Remote` 服务与方法。
8. `src/client/index.ts:25-39` — 客户端槽注册。
9. `src/client/api.ts:162-173` — RPC 信封。
10. `src/client/types.ts:161-195` — 客户端类型镜像。
11. `src/client/ClaudeCodeView.tsx:239-242` + `381-441` — 三路数据源 + 双游标轮询。
12. `src/client/EventView.tsx:149-269`（可只截开头与 tool_result 分支） — 事件折叠。

如果预算允许，再加两段：

13. `src/index.ts:1329-1473`（截取 1365-1400 与 1437-1472） — `execute` 的前台 / 后台分支。
14. `src/live-shell.ts:157-200` — SDK MCP server 的创建方式（`mcp__dsh__shell` 的来源）。

---

## 9. 写 HTML 时值得强调的实现约束

这些是读代码时最容易「看漏但很关键」的点，适合做成 HTML 里的「为什么这样做」提示框：

1. **`inject` 只放必需服务**：宿主只有 `tools`、`skills`（`src/index.ts:27`）；`sessionProjections` 与 `jobs` 都用 `ctx.get()` 懒查（`src/index.ts:201, 1385`）。注释明确说 optional-inject 对象形式会死锁（`src/index.ts:21-26`）。客户端同理：只 inject `slots` + `connection`，`jobs` 懒查（`src/client/index.ts:19, 32`）。
2. **两条流不要合并**：`onDelta` 是给模型的文本流，`onEvent` 是给面板的结构化流；partial delta 只进前者，完整块才进后者（`src/index.ts:651-659, 722-836`）。
3. **`JobTracker` 是镜像，不是 `ctx.jobs` 的替代**：`ctx.jobs.read()` 的游标与模型的 `job_output` 共享，面板直接读会偷走模型的字节，所以插件自己维护绝对偏移缓冲（`src/tracker.ts:1-12`）。
4. **`@Remote` 的参数名就是 wire 字段名**：不能解构、不能默认值、不能 rest，且不能和 typert 的 `session` / `agent` 查询参数重名（`src/remote.ts:11-15`）。
5. **`JobInfoWire.model` 必须是 `null` 而不是省略**：api-gateway 拒绝编码 `undefined`（`src/remote.ts:22-29, 103`）。
6. **客户端 bundle 只有 `react`**：不能引 Markdown / 弹窗 / 日期库；所以 `md.ts` 自己写解析器，`JobDetailModal` 自己写 overlay（`src/client/md.ts:4-8`、`src/client/JobDetailModal.tsx:10-12`）。
7. **客户端不 import 宿主类型**：`client/types.ts` 是手写镜像，新增 event 类型要同步 `api.ts` 的 `toEvent`（`src/client/types.ts:1-8, 161-195`、`src/client/api.ts:49-110`）。
8. **`format.ts` 是为了断环**：视图渲染弹窗，弹窗不能反向 import 视图（`src/client/format.ts:1-7`）。
9. **面板状态放在模块级缓存**：harness 切换 tab 会卸载整个 view，所以每个 session 的 `outputs/events/selected/rows` 存在 `panels` Map 里，最多 8 个 session（`src/client/ClaudeCodeView.tsx:18-20, 100-128`）。
10. **后台 `run()` 是同步执行的**：`jobs.start()` 返回时，`handles` 已经被 `run` 闭包赋值，所以 `tracker.register` 能紧接着拿到 `read` / `events` / `cancelFromUi`（`src/index.ts:985-987, 1150-1164`）。

---

## 10. 核验说明

- 本文所有 `文件:行号` 均来自对上述 20 个文件的完整 `Read`；导出符号另用 `Grep` 交叉核对过（`export` 行）。
- 行数统计（按 `Read` 行号）：

| 宿主 | 行数 | 客户端 | 行数 |
| --- | ---: | --- | ---: |
| `src/index.ts` | 1481 | `src/client/ClaudeCodeView.tsx` | 731 |
| `src/tracker.ts` | 409 | `src/client/EventView.tsx` | 490 |
| `src/remote.ts` | 173 | `src/client/JobDetailModal.tsx` | 109 |
| `src/live-shell.ts` | 303 | `src/client/OutputView.tsx` | 98 |
| `src/session-store.ts` | 390 | `src/client/PersistedOutput.tsx` | 101 |
| `src/delegate-model.ts` | 36 | `src/client/api.ts` | 228 |
| `src/delegation-skill.ts` | 201 | `src/client/format.ts` | 43 |
| `src/output-file.ts` | 71 | `src/client/index.ts` | 40 |
| | | `src/client/locales.ts` | 166 |
| | | `src/client/md.ts` | 316 |
| | | `src/client/styles.ts` | 891 |
| | | `src/client/types.ts` | 221 |
| **宿主合计** | **3064** | **客户端合计** | **3434** |

- 全仓库 `src/` 合计约 **6498 行**。
- 未修改源码或票文件；未执行联网命令；未进行 git 操作。
