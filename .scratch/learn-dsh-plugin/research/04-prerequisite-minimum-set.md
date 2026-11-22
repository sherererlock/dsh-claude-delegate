# 04 — 前置知识的最小够用集

> 范围：只回答「读懂本仓库 20 个源码文件（8 个后端 + 12 个客户端）+ 写一个简单 DSH 插件」所需的前置知识，不写成完整课程。
> 版本基准：本仓库 `v0.8.1`（`package.json:3`）。
> 框架事实来源：本机 DSH 0.2.2-rc.5 文档 `E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\docs\`（中文版）；TypeScript / Node / React 事实来源为各自的官方文档（见 §7）。
> 所有 `文件:行号` 均来自当前工作树；未联网、未修改源码与票文件。

---

## 0. 结论先行：学习顺序与插入点

### 0.1 六个阶段（按依赖关系，不按知识点分类）

| 阶段 | 学什么 | 为什么排在这里 | 解锁的本仓库文件 |
|---|---|---|---|
| **S1 TypeScript 够用集** | 标注、`interface`/`type`、联合与收窄、泛型、`as`/`as const`、声明文件、模块解析 | 每个源文件都是 TS；不会读类型标注，后面所有阶段都会卡住 | 全部；建议从 `src/delegate-model.ts` 开始 |
| **S2 ESM 与 Node** | `"type": "module"`、`import`/`export`、`node:fs`/`node:path`、子进程、`process`、事件循环 | 后端半边全部是 Node；先能读懂「文件、进程、异步」 | `delegate-model.ts` → `tracker.ts` → `session-store.ts` → `output-file.ts` → `live-shell.ts` → `delegation-skill.ts` |
| **S3 Cordis 与依赖注入** | 插件形态、`inject`、`ctx.get()`、Service、fiber/生命周期、`Config` schema | 后端半边的骨架；不懂它，`index.ts` 只是一串注册调用 | `remote.ts` → `index.ts` |
| **S4 React 客户端** | 函数组件、JSX、`useState`/`useEffect`/`useMemo`/`useRef`、列表与 key | 客户端半边是 React；没有它，面板代码读不动 | `client/types.ts` → `client/api.ts` → `client/locales.ts` → `client/format.ts` → `client/*.tsx` → `client/md.ts` → `client/styles.ts` |
| **S5 构建与打包** | `tsc` 两个 project、esbuild bundle、`tsconfig` 差异、`exports`/`dsh` 清单 | 最后一个阶段；能读懂「源码怎么变成 DSH 能加载的两个半边」 | `tsconfig*.json`、`scripts/build-client.mjs`、`scripts/assert-artifacts.mjs`、`package.json` |
| **S6 选读** | Cordis 事件、React Context、`satisfies`、交叉类型等 | 本仓库**没有实际使用**，知道概念即可，不要先学 | 见 §6 可跳过清单 |

### 0.2 每个阶段的插入建议

- **S1 插在学习地图最前**，用 `delegate-model.ts`（36 行）当第一个阅读对象：它没有外部依赖，只有函数、联合、`as const`。
- **S2 插在进入后端模块之前**，用 `session-store.ts` 的「读写 JSON 文件」和 `live-shell.ts` 的「spawn bash」当两个落地练习。
- **S3 插在读 `src/index.ts` 之前**，否则 `inject`、`ctx.get()`、`ctx.tools.register()` 会被当成魔法。
- **S4 插在进入 `src/client/` 之前**；先读 `OutputView.tsx`（98 行）建立 hooks 手感，再读 `ClaudeCodeView.tsx`（731 行）。
- **S5 放在最后**，因为只有在改过至少一个源文件后，「两个 tsconfig / 两个产物」才有意义。
- **S6 全程不主动学**；遇到时回 §6 查「为什么可以跳过」。

### 0.3 一句话结论

> 最该先学的三项是：**TS 的联合类型 + 类型收窄**、**ESM/Node 的模块与异步**、**Cordis 的 `inject` + `ctx.get()` 服务模型**。这三项覆盖了本仓库大多数「看不懂」的地方；React 只需要函数组件 + 四个常用 hook；构建只需要看懂两个 tsconfig 的分工。

---

## 1. Stage 1 — TypeScript 最小够用集

> 学习目标（整段）：能逐行读懂本仓库的类型标注与类型收窄；能自己写出 `interface`、联合类型、一个泛型函数、一个类型守卫。**不要求**会写类型体操。

### 1.1 `interface` / `type` / 类型标注

**本仓库落点**

| 用法 | 位置 | 说明 |
|---|---|---|
| `interface` 描述对象形状 | `src/index.ts:57-66`（`SubagentConfig`）、`src/index.ts:68-96`（`Config`）、`src/tracker.ts:219-246`（`TrackedJob`）、`src/client/types.ts:105-114`（客户端 `Context`） | 可扩展、可合并；本仓库用它描述「有固定字段的对象」 |
| `type` 别名 | `src/tracker.ts:15`（`TrackedStatus`）、`src/tracker.ts:34-69`（`ClaudeEvent`）、`src/client/types.ts:36`（泛型函数类型 `UseSessions`）、`src/client/locales.ts:149`（`keyof typeof zh`） | 适合联合、函数类型、从值反推类型 |
| 显式标注 | `src/index.ts:98`（`const Config: z<Config>`）、`src/delegation-skill.ts:12`（`const DELEGATION_SKILL: SkillRegistration`） | 标注会「拓宽」字面量，见 §1.6 `satisfies` |

**最小例子**

```ts
interface TrackedJob { jobId: string; status: TrackedStatus }
type TrackedStatus = 'running' | 'completed' | 'failed' | 'killed'
```

**学到这个程度就够**：看到 `interface X { ... }` 知道是对象契约；看到 `type X = ...` 知道是别名；知道二者在「能否重复声明 / 能否表示联合」上的区别，不必背全部差异。

**权威入口**

- TS Handbook《Everyday Types》→ Interfaces / Type Aliases：`https://www.typescriptlang.org/docs/handbook/2/everyday-types.html`
- TS Handbook《Object Types》：`https://www.typescriptlang.org/docs/handbook/2/objects.html`

---

### 1.2 联合类型与可辨识联合（本仓库最重要的一项）

**本仓库落点**

| 用法 | 位置 | 说明 |
|---|---|---|
| 字符串字面量联合 | `src/tracker.ts:15`（`TrackedStatus`）、`src/index.ts:82`（`'adaptive' \| 'disabled'`）、`src/session-store.ts:117-118`（`mode` / `reason`） | 有限状态机式取值 |
| 可辨识联合（discriminated union） | `src/tracker.ts:34-69`（`ClaudeEvent`，7 个变体，`type` 是判别字段） | 面板事件流的类型骨架 |
| 可辨识联合（客户端镜像） | `src/client/types.ts:161-195` | 与 host 端同构 |
| 可辨识联合（渲染节点） | `src/client/EventView.tsx:54-73`（`Node`） | `kind` 判别字段 |
| 结果信封 | `src/client/types.ts:78-80`（`RpcResult<T> = { ok: true, value: T } \| { ok: false, error: ... }`） | RPC 返回值的二选一 |

**最小例子**

```ts
type ClaudeEvent =
  | { type: 'text', text: string }
  | { type: 'thinking', thinking: string, signature?: string }
  | { type: 'tool_use', id?: string, name: string, input: unknown }

function render(event: ClaudeEvent) {
  if (event.type === 'text') return event.text        // 这里 TS 知道有 text
  if (event.type === 'thinking') return event.thinking // 这里 TS 知道有 thinking
  return event.name                                    // 这里只剩 tool_use
}
```

仓库中的真实收窄：`src/tracker.ts:109-126` 的 `switch (event.type)`；`src/client/EventView.tsx:370-480` 的 `node.kind` 分支。

**学到这个程度就够**：会写「一个字段区分多个对象形状」的联合，并会在 `if`/`switch` 里让 TS 自动收窄。这是读 `ClaudeEvent`、`RpcResult`、`JobOutcome` 的钥匙。

**权威入口**

- TS Handbook《Everyday Types》→ Unions：`https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types`
- TS Handbook《Narrowing》→ Discriminated unions：`https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions`

---

### 1.3 交叉类型（`A & B`）— 本仓库**没有**直接使用

**结论**：对 `src/` 全量搜索 ` & ` 无类型交叉用法。等价职责由两种写法承担：

| 写法 | 位置 | 效果 |
|---|---|---|
| `interface X extends Y` | `src/remote.ts:68`（`WorkstreamWire extends WorkstreamInfo`） | 继承字段后再加 `summary` |
| `interface X extends Omit<Y, 'k'>` | `src/remote.ts:27`（`JobInfoWire extends Omit<JobInfo, 'model'>`） | 先删字段再改写 |

**最小例子（概念示例，非仓库代码）**

```ts
type NamedJob = TrackedJob & { name: string }
// 等价于 interface NamedJob extends TrackedJob { name: string }
```

**学到这个程度就够**：看到 `A & B` 知道是「同时具备两边字段」；本仓库只需能认出 `extends` / `Omit` 是同一目的的不同写法。

**权威入口**

- TS Handbook《Object Types》→ Extending types：`https://www.typescriptlang.org/docs/handbook/2/objects.html#extending-types`
- TS Handbook《Creating Types from Types》→ Intersection：`https://www.typescriptlang.org/docs/handbook/2/types-from-types.html`

---

### 1.4 `unknown`、类型守卫与收窄

**本仓库落点**

| 用法 | 位置 | 说明 |
|---|---|---|
| 自定义类型守卫 | `src/client/api.ts:29-31`（`value is RpcResult<unknown>`） | 网络返回值先当 `unknown`，再验证 |
| 自定义类型守卫（数组过滤） | `src/index.ts:632`（`(part): part is string =>`） | `filter` 后类型变成 `string[]` |
| `unknown` 入参 + 逐个字段验证 | `src/client/api.ts:33-110`（`toEvent` 的整段 `switch`） | 不信任 gateway 的 payload |
| `typeof` / `instanceof` 收窄 | `src/index.ts:414-422`（`errorText`）、`src/live-shell.ts:213`（`error instanceof Error`） | 运行时兜底 |
| `any` 的集中使用（反面教材） | `src/index.ts:726, 760, 763, 781, 808, 817` | SDK 动态消息形状，仓库选择局部 `as any` |

**最小例子**

```ts
function isResult(value: unknown): value is RpcResult<unknown> {
  return typeof value === 'object' && value !== null && 'ok' in value
}
```

**学到这个程度就够**：知道 `unknown` 是「安全版 any」；会写 `value is T` 守卫；知道 `if (typeof x === 'string')` 之后 TS 会自动收窄。**不要**学类型谓词的高级重载。

**权威入口**

- TS Handbook《Narrowing》（含 `in`、`typeof`、`instanceof`、type predicates）：`https://www.typescriptlang.org/docs/handbook/2/narrowing.html`
- TS Handbook《Everyday Types》→ `unknown`：`https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#unknown`

---

### 1.5 泛型与工具类型

**本仓库落点**

| 用法 | 位置 | 说明 |
|---|---|---|
| 容器泛型 | `src/tracker.ts:312`（`Map<string, TrackedJob>`）、`src/tracker.ts:322`（`Map<string, Set<string>>`） | 最常见的泛型形态 |
| 泛型函数 | `src/client/api.ts:163`（`async function call<T>(...): Promise<T>`） | 调用方决定返回类型 |
| 泛型类型别名 | `src/client/types.ts:36`（`export type UseSessions = <T>(select: (state: ...) => T) => T`） | 框架注入的 hook 类型 |
| `Record<K, V>` | `src/index.ts:589`（`Record<string, string>`）、`src/index.ts:424`（`Record<string, AgentDefinition>`）、`src/client/types.ts:59`（`Readonly<Record<string, readonly JobView[]>>`） | 字典 |
| `Readonly<T>` / `readonly T[]` | `src/client/types.ts:59`、`src/client/ClaudeCodeView.tsx:234`（`useState<readonly JobView[]>`） | 不可变视图 |
| `Omit<T, K>` | `src/remote.ts:27` | 删字段 |
| `Exclude<T, U>` | `src/tracker.ts:209`（`Exclude<TrackedStatus, 'running'>`） | 排除联合成员 |
| `Extract<T, U>` | `src/client/EventView.tsx:140`（`Extract<ClaudeEvent, { type: 'result' }>`） | 取联合的一个变体 |
| `ReturnType<typeof fn>` | `src/index.ts:1009`、`src/client/ClaudeCodeView.tsx:385` | 拿定时器句柄类型 |
| `keyof typeof` | `src/client/locales.ts:149`、`src/client/locales.ts:80` | 从字典对象反推 key 联合 |

**最小例子**

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0]
}

type Status = 'running' | 'completed' | 'failed'
type Settled = Exclude<Status, 'running'>   // 'completed' | 'failed'
```

**学到这个程度就够**：能读懂 `<T>` 是「调用时再定的类型参数」；认识 `Record`/`Readonly`/`Omit`/`Exclude`/`Extract`/`ReturnType` 六个工具类型；**不要求**会写条件类型或映射类型。

**权威入口**

- TS Handbook《Generics》：`https://www.typescriptlang.org/docs/handbook/2/generics.html`
- TS Handbook《Utility Types》：`https://www.typescriptlang.org/docs/handbook/utility-types.html`

---

### 1.6 `as`、`as const` 与 `satisfies`

#### `as`（类型断言）

**本仓库落点**

| 用法 | 位置 | 为什么需要 |
|---|---|---|
| 把外部数据断言成已知形状 | `src/tracker.ts:194`（`JSON.parse(line) as ClaudeEvent`）、`src/session-store.ts:155`（`JSON.parse(...) as { sessions?: ... }`） | JSON 解析结果天然是 `any` |
| 把宽类型收窄成 API 要求的联合 | `src/index.ts:610`（`req.permissionMode as Options['permissionMode']`）、`src/index.ts:615`（`as Options['effort']`） | 配置存的是 `string`，SDK 要字面量联合 |
| 绕过不兼容的上下文类型 | `src/index.ts:201-205`（`ctx as unknown as { get?: ... }`） | `Context` 上没有声明 `get` 的某些形态，先经 `unknown` 中转 |
| 动态 SDK 消息 | `src/index.ts:726`（`msg.message.content as any[]`） | 消息形状随 SDK 版本变化 |
| 网络响应字段 | `src/client/api.ts:51`（`raw as Record<string, unknown>`）、`src/client/api.ts:207`（`as ReadEventsResult['status']`） | 未校验的 wire 数据 |

**最小例子**

```ts
const parsed = JSON.parse(line) as ClaudeEvent // 断言：责任在你，TS 不再检查
```

**学到这里就够**：知道 `as` 是「我保证」，不是运行时转换；看到 `as unknown as X` 知道是「两次断言绕过类型不兼容」；**优先用类型守卫代替 `as`**。

#### `as const`

**本仓库落点**

- `src/delegate-model.ts:23`（`EFFORT_LEVELS = [...] as const`）
- `src/index.ts:54-55`（`PERMISSION_MODES` / `THINKING_MODES`）
- `src/client/md.ts:36-37`（`HEADING_TAGS` / `HEADING_CLASSES`）
- `src/client/styles.ts:116`（`CSS` 对象整体 `as const`）
- `src/index.ts:1071, 1087, 1093, 1392`（返回值里的 `status: 'completed' as const`）

**最小例子**

```ts
const EFFORT_LEVELS = ['low', 'medium', 'high'] as const
// 类型是 readonly ['low', 'medium', 'high']，不是 string[]
```

**学到这里就够**：知道它把数组/对象变「只读 + 字面量」，常配合联合类型使用。

#### `satisfies` — 本仓库**没有使用**

全量搜索 `satisfies` 无结果。最接近的两处是显式标注：

- `src/index.ts:98`：`export const Config: z<Config> = z.object({...})`
- `src/delegation-skill.ts:12`：`export const DELEGATION_SKILL: SkillRegistration = {...}`

**为什么值得知道**：显式标注会把字面量「拓宽」；`satisfies` 既检查形状又保留字面量类型。

```ts
// 仓库现状：source 被拓宽为 SkillRegistration['source']
const DELEGATION_SKILL: SkillRegistration = { name: 'x', source: 'runtime', content: '' }

// satisfies 版本：仍然检查形状，但 source 保留 'runtime' 字面量
const skill = { name: 'x', source: 'runtime', content: '' } satisfies SkillRegistration
```

**学到这个程度就够**：认识语法、知道它解决「既要检查又要保留字面量」的问题即可；读本仓库不需要它。

**权威入口**

- Type assertions：`https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions`
- `as const`：`https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types`
- `satisfies`（TS 4.9 release notes）：`https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator`

---

### 1.7 声明文件（`.d.ts`）

**本仓库落点**

| 事实 | 位置 |
|---|---|
| Node 半边生成声明 | `tsconfig.json:10-11`（`declaration: true`、`declarationDir: "lib/types"`） |
| 客户端半边只生成声明 | `tsconfig.client.json:14-16`（`declaration: true`、`emitDeclarationOnly: true`、`declarationDir: "lib/types/client"`） |
| 包入口指向声明 | `package.json:7`（`"types": "lib/types/index.d.ts"`）、`package.json:8-18`（`exports` 的 `types` 条件） |
| 手写的「声明镜像」 | `src/client/types.ts:1-8` 的注释说明：第三方插件在 harness monorepo 之外，上游的 `declare module` 增强到不了这里，所以把用到的运行时形状**重述**一遍；`src/client/types.ts:105-114` 是重述后的 `Context` |

**最小例子**

```ts
// lib/types/index.d.ts（tsc 生成，不是手写）
export declare function apply(ctx: Context, config: Config): void
```

**学到这个程度就够**：知道 `.d.ts` 只描述类型、不产生运行时代码；知道本仓库的 `.d.ts` 是 `tsc` 生成的；知道 `package.json` 的 `types`/`exports` 决定消费者能否看到类型。**不要求**会手写 `declare module`。

**权威入口**

- TS Handbook《Declaration Files》：`https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html`
- `declaration` / `emitDeclarationOnly`：`https://www.typescriptlang.org/tsconfig#declaration`

---

### 1.8 模块解析（NodeNext vs Bundler）

**本仓库落点**

| 事实 | 位置 |
|---|---|
| Node 半边用 `NodeNext` | `tsconfig.json:4-5`（`module` / `moduleResolution` 都是 `NodeNext`） |
| 客户端用 `ESNext` + `Bundler` | `tsconfig.client.json:4-5` |
| 相对导入必须写 `.js` 扩展名 | `src/index.ts:9-16`（源文件是 `.ts`，导入写 `./tracker.js`）；`src/remote.ts:18-20`；`src/client/index.ts:12-15`（`./api.js`、`./ClaudeCodeView.js`） |
| 包入口/条件导出 | `package.json:8-18`（`.` 的 `types`/`default`，`./client` 的 `types`/`default`） |
| 裸包名解析 | `src/index.ts:1-8`、`src/remote.ts:16-17`、`src/client/api.ts:10-19` |
| **没有 `paths` 别名** | 两个 tsconfig 均无 `paths`；客户端靠 esbuild 打包（§5） |

**最小例子**

```ts
// 源文件 src/tracker.ts
import { JobTracker } from './tracker.js'   // NodeNext：写编译后文件的后缀
```

**学到这个程度就够**：知道 `NodeNext` 下「相对导入写 `.js`」不是笔误；知道 `Bundler` 模式交给打包器解析；知道 `package.json` 的 `exports` 决定包的入口。**不要求**学 `paths`、`baseUrl`、条件导出的全部组合。

**权威入口**

- TS 模块解析参考：`https://www.typescriptlang.org/docs/handbook/modules/reference.html`
- `moduleResolution`：`https://www.typescriptlang.org/tsconfig#moduleResolution`
- Node `package.json#exports`：`https://nodejs.org/api/packages.html#exports`

---

## 2. Stage 2 — ESM 与 Node 最小够用集

> 学习目标（整段）：能写一个 ESM 模块；能用 `node:fs` 原子写 JSON；能用 `node:child_process` 启动 bash 并按行收集输出；能解释 `setTimeout` 与 `await` 在同一条事件循环上的关系。

### 2.1 `"type": "module"` 与 `import`/`export`

**本仓库落点**

| 事实 | 位置 |
|---|---|
| 整包是 ESM | `package.json:5`（`"type": "module"`） |
| 具名导出（Cordis 插件契约） | `src/index.ts:20`（`export const name`）、`src/index.ts:27`（`export const inject`）、`src/index.ts:98`（`export const Config`）、`src/index.ts:1174`（`export function apply`） |
| 客户端半边同样的契约 | `src/client/index.ts:19`（`export const inject`）、`src/client/index.ts:25`（`export function apply`） |
| 混合值导入 + 类型导入 | `src/live-shell.ts:19`（`import { spawn, spawnSync, type ChildProcess } from 'node:child_process'`） |
| 纯类型导入（编译后被擦除） | `src/index.ts:4,6`、`src/remote.ts:17-20`、`src/client/api.ts:10-19` 等 12 处 `import type` |
| 再导出 | `src/index.ts:18`（`export { delegateModelFor, delegateEffortFor }`） |
| 脚本是 ESM | `scripts/build-client.mjs:16-19`（`.mjs` 永远是 ESM）、`scripts/build-client.mjs:52`（顶层 `await`） |

**最小例子**

```ts
// src/delegate-model.ts
export function delegateModelFor(mainModel: string | undefined): string | undefined { ... }

// src/index.ts
import { delegateModelFor } from './delegate-model.js'
```

**学到这个程度就够**：会写具名导出/导入；知道 `import type` 不产生运行时代码；知道 ESM 没有 `__dirname`/`require`（脚本改用 `fileURLToPath(import.meta.url)`，见 `scripts/build-client.mjs:21`）。

**权威入口**

- MDN《JavaScript 模块》：`https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules`
- Node ESM：`https://nodejs.org/api/esm.html`

---

### 2.2 `node:fs` / `node:path` / `node:os`

**本仓库落点**

| API | 位置 | 用途 |
|---|---|---|
| `existsSync`, `statSync` | `src/index.ts:7`，用于 `src/index.ts:328, 335` | 预检 cwd / claude 可执行文件 |
| `mkdirSync`, `readFileSync`, `writeFileSync`, `renameSync` | `src/session-store.ts:29`，用于 `src/session-store.ts:176-180` | 原子写 JSON：先写 `.tmp`，再 `rename` |
| `open`, `stat`（promises） | `src/output-file.ts:17`，用于 `src/output-file.ts:46-70` | 按字节窗口读大文件 |
| `homedir`（`node:os`） | `src/session-store.ts:30`，用于 `src/session-store.ts:71-76` | `$DSH_HOME` 缺省时落到 `~/.dsh` |
| `dirname`, `join`, `resolve`（`node:path`） | `src/session-store.ts:31`，用于 `src/session-store.ts:74-75, 83, 176` | 路径拼接与规范化 |
| `dirname`, `join` | `src/live-shell.ts:21`，用于 `src/live-shell.ts:76` | 从 PATH 推导 Git Bash 路径 |
| `fileURLToPath`（`node:url`） | `scripts/build-client.mjs:19-21`、`scripts/assert-artifacts.mjs:10-12` | ESM 下拿脚本所在目录 |

**最小例子**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

mkdirSync(dirname(file), { recursive: true })
writeFileSync(`${file}.tmp`, JSON.stringify(data))
renameSync(`${file}.tmp`, file)   // 原子替换，崩溃不会留下半个文件
```

**学到这个程度就够**：会分同步/异步两套 API；知道 `join` 不解析、`resolve` 解析成绝对路径；知道本仓库为什么先写 `.tmp` 再 `rename`（`src/session-store.ts:179-180` 的注释）。

**权威入口**

- Node `fs`：`https://nodejs.org/api/fs.html`
- Node `path`：`https://nodejs.org/api/path.html`
- Node `os`：`https://nodejs.org/api/os.html`

---

### 2.3 子进程（`node:child_process`）

**本仓库落点**

| API | 位置 | 用途 |
|---|---|---|
| `spawnSync` 探测可执行文件 | `src/index.ts:8`，调用在 `src/index.ts:309-317` | Windows 用 `where`、POSIX 用 `which` |
| `spawnSync` 杀进程树 | `src/live-shell.ts:131`（`taskkill /pid ... /T /F`） | Windows 下 `child.kill()` 只杀 bash，不杀它启动的命令 |
| `spawn` 启动 `bash -lc` | `src/live-shell.ts:205-210` | 每次命令一个全新进程 |
| `child.stdout/stderr.on('data')` | `src/live-shell.ts:271-276` | 按块收字节，再自行拆行 |
| `child.on('error'/'close')` | `src/live-shell.ts:277-283` | 失败与退出码 |
| 进程集合与 `killAll` | `src/live-shell.ts:158, 218, 291-296` | 委派取消时杀掉所有子进程 |
| `ChildProcess` 类型 | `src/live-shell.ts:19, 127, 203` | 句柄类型 |

**最小例子**

```ts
import { spawn } from 'node:child_process'

const child = spawn('bash', ['-lc', 'echo hi'], { stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', (chunk: Buffer) => process.stdout.write(chunk))
child.on('close', (code) => console.log('exit', code))
```

**学到这个程度就够**：会区分 `spawn`（流式）与 `spawnSync`（阻塞）；知道 `data` 回调给的是任意长度的字节块，不是整行；知道取消一个 shell 要杀整棵进程树。**不要求**学 `fork`/`execFile`/`cluster`。

**权威入口**

- Node `child_process`：`https://nodejs.org/api/child_process.html`

---

### 2.4 `process`

**本仓库落点**

| 属性/方法 | 位置 | 用途 |
|---|---|---|
| `process.platform` | `src/index.ts:309`、`src/live-shell.ts:72, 129`、`src/session-store.ts:84` | Windows / POSIX 分支 |
| `process.env` | `src/index.ts:590-598`、`src/index.ts:692`、`src/live-shell.ts:70-79, 207`、`src/session-store.ts:72-73` | 复制环境变量、代理、`DSH_HOME`、`CLAUDE_CODE_GIT_BASH_PATH` |
| `process.cwd()` | `src/index.ts:1333`（注释在 `src/index.ts:222`） | cwd 的最后兜底 |
| `process.kill(-pid, 'SIGKILL')` | `src/live-shell.ts:135` | POSIX 杀进程组 |
| `timer.unref?.()` | `src/index.ts:1111, 1128, 1131` | 定时器不阻止进程退出 |

**最小例子**

```ts
const env: Record<string, string> = {}
for (const [name, value] of Object.entries(process.env)) {
  if (typeof value === 'string') env[name] = value
}
```

这段就是 `src/index.ts:589-592`：`process.env` 的值可能是 `undefined`，复制时要过滤。

**学到这个程度就够**：知道 `process.env` 是字符串字典、`process.platform` 用来分支、`cwd` 不等于脚本目录。

**权威入口**

- Node `process`：`https://nodejs.org/api/process.html`

---

### 2.5 事件循环、Promise、`AbortSignal`

**本仓库落点**

| 概念 | 位置 | 说明 |
|---|---|---|
| `async`/`await` + `for await` 消费异步流 | `src/index.ts:661-666`、`src/index.ts:722` | 逐条消费 Agent SDK 消息 |
| 定时器与清理 | `src/index.ts:1107-1111`（硬超时）、`src/index.ts:1119-1131`（周期告警）、`src/live-shell.ts:238-241`（单命令超时） | 超时不是「轮询」，是定时器触发 `abort` |
| `AbortController` / `AbortSignal` | `src/index.ts:714`（abort 时杀子进程）、`src/index.ts:1001, 1043, 1399-1401` | 一条取消信号贯穿 SDK 与 shell |
| Promise 并发与顺序 | `src/index.ts:1165-1168`、`src/client/ClaudeCodeView.tsx:392-431` | 两个独立流各自拉取 |
| React 侧 `setInterval` + cleanup | `src/client/ClaudeCodeView.tsx:260-281, 381-441, 466-471` | 只在需要时轮询，卸载时清掉 |
| `void promise`（显式忽略返回值） | `src/client/ClaudeCodeView.tsx:534, 540, 696, 707` | 避免未处理 Promise 告警 |

**最小例子**

```ts
const abort = new AbortController()
const timer = setTimeout(() => abort.abort('timed out'), 60_000)
try {
  const result = await work(abort.signal)
} finally {
  clearTimeout(timer)
}
```

**学到这个程度就够**：知道 `await` 不阻塞事件循环；知道「定时器 + AbortController」是取消长任务的标准组合；知道 `useEffect` 返回的函数在卸载/重跑前执行，用来 `clearInterval`。**不要求**学 `process.nextTick`、微任务队列的精确顺序。

**权威入口**

- Node《The Node.js Event Loop》：`https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick`
- MDN《事件循环》：`https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Event_loop`
- MDN `AbortController`：`https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController`

---

### 2.6 两个容易忽略的 ESM 事实

1. **`import.meta.url` 是 ESM 里唯一可靠的「当前文件」来源**。脚本用 `fileURLToPath(import.meta.url)` 再 `dirname`（`scripts/build-client.mjs:19-21`），因为 ESM 没有 `__dirname`。
2. **`node -e` 默认按 CJS 执行**。`package.json:59` 的 `clean` 脚本用 `require('node:fs')` 仍能工作，不要误以为整包 ESM 就不能出现 `require`。这是 `--eval` 的输入类型规则，不是文件模块规则。

---

## 3. Stage 3 — 依赖注入与 Cordis

> 学习目标（整段）：能写一个函数插件（`name` + `inject` + `apply`）；能解释 `inject` 与 `ctx.get()` 的区别；知道 fiber 的 PENDING/DISPOSED 意味着什么；知道本仓库为什么在 `ctx.get()` 前面加 `as unknown as`。

### 3.1 插件的三种形态与本仓库的选择

**本仓库落点**

| 形态 | 位置 | 说明 |
|---|---|---|
| 函数插件（后端） | `src/index.ts:20`（`name`）、`src/index.ts:27`（`inject`）、`src/index.ts:98`（`Config`）、`src/index.ts:1174`（`apply(ctx, config)`） | 最常见的工具插件 |
| 函数插件（客户端） | `src/client/index.ts:19, 25` | 客户端 bundle 的 `apply` 只接收 `ctx` |
| Service 子类 | `src/remote.ts:74-83`（`class ClaudeCodeRemote extends TypertRemoteService`，构造函数 `super(ctx, 'claudeCode')`） | 向 `ctx.claudeCode` 注册一个服务 |
| 配置 schema | `src/index.ts:98-181` | Schemastery 的 `z.object(...)`；既做运行时校验，又给 TS 类型 |

**最小例子**

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 这里可以确定 ctx.tools 已就绪
}
```

Cordis 接受三种插件形态（函数、对象、`Service` 子类），见本地文档 `cordis-tutorial/01-first-plugin.zh.md`。「其他两种插件形态」一节。

**学到这个程度就够**：能照着写一个函数插件；知道 `export` 的名字（`name`/`inject`/`apply`/`Config`）是 Cordis 的模块契约，不是随便起的。

**权威入口（本地优先）**

- `E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\docs\cordis-primer.zh.md`（五个核心概念）
- `...\docs\cordis-tutorial\01-first-plugin.zh.md`

---

### 3.2 服务与 `ctx.get()`

**本仓库落点**

| 用法 | 位置 | 说明 |
|---|---|---|
| 读取可选服务（调用时） | `src/index.ts:1385`（`const jobs = ctx.get('jobs')`） | 后台作业服务不在时给出明确错误 |
| 读取可选服务（投影） | `src/index.ts:198-205`（`(ctx as unknown as { get?: ... }).get?.('sessionProjections')`） | 服务缺失时返回 `undefined`，不阻塞插件 |
| 客户端读取可选服务 | `src/client/index.ts:32`（`const jobs = ctx.get?.<JobsClient>('jobs')`） | 兼容 0.1.x 客户端 |
| 服务注册 | `src/remote.ts:74-83` | `super(ctx, 'claudeCode')` 即注册 |
| 服务方法暴露 | `src/remote.ts:92, 101, 110, 129, 150, 168`（`@Remote`） | api-gateway 反射成 `claudeCode/<method>` |

**最小例子**

```ts
export function apply(ctx: Context) {
  const jobs = ctx.get('jobs')          // 无 inject 要求；缺失时 undefined
  if (!jobs) throw new Error('jobs service unavailable')
  jobs.start({ ... })
}
```

Cordis 文档明确：`ctx.get(name)` 是「Read a service from the store without the inject requirement」，缺失时返回 `undefined`（`cordis-api/context.zh.md` 的 `ctx.get` 一节）。

**学到这个程度就够**：知道 `ctx.xxx` 是服务访问；`ctx.get('xxx')` 是不声明依赖的读取；知道 `undefined` 检查必须自己做。

**权威入口**

- `...\docs\cordis-tutorial\03-services.zh.md`（「使用 `inject` 消费服务」「可选依赖」）
- `...\docs\cordis-api\context.zh.md`（`ctx.get` 签名与语义）

---

### 3.3 `inject` 与 cordis 4.x 的 optional-inject 坑（本仓库最重要的架构注释）

**本仓库落点**

- `src/index.ts:21-27` 的注释：

  > this cordis (@deepseek-ai/cordis 4.x) has NO optional-inject concept — every name declared in `inject` blocks activation until the service exists (the `{required, optional}` object form is treated as literal service names "required"/"optional" and deadlocks the fiber; see CHANGELOG 0.4.1). `sessionProjections` is therefore read lazily via `ctx.get()` at call time...

- `CHANGELOG.md:43` 记录了 0.4.1 的修复：`Inject.resolve` 把对象 key 当服务名，`{ required: [...], optional: [...] }` 注册了两个永远不会存在的服务 `required`/`optional`，fiber 永远 INACTIVE，整个插件（乃至 tree entry）不激活。
- 客户端的同一策略：`src/client/index.ts:19` 只声明硬依赖 `['slots', 'connection']`；`jobs` 服务用 `ctx.get` 读取（`src/client/index.ts:32`），注释在 `src/client/types.ts:105-114`。

**最小例子**

```ts
// ✅ 本仓库的做法
export const inject = ['tools', 'skills']       // 硬依赖
const jobs = ctx.get('jobs')                    // 可选依赖，用时探测

// ❌ 在这个 cordis 4.x 上会死锁
// export const inject = { required: ['tools'], optional: ['jobs'] }
```

**学到这个程度就够**：能解释「`inject` 是硬依赖，缺一个就 PENDING；可选依赖用 `ctx.get()`」。这条规则直接解释 `src/index.ts` 顶部那段注释，也是读客户端兼容代码的关键。

**权威入口**

- `...\docs\cordis-tutorial\03-services.zh.md`（「可选依赖」一节，明确建议「跳过 `inject`，并在使用处探测」）
- `CHANGELOG.md:42-43`

---

### 3.4 fiber 与生命周期

**本仓库落点**

| 事实 | 位置 | 说明 |
|---|---|---|
| 注册是 effect，随 fiber 撤销 | `src/index.ts:1175-1176`（`ctx.skills.register`）、`src/index.ts:1188`（`ctx.tools.register`） | 插件卸载时自动注销 |
| 进程内对象随 fiber 消失 | `src/index.ts:1178-1181` 的注释（"go away with the plugin's fiber"） | `JobTracker` / `SessionStore` 不持久化 |
| 服务随所属 fiber 移除 | `src/remote.ts:74-83`（`super(ctx, 'claudeCode')`） | Service 生命周期由 Cordis 挂载 |
| 客户端注册也遵循同一生命周期 | `src/client/index.ts:34-39`（`ctx.slots.inject(...)` 的回调返回 disposer） | owner 折叠时贡献消失 |

**最小例子（概念示例）**

```ts
export function apply(ctx: Context) {
  const dispose = ctx.tools.register(defineTool({ ... }))
  // 不需要手动调用 dispose：fiber 卸载时会调用
}
```

**学到这个程度就够**：知道 fiber 的状态机 `PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED`；知道「用了 Cordis 注册 API 就不用手写清理」；知道 `ctx.effect()` 是给定时器/连接等非托管资源用的（本仓库没有直接使用，但写插件会遇到）。见 `...\docs\cordis-tutorial\02-lifecycle-and-effects.zh.md` 与 `...\docs\cordis-api\fiber.zh.md`。

**权威入口**

- `...\docs\cordis-tutorial\02-lifecycle-and-effects.zh.md`（Effect、Fiber 状态机）
- `...\docs\cordis-api\fiber.zh.md`

---

### 3.5 Cordis 事件 — 本仓库**没有**使用

**结论**：对 `src/` 搜索 `ctx.on` / `ctx.effect` 均无结果。本仓库里的「事件」是另外三套：

| 事件机制 | 位置 | 说明 |
|---|---|---|
| `AbortSignal` 的 `abort` 事件 | `src/index.ts:714, 1401` | 取消传播 |
| Node `EventEmitter` 的 `data`/`close`/`error` | `src/live-shell.ts:271-283` | 子进程输出 |
| React 的 `addEventListener`/`onScroll`/`onClick` | `src/client/ClaudeCodeView.tsx:445-454`、`src/client/JobDetailModal.tsx:48-52`、各 JSX 事件 | UI 交互 |

**学到这个程度就够**：知道 Cordis 有 `ctx.on(event, listener)` 且监听器随 fiber 撤销即可；本仓库不需要它。写简单插件时可以先不学（见 §6）。

**权威入口**

- `...\docs\cordis-tutorial\04-events.zh.md`（选读）

---

### 3.6 客户端 DI：slots（另一种「注入」）

**本仓库落点**

- `src/client/index.ts:34-39`：用 `ctx.slots.inject('conversation.view', () => ctx.slots.register({...}, ClaudeCodeView))` 注册第三个会话视图 tab。
- `src/client/types.ts:89-102`：`SlotRegisterOptions` / `SlotsService` 的结构镜像。
- `src/client/index.ts:6-10` 的注释：裸 `register` 会在 ui-conversation 声明 slot 之前抛错，所以必须包在 `slots.inject` 里。
- `src/client/index.ts:19`：客户端硬依赖只有 `slots` 和 `connection`。

**最小例子**

```ts
export const inject = ['slots']

export function apply(ctx: Context) {
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({ name: 'conversation.view', id: 'my-panel', order: 100 }, MyView))
}
```

**学到这个程度就够**：知道 `ctx.slots.inject` 是「等 slot 声明存在再注册」，`ctx.slots.register` 的返回值是 disposer；组件 props 由框架注入（本仓库的 `ViewProps` 里是 `sessionId` 和 `useSessions`，`src/client/types.ts:71-75`）。

**权威入口**

- `...\docs\subsystems\slots.zh.md`（「声明与生命周期」「组件输入」）
- `...\docs\subsystems\client-modules.zh.md`（`dsh.client` 与 bundle 路由）

---

## 4. Stage 4 — React 最小够用集

> 学习目标（整段）：能写函数组件与 JSX；会用 `useState`、`useEffect`（含 cleanup）、`useMemo`、`useRef`；会给列表加稳定 key；能解释「为什么这个 effect 的依赖数组里有这一项」。

### 4.1 函数组件、props 与 JSX

**本仓库落点**

| 事实 | 位置 |
|---|---|
| 组件就是一个接收 props 的函数 | `src/client/OutputView.tsx:45`、`src/client/EventView.tsx:271`、`src/client/JobDetailModal.tsx:46`、`src/client/PersistedOutput.tsx:39` |
| 组件工厂（闭包捕获 `api`） | `src/client/ClaudeCodeView.tsx:226-227`（`createClaudeCodeView` 返回 `ClaudeCodeView`） |
| props 类型 | `src/client/types.ts:71-75`（`ViewProps`）、`src/client/EventView.tsx:75-85`（`EventViewProps`）、`src/client/JobDetailModal.tsx:20-32` |
| JSX 编译配置 | `tsconfig.client.json:11`（`"jsx": "react-jsx"`）；esbuild 侧 `scripts/build-client.mjs:59-60`（`jsx: 'automatic'`） |
| 完整 JSX 树 | `src/client/ClaudeCodeView.tsx:555-729` |

**最小例子**

```tsx
interface OutputViewProps { text: string; truncated: boolean }

export function OutputView({ text, truncated }: OutputViewProps) {
  return <pre className={CSS.outputBody}>{truncated ? '…' : text}</pre>
}
```

**学到这个程度就够**：知道组件名首字母大写、props 是第一个参数、JSX 里 `{}` 嵌表达式、`className` 不是 `class`。

**权威入口**

- React《Writing Markup with JSX》：`https://react.dev/learn/writing-markup-with-jsx`
- React《Your First Component》：`https://react.dev/learn/your-first-component`

---

### 4.2 `useState`

**本仓库落点**

| 用法 | 位置 |
|---|---|
| 简单布尔/字符串/数字 | `src/client/OutputView.tsx:47`、`src/client/EventView.tsx:273`、`src/client/PersistedOutput.tsx:40-44` |
| 带初始函数（惰性初始化） | `src/client/ClaudeCodeView.tsx:234, 296, 311` |
| 不可变集合 | `src/client/EventView.tsx:274`（`ReadonlySet<string>`，更新时 `new Set(current)`，行 309-316） |
| 函数式更新 | `src/client/ClaudeCodeView.tsx:317`（`setRevision((value) => value + 1)`）、`src/client/ClaudeCodeView.tsx:490` |
| 状态提升到模块级缓存 | `src/client/ClaudeCodeView.tsx:113-128`（`panels`），因为 harness 会卸载非活动视图 |

**最小例子**

```tsx
const [following, setFollowing] = useState(true)
setFollowing((current) => !current)
```

**学到这个程度就够**：会声明状态、会函数式更新、知道 setState 触发重渲染；知道「不要直接改数组/对象，要造新值」。

**权威入口**

- `https://react.dev/reference/react/useState`

---

### 4.3 `useEffect`（含 cleanup 与依赖数组）

**本仓库落点**

| 模式 | 位置 | 说明 |
|---|---|---|
| 订阅 + cleanup | `src/client/ClaudeCodeView.tsx:253-256`（`jobs.watchRows`） | 返回释放函数 |
| 轮询 + cleanup | `src/client/ClaudeCodeView.tsx:260-281`（2s 拉列表）、`381-441`（1s 拉输出/事件）、`466-471`（1s 刷新时钟） | `setInterval` + `clearInterval` |
| 拉取数据 + `AbortController` | `src/client/ClaudeCodeView.tsx:352-374` | cleanup 里 `abort.abort()` |
| 事件监听 + cleanup | `src/client/ClaudeCodeView.tsx:445-454`（scroll）、`src/client/JobDetailModal.tsx:48-52`（keydown ESC） | `addEventListener` / `removeEventListener` |
| 依赖变化时重置 | `src/client/EventView.tsx:284-287`（换 job 清空展开状态）、`src/client/OutputView.tsx:51-53` | 依赖是 `jobId` |
| 首次加载 | `src/client/PersistedOutput.tsx:50-68` | `cancelled` 标志防止卸载后 setState |
| 滚动到底部 | `src/client/ClaudeCodeView.tsx:458-462` | 依赖 `revision`/`currentJobs`/`currentStatus`/`selected` |

**最小例子**

```tsx
useEffect(() => {
  let alive = true
  const timer = setInterval(() => {
    api.listJobs(sessionId).then((rows) => { if (alive) setTracked(rows) })
  }, 2000)
  return () => { alive = false; clearInterval(timer) }
}, [api, sessionId])
```

这就是 `src/client/ClaudeCodeView.tsx:260-281` 的简化版。

**学到这个程度就够**：会写「effect 做事，返回 cleanup」；能解释依赖数组的作用；知道异步回调里要检查「组件是否还活着」。**不要求**背 exhaustive-deps 的全部规则。

**权威入口**

- `https://react.dev/reference/react/useEffect`
- React《Synchronizing with Effects》：`https://react.dev/learn/synchronizing-with-effects`

---

### 4.4 `useMemo` / `useCallback`

**本仓库落点**

| Hook | 位置 | 目的 |
|---|---|---|
| `useMemo` 派生列表 | `src/client/ClaudeCodeView.tsx:239-242`（`ordered(mergeRows(...))`） | 依赖不变就不重算 |
| `useMemo` 分组 | `src/client/ClaudeCodeView.tsx:291`（`groupsOf(rows)`） | 同上 |
| `useMemo` 建索引 | `src/client/ClaudeCodeView.tsx:305-309`（`lineOf`） | 从注册表数组建 `Map` |
| `useMemo` 解析事件 | `src/client/EventView.tsx:277-281`（`visible` / `toNodes`） | 重渲染时不重复解析 |
| `useMemo` 拆行 | `src/client/OutputView.tsx:48`（`toLines(text)`） | 大文本只处理一次 |
| `useCallback` 稳定身份 | `src/client/ClaudeCodeView.tsx:246-250`（`readFile`，被 `PersistedOutput` 的 ref 持有）、`473-486`（`onCancel`）、`538-541` | 避免子组件/effect 因新闭包重跑 |
| `useCallback` 分页 | `src/client/PersistedOutput.tsx:70-85`（`loadEarlier`） | 依赖 `filePath/loading/start` |

**最小例子**

```tsx
const { lines, clipped } = useMemo(() => toLines(text), [text])

const readFile = useCallback(
  (path: string, offset: number, limit: number) => api.readOutputFile(sessionId, path, offset, limit),
  [api, sessionId],
)
```

**学到这个程度就够**：知道它们是性能优化，不改变语义；知道「依赖数组漏项」会读到旧值；不要把每个函数都包 `useCallback`。

**权威入口**

- `https://react.dev/reference/react/useMemo`
- `https://react.dev/reference/react/useCallback`

---

### 4.5 `useRef`

**本仓库落点**

| 用法 | 位置 | 说明 |
|---|---|---|
| DOM 引用 | `src/client/OutputView.tsx:46, 56-60`、`src/client/EventView.tsx:272, 290-294`、`src/client/ClaudeCodeView.tsx:319, 461` | 控制 `scrollTop` |
| 可变值（不触发渲染） | `src/client/ClaudeCodeView.tsx:321`（`panePinnedRef`）、`src/client/EventView.tsx` 的 `expanded` 是 state 而非 ref（对比） | 记录「用户是否向上滚」 |
| 保存最新回调 | `src/client/PersistedOutput.tsx:47-48`（`reader.current = read`） | 避免 effect 因父组件新闭包重跑 |
| 稳定函数引用 | `src/client/ClaudeCodeView.tsx:317`（`bumpRef`） | 让 effect 内可调用最新 `setRevision` |

**最小例子**

```tsx
const bodyRef = useRef<HTMLDivElement | null>(null)
useLayoutEffect(() => {
  if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
}, [lines])
```

**学到这个程度就够**：知道 `useRef` 的 `.current` 可读写且改它不触发渲染；DOM ref 用 `useLayoutEffect` 在绘制前操作。

**权威入口**

- `https://react.dev/reference/react/useRef`

---

### 4.6 列表渲染与 key

**本仓库落点**

| 列表 | 位置 | key 的选择 |
|---|---|---|
| 注册表行 | `src/client/ClaudeCodeView.tsx:578` | `row.key`（业务 id） |
| 会话 tab | `src/client/ClaudeCodeView.tsx:584-621` | `group.key`（Claude session id 或 job id） |
| 一次会话的多轮 | `src/client/ClaudeCodeView.tsx:665-682` | `<Fragment key={job.id}>`（行 666） |
| 事件节点 | `src/client/EventView.tsx:370-481` | `node.key`（解析时生成，行 159） |
| 命令行 | `src/client/EventView.tsx:420-425` | 索引 `at`（append-only 行，可接受） |
| 输出行 | `src/client/OutputView.tsx:82-89` | 索引 `index`（append-only 行，可接受） |
| 工具结果 | `src/client/EventView.tsx:478` | `\`${node.key}:r${index}\`` |

**最小例子**

```tsx
{rows.map((row) => <div key={row.id}>{row.label}</div>)}
```

**学到这个程度就够**：会给列表加稳定 key；知道 key 只用于 React 协调，不传给子组件；知道 append-only 列表用索引 key 是「可接受的例外」。

**权威入口**

- React《Rendering Lists》：`https://react.dev/learn/rendering-lists`

---

### 4.7 本仓库用到但常被忽略的两项

| Hook / API | 位置 | 一句话 |
|---|---|---|
| `useLayoutEffect` | `src/client/OutputView.tsx:56-60`、`src/client/EventView.tsx:290-294` | 在浏览器绘制前滚动到底部，避免一帧跳动 |
| `memo` | `src/client/md.ts:306` | Markdown 解析结果缓存；父组件每秒轮询重渲染时不重复解析 |
| 模块级缓存 + `useState` 版本号 | `src/client/ClaudeCodeView.tsx:113-128, 316-317` | harness 卸载视图后，局部 state 会丢；缓存放在模块级，靠 `revision` 触发重渲染 |

**权威入口**

- `https://react.dev/reference/react/useLayoutEffect`
- `https://react.dev/reference/react/memo`

---

### 4.8 React Context — 本仓库**没有**使用

**结论**：搜索 `createContext` / `useContext` 无结果。跨层数据通过两种方式传递：

1. **框架注入的 props**：`ViewProps.useSessions`（`src/client/types.ts:71-75`），由 slot 渲染器作为 prop 传给组件（本地文档 `subsystems/slots.zh.md`「框架提供的 hooks」）。
2. **模块级缓存**：`src/client/ClaudeCodeView.tsx:113-128` 的 `panels`，按 `sessionId` 保存面板状态。

> 注意区分同名概念：后端 `import { Context } from '@deepseek-ai/cordis'`（`src/index.ts:1`）的 `Context` 是 **Cordis 上下文**，不是 React Context。两者只是英文同名，含义与 API 完全不同。

**学到这个程度就够**：知道 Context 解决「深层组件传参」，但本项目用 prop 注入替代；**读本仓库不需要学 Context**。

**权威入口（选读）**

- `https://react.dev/learn/passing-data-deeply-with-context`

---

## 5. Stage 5 — 构建工具

> 学习目标（整段）：能说清 `npm run build` 的两条流水线；能判断一个新文件该归哪个 tsconfig；能解释 `lib/client.js` 为什么必须被包在 `window.__ModuleLoader__.load` 里。

### 5.1 两条构建流水线

**本仓库落点**

| 步骤 | 命令/文件 | 产物 |
|---|---|---|
| Node 半边 | `package.json:56`（`tsc -p tsconfig.json`） | `lib/*.js` + `lib/types/*.d.ts` |
| 客户端类型 | `package.json:57` 的前半（`tsc -p tsconfig.client.json`） | `lib/types/client/*.d.ts`（仅声明） |
| 客户端 bundle | `package.json:57` 的后半（`node scripts/build-client.mjs`） | `lib/client.js`（单文件） |
| 产物存在性检查 | `package.json:55` 的第三段（`node scripts/assert-artifacts.mjs`） | 缺失/空文件则退出码 1 |
| 类型检查（不产物） | `package.json:58`（两个 `--noEmit`） | 无 |

`scripts/assert-artifacts.mjs:14-26` 列出必须存在的 11 个产物；`scripts/assert-artifacts.mjs:37-40` 失败即 `process.exit(1)`。原因在 `scripts/assert-artifacts.mjs:1-7`：缺 `lib/client.js` 会让 DSH 客户端抛 `MissingClientBundleError`，整个 clientModules fiber 变 FAILED。

> 前置条件：当前工作树没有 `node_modules`；第一次构建前要先 `npm install`（联网，需按公司白名单规则确认）。之后 `npm run build` / `npm run typecheck` 都在本地完成。

### 5.2 两个 `tsconfig` 的差异

| 选项 | `tsconfig.json`（Node 半边） | `tsconfig.client.json`（客户端） | 为什么不同 |
|---|---|---|---|
| `target` | `ES2022`（`:3`） | `ES2022`（`:3`） | 相同 |
| `module` | `NodeNext`（`:4`） | `ESNext`（`:4`） | Node 直接跑 ESM；客户端交给 esbuild |
| `moduleResolution` | `NodeNext`（`:5`） | `Bundler`（`:5`） | Node 规则 vs 打包器规则 |
| `lib` | `["ES2022"]`（`:6-8`） | `["ES2022","DOM","DOM.Iterable"]`（`:6-10`） | 客户端有 `document`/`navigator` |
| `jsx` | 无 | `react-jsx`（`:11`） | 只有 `.tsx` |
| `types` | 未限制（默认含 `@types/node`） | `[]`（`:12`） | 客户端图禁止 Node 类型（`src/client/types.ts:6-7` 注释） |
| `rootDir` | 无（`include: ["src"]`，`:18-20`） | `src/client`（`:13`） | 声明输出目录要对齐 |
| `outDir` | `lib`（`:9`） | 无（不产 JS） | 客户端 JS 由 esbuild 产 |
| `declaration` | `true`（`:10`） | `true`（`:14`） | 两边都发布类型 |
| `emitDeclarationOnly` | 无 | `true`（`:15`） | 客户端只让 tsc 产 `.d.ts` |
| `declarationDir` | `lib/types`（`:11`） | `lib/types/client`（`:16`） | 两套声明不混 |
| `noUncheckedIndexedAccess` | 无 | `true`（`:18`） | 客户端大量数组索引，强制 `??` 兜底 |
| `skipLibCheck` / `esModuleInterop` / `strict` | 同（`:12-14`） | 同（`:17, 19-20`） | 一致 |
| `paths` | **无** | **无** | 本仓库不用路径别名 |

**最小例子（tsconfig 关键片段）**

```jsonc
// tsconfig.json（Node）
{ "module": "NodeNext", "moduleResolution": "NodeNext", "outDir": "lib", "declaration": true }

// tsconfig.client.json（浏览器）
{ "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx",
  "lib": ["ES2022", "DOM"], "emitDeclarationOnly": true }
```

**学到这个程度就够**：知道「Node 半边用 tsc 直接产 JS；客户端先 tsc 产声明、再 esbuild 产 bundle」；知道 `DOM` lib、`jsx`、`types: []` 是浏览器半边的边界；知道本仓库没有 `paths`。

**权威入口**

- `tsc` 的 `--project`：`https://www.typescriptlang.org/docs/handbook/compiler-options.html`
- `tsconfig` 全量参考（`module` / `moduleResolution` / `jsx` / `declaration` / `noUncheckedIndexedAccess`）：`https://www.typescriptlang.org/tsconfig`

### 5.3 esbuild 的 bundle 契约

**本仓库落点**

| 事实 | 位置 |
|---|---|
| 入口是 `src/client/index.ts` | `scripts/build-client.mjs:53` |
| 输出 `lib/client.js` | `scripts/build-client.mjs:23, 54` |
| `format: 'cjs'`、`platform: 'browser'`、`target: 'es2020'` | `scripts/build-client.mjs:56-58` |
| `jsx: 'automatic'` | `scripts/build-client.mjs:59-60` |
| 只外置 seed 模块（`react`、`react/jsx-runtime`、`@deepseek-ai/cordis` 等） | `scripts/build-client.mjs:26-39, 61` |
| 用 banner/footer 包成 `window.__ModuleLoader__.load({ id, factory })` | `scripts/build-client.mjs:41-50, 66-67` |
| bundle id 必须等于包名 | `scripts/build-client.mjs:74-76` |
| 任何非 seed 的 `require` 都报错 | `scripts/build-client.mjs:77-83` |

**最小例子（产物骨架）**

```js
window.__ModuleLoader__.load({
  id: "dsh-claude-delegate",
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    // ...esbuild 打包后的 CJS 代码...
    return module.exports;
  },
});
```

**学到这个程度就够**：知道源码是 ESM、产物是「包了一层 CJS 工厂的浏览器脚本」；知道新增依赖时，要么它在 seed 表里，要么会被打进 bundle；知道 `external` 列表就是运行时可用的全部模块。

**权威入口**

- esbuild Build API：`https://esbuild.github.io/api/`
- DSH 客户端模块系统（`dsh.client`）：`...\docs\subsystems\client-modules.zh.md`

### 5.4 DSH 的两处清单

| 清单 | 位置 | 作用 |
|---|---|---|
| `package.json` 的 `dsh` 字段 | `package.json:26-38` | `dsh.bundle.patch` 指向 `cordis.patch.yml`；`dsh.client.platform/inject` 告诉 Web 端如何加载客户端半边 |
| `cordis.patch.yml` | `cordis.patch.yml:10-17` | 把 `dsh-claude-delegate` 以 `id: claude-code` 插入 profile，并给默认 config |
| 入口导出 | `package.json:6-18` | `main`/`types`/`exports` 决定 Node 半边与客户端半边的入口 |
| 构建脚本 | `package.json:54-60` | 见 §5.1 |

**权威入口**

- 本地文档 `...\docs\subsystems\client-modules.zh.md`（`dsh.client` 扫描与 `exports["./client"]`）
- 本地文档 `...\docs\cookbook\adding-a-package.zh.md`（包清单不变式）

### 5.5 `tsconfig` 的 `paths` — 本仓库没有

两个 tsconfig 都没有 `paths`；相对导入直接用路径（`src/index.ts:9-16`），包名导入交给 Node 解析。**不要**为了「看起来高级」去加别名，会让构建与声明输出都变复杂。

---

## 6. 可跳过清单（明确不学）

> 判断标准：本仓库没有实际使用，且「写一个简单 DSH 插件」不会被迫用到。遇到时回这里查一眼即可。

### 6.1 TypeScript 可跳过

| 项 | 证据 | 为什么可以跳过 |
|---|---|---|
| 类型体操（条件类型、映射类型、`infer`、模板字面量类型） | `src/` 只用到 `Extract`/`Exclude`/`Omit`/`Record`/`Readonly`/`ReturnType` | 读本仓库不需要自己推导 |
| 交叉类型 `A & B` | `src/` 无 ` & ` 类型用法 | 用 `extends`/`Omit` 就够 |
| `satisfies` | 无使用 | 知道概念即可（§1.6） |
| 枚举 `enum` / 命名空间 `namespace` | 无使用 | 字面量联合已覆盖 |
| 手写 `declare module` 声明合并 | 仓库只在注释里提到它到不了第三方（`src/client/types.ts:1-8`） | 只需会「消费」`.d.ts` |
| 装饰器原理 | 只在 `src/remote.ts:92` 等处使用 `@Remote` | 知道它给方法挂元数据即可，不需要会写 |
| 泛型约束、变型（variance）、重载 | 无复杂用法 | 读 `Map<K,V>`/`call<T>` 不需要 |
| `paths` / `baseUrl` | 两个 tsconfig 都没有 | 本仓库不用别名 |
| `import = require` / 三斜线指令 | 无使用 | ESM 项目不需要 |

### 6.2 ESM / Node 可跳过

| 项 | 为什么可以跳过 |
|---|---|
| Streams（`Readable`/`Writable`） | `live-shell.ts` 用的是 `data` 事件 + 手动拆行，不是 Node Stream 管道 |
| `worker_threads` / `cluster` / `net` / `http` | 插件不直接起服务器 |
| CJS 与 ESM 互操作的细节 | 本仓库全 ESM；`node -e` 的 CJS 是唯一例外 |
| ESM loader hooks / 自定义解析 | 构建由 tsc/esbuild 负责 |
| 顶层 `await` | 只在 `scripts/build-client.mjs:52` 出现，业务代码用 `async` 函数 |
| `Buffer` 的完整 API | `live-shell.ts:109-125` 只用 `subarray`/`lastIndexOf`/`concat`，看懂即可 |
| 事件循环的精确阶段顺序 | 会「定时器 + Promise + await」即可 |

### 6.3 React 可跳过

| 项 | 证据 | 为什么可以跳过 |
|---|---|---|
| Context（`createContext`/`useContext`） | `src/client/` 无使用 | 框架用 props 注入 `useSessions`（§4.8） |
| `useReducer`、`useSyncExternalStore` | 无使用 | `useState` 足够 |
| `forwardRef`、`Suspense`、Portals、Error Boundary | 无使用 | 面板是普通组件树 |
| 类组件、生命周期方法 | 无使用 | 全是函数组件 |
| RSC / Server Components / React 19 新特性 | 无使用 | 目标运行时是 DSH Web 客户端 |
| 状态管理库（Redux/Zustand 等） | 无依赖 | 模块级缓存 + `useState` |
| CSS-in-JS / 样式方案 | `styles.ts` 是手写 `<style>` 标签 | 会看 CSS 字符串即可 |
| 测试库（RTL/Jest） | 仓库只有 `scripts/test-delegate-model.mjs` | 不是前置知识 |

### 6.4 Cordis / DSH 可跳过

| 项 | 为什么可以跳过 |
|---|---|
| Cordis 事件系统（`ctx.on`/waterfall） | `src/` 无 `ctx.on`；工具执行靠 `exec.signal` |
| 插件组合、Loader 配置、HMR（教程第 6 章） | 本仓库只关心「一个包如何被加载」 |
| Service 的 `init`/`check`/`extend`/`tracker` 等高级成员 | 本仓库只用了 `super(ctx, name)` |
| fiber 状态机的内部实现 | 知道 PENDING/DISPOSED 的后果即可 |
| `ctx.effect()` 的深入用法 | 本仓库没有直接使用；写插件时遇到定时器再回查 |
| DSH 61 篇子系统文档 | 只读与本仓库相关的：`slots`、`client-modules`、`tools`、`skills`、`jobs`、`typert` |
| agent loop / LLM adapter / persistence / sandbox 内部 | 不属于「写一个简单插件」的最小集 |

### 6.5 构建可跳过

| 项 | 为什么可以跳过 |
|---|---|
| tsdown / rolldown / vite 配置 | 本仓库用 tsc + esbuild，没有这些 |
| monorepo / workspace 约束 | 单包仓库 |
| sourcemap / minify / 代码分割 | 当前构建全部关闭 |
| npm 发布流程 | 学习阶段只需本地 `npm run build` |
| 声明映射（`.d.ts.map`） | 当前 tsconfig 未开启 |

---

## 7. 权威入口汇总

### 7.1 本地 DSH 文档（首选，版本锁定 0.2.2-rc.5）

根目录：`E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\docs\`

| 主题 | 文件 |
|---|---|
| Cordis 五概念 | `cordis-primer.zh.md` |
| 第一个插件 | `cordis-tutorial\01-first-plugin.zh.md` |
| 生命周期 / effect / fiber | `cordis-tutorial\02-lifecycle-and-effects.zh.md`、`cordis-api\fiber.zh.md` |
| 服务 / `inject` / 可选依赖 | `cordis-tutorial\03-services.zh.md`、`cordis-api\service.zh.md`、`cordis-api\context.zh.md` |
| 事件（选读） | `cordis-tutorial\04-events.zh.md`、`cordis-api\events.zh.md` |
| 配置 schema | `cordis-tutorial\05-config.zh.md` |
| 接入 harness 工具 | `cordis-tutorial\07-into-the-harness.zh.md`、`cookbook\adding-a-tool.zh.md` |
| 客户端 slots | `subsystems\slots.zh.md` |
| 客户端模块 / bundle | `subsystems\client-modules.zh.md` |
| Remote（`@Remote`） | `subsystems\typert.zh.md` |
| 后台作业 | `subsystems\jobs.zh.md` |
| 工具 / 技能注册 | `subsystems\tools.zh.md`、`subsystems\skills.zh.md` |
| 包清单 | `cookbook\adding-a-package.zh.md` |

### 7.2 外部官方文档（按需查，不必通读）

| 主题 | 入口 |
|---|---|
| TS Everyday Types / 联合 / 断言 | `https://www.typescriptlang.org/docs/handbook/2/everyday-types.html` |
| TS Narrowing / 类型守卫 / 可辨识联合 | `https://www.typescriptlang.org/docs/handbook/2/narrowing.html` |
| TS Generics | `https://www.typescriptlang.org/docs/handbook/2/generics.html` |
| TS Utility Types | `https://www.typescriptlang.org/docs/handbook/utility-types.html` |
| TS 模块解析 | `https://www.typescriptlang.org/docs/handbook/modules/reference.html` |
| TS `satisfies` | `https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator` |
| TS 声明文件 | `https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html` |
| `tsconfig` 参考 | `https://www.typescriptlang.org/tsconfig` |
| MDN ES Modules | `https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules` |
| Node ESM | `https://nodejs.org/api/esm.html` |
| Node `fs` / `path` / `os` | `https://nodejs.org/api/fs.html`、`https://nodejs.org/api/path.html`、`https://nodejs.org/api/os.html` |
| Node `child_process` | `https://nodejs.org/api/child_process.html` |
| Node `process` | `https://nodejs.org/api/process.html` |
| Node 事件循环 | `https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick` |
| MDN AbortController | `https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController` |
| React 学习路线 | `https://react.dev/learn` |
| `useState` / `useEffect` / `useMemo` / `useRef` / `useCallback` | `https://react.dev/reference/react/useState` 等对应页面 |
| React 列表与 key | `https://react.dev/learn/rendering-lists` |
| esbuild API | `https://esbuild.github.io/api/` |

---

## 8. 与本仓库文件对照的阅读路线

> 每个阶段「读什么、读到什么程度」。行号只标入口，不要求逐行。

| 顺序 | 文件 | 行数 | 只关注 | 用到的前置 |
|---|---|---|---|---|
| 1 | `src/delegate-model.ts` | 36 | `as const`、`string \| undefined`、`includes` | S1.2 / S1.6 |
| 2 | `src/tracker.ts` | 409 | 联合类型、`Map`、`interface`、`switch` 收窄 | S1.1 / S1.2 / S1.5 |
| 3 | `src/session-store.ts` | 390 | `node:fs`/`node:path`、JSON 读写、原子 rename、`as` | S2.1 / S2.2 / S1.6 |
| 4 | `src/output-file.ts` | 71 | `fs/promises`、`Buffer`、窗口读取 | S2.2 |
| 5 | `src/live-shell.ts` | 303 | `spawn`、`data` 事件、按行拆分、`process.env` | S2.3 / S2.4 / S2.5 |
| 6 | `src/delegation-skill.ts` | 201 | 只是一个大对象；看 `SkillRegistration` 标注 | S1.1 / S1.6 |
| 7 | `src/remote.ts` | 173 | `class extends Service`、`@Remote`、`ctx.get` | S3.1 / S3.2 |
| 8 | `src/index.ts` | 1481 | 插件契约、`inject`、`ctx.get('jobs')`、`defineTool`、`AbortController` | S1–S3 全部 |
| 9 | `src/client/types.ts` | 221 | 客户端形状镜像、`RpcResult`、`Context` | S1.1 / S1.2 |
| 10 | `src/client/api.ts` | 228 | `unknown` + 守卫 + `as`、泛型 `call<T>` | S1.4 / S1.5 / S1.6 |
| 11 | `src/client/locales.ts` | 166 | `keyof typeof`、`Record`、字典 | S1.5 |
| 12 | `src/client/format.ts` | 43 | 纯函数、联合参数 | S1.2 |
| 13 | `src/client/OutputView.tsx` | 98 | `useState`/`useRef`/`useMemo`/`useLayoutEffect`、列表 key | S4.1–S4.7 |
| 14 | `src/client/EventView.tsx` | 490 | 可辨识联合 → 渲染节点、`Extract`、`useMemo` | S1.2 / S1.5 / S4 |
| 15 | `src/client/JobDetailModal.tsx` | 109 | props、`useEffect` 键盘监听、条件渲染 | S4.1–S4.3 |
| 16 | `src/client/PersistedOutput.tsx` | 101 | effect + 取消、`useRef` 保存最新回调 | S4.3 / S4.5 |
| 17 | `src/client/ClaudeCodeView.tsx` | 731 | 组件工厂、状态管理、轮询、模块级缓存、列表 | S4 全部 |
| 18 | `src/client/md.ts` | 316 | 递归解析、`memo`、`createElement` | S4.7 |
| 19 | `src/client/styles.ts` | 891 | 字符串常量、`as const`、`document` 注入 | S1.6 / S4.1 |
| 20 | `src/client/index.ts` | 40 | 客户端插件契约、`slots.inject`、`ctx.get` | S3.6 |
| 21 | `tsconfig*.json` + `scripts/build-client.mjs` + `package.json` | — | 两套构建、bundle 契约、清单 | S5 |

---

## 9. 给后续票的输入（可直接引用）

- **S1 的最小练习**：给 `delegate-model.ts` 加一个 `delegateFamilyFor()`，返回联合类型；再用类型守卫收窄。
- **S2 的最小练习**：照 `session-store.ts` 写一个「读写 `~/.dsh/demo.json`，先写 `.tmp` 再 rename」的小模块。
- **S3 的最小练习**：照 `cordis-tutorial/07-into-the-harness.zh.md` 写一个 `greet` 工具插件，导出 `name`/`inject`/`apply`。
- **S4 的最小练习**：给 `OutputView.tsx` 加一个「行号」开关（`useState` + 列表渲染）。
- **S5 的最小练习**：新增一个 `src/client/Foo.tsx`，跑 `npm run build`，确认它只进客户端声明与 bundle、不进 Node 产物。

> 以上练习本身不需要联网；但当前工作树没有 `node_modules`，首次构建前需要 `npm install` 安装 devDependencies（`npm` 需要联网，执行前请按公司白名单规则确认）。安装后 `tsc`、`node`、`esbuild` 均由本地依赖或 Node 提供。
