# 第 1 节延伸问答：TS 模块解析与 Node 核心模块整理

本文整理自学习 [`docs/learn-dsh-plugin/index.html`](./index.html) 第 1 节（「TS + ESM/Node 够用集」）过程中的提问与解析，聚焦 **ESM 下的 `.js` 后缀机制**，以及 **`node:fs/promises`（含 `node:fs`）、`node:path`、`node:child_process` 在本仓的真实用法**。

---

## 目录

1. [TypeScript Handbook：Modules（ESM 的导入导出与 `.js` 后缀）主要讲什么？](#1-typescript-handbookmodulesesm-的导入导出与-js-后缀主要讲什么)
2. [Node 的 `fs/promises`、`path`、`child_process` 在本仓分别怎么用？](#2-node-的-fspromisespathchild_process-在本仓分别怎么用)

---

## 1. TypeScript Handbook：Modules（ESM 的导入导出与 `.js` 后缀）主要讲什么？

这篇内容直接对应仓库的 `tsconfig.json` 与 `src/index.ts` 的模块写法，重点解答初学者最容易困惑的问题：

> 磁盘上明明只有 `src/tracker.ts`，为什么 `src/index.ts:9` 却要写 `from './tracker.js'`？

### 第一性原理：为什么 `.ts` 源码里写 `.js` 后缀？

把「编译」和「运行」拆成两条事实看，原因就一条：**TypeScript 只负责擦除类型并输出 JS，不会改写 `import` 里的路径字符串。**

1. **运行时规定（Node ESM 禁止省略扩展名）**
   本仓 `package.json` 声明了 `"type": "module"`，运行时走 Node 原生 ESM。不同于早期 CommonJS（`require('./tracker')`），Node ESM 在加载编译后的 `lib/index.js` 时**要求相对导入必须带真实存在的文件扩展名**，否则报 `ERR_MODULE_NOT_FOUND`。
2. **编译器原则（`tsc` 原样保留导入路径）**
   `tsc` 把 `src/*.ts` 编译到 `lib/*.js` 时，只会把 `.ts` 转成 `.js`，`import ... from '...'` 里的字符串原封不动留到输出文件里。
3. **`NodeNext` 的映射桥梁（`tsconfig.json:4-5`）**
   本仓配置了 `"module": "NodeNext"` 与 `"moduleResolution": "NodeNext"`。在此模式下，编译器建立了统一约定：
   - **源码里写编译后的目标路径（`./tracker.js`）**；
   - **类型检查时**，TS 自动把 `./tracker.js` 映射回 `src/tracker.ts` 完成类型校验；
   - **运行时**，Node 读取编译生成的 `lib/index.js`，里面的 `from './tracker.js'` 刚好命中 `lib/tracker.js`。

> 一句话记住：**`import` 路径写的是「运行时的 JS 目标位置」，不是「源码的 `.ts` 文件名」。**

### 对照 `src/index.ts:1-27` 的 4 个实战知识点

1. **命名导出 / 导入与重导出**：
   - `export const name = ...`、`export function apply(...)`；
   - `export { delegateModelFor, delegateEffortFor }`（`src/index.ts:18`）将其他模块的符号再次作为本模块公共 API 暴露。
2. **纯类型导入 `import type`**：
   ```ts
   import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
   import { JobTracker, type ClaudeEvent } from './tracker.js'
   ```
   `type` 标记的导入在编译为 JS 时会被**完全擦除**，既不会触发运行时加载该模块，也能避免纯类型依赖带来的循环引用问题。
3. **`node:` 内置模块前缀**：
   ```ts
   import { existsSync, statSync } from 'node:fs'
   ```
   显式声明从 Node 内置模块加载，避免与同名三方包混淆。
4. **ESM 与 CommonJS 的边界**：
   在 `"type": "module"` 下，文件顶层没有 `require`、`module.exports`、`__dirname`、`__filename`；需要当前文件路径或目录时，使用标准 `import.meta.url` 配合 `node:url` 的 `fileURLToPath`。

### 官方手册阅读取舍

- **必看**：`ES Module Syntax`、`TypeScript Specific ES Module Syntax`（`import type`）、`How TypeScript Resolves Modules` / `Module Output Target`（理解 `NodeNext` 与 `.js` 后缀）。
- **可跳过**：`CommonJS Syntax`（`export =` / `import = require()`）、`Namespaces`、老旧的 `AMD` / `UMD` / `SystemJS` 配置。

---

## 2. Node 的 `fs/promises`、`path`、`child_process` 在本仓分别怎么用？

全仓 `src/` 共有 4 个文件用到了这三个内置模块，分别解决**文件与目录读写**、**跨平台路径处理**、**外部进程调用与生命周期管理**三类系统交互问题。

### ① `node:fs/promises`（及 `node:fs`）—— 文件与目录读写

本仓把**异步字节窗口读取**和**同步小文件/检查**分开用在最合适的场景：

- **按字节窗口异步读取大文件（`src/output-file.ts:17, 45-71`）**：
  当外部命令产生超大输出日志时，面板通过 `stat` 拿总字节数，再用 `open` + `handle.read(buffer, 0, length, start)` + `finally { await handle.close() }` 只读取目标偏移窗口（支持负数偏移从末尾倒读）。
  - **为什么不用 `readFile`？** 几百 MB 的日志一次整读进内存会卡死进程；按字节窗口只读当前显示片段即可。
  - **小文件注意（练习 1.2）**：使用 `readFile(path, 'utf8')` 时必须传编码 `'utf8'` 才返回字符串，不传则返回二进制 `Buffer`。
- **同步原子写回小配置（`src/session-store.ts:29, 155, 176-180`）**：
  - `readFileSync(this.file, 'utf8')` 读取 `~/.dsh/claude-delegate-sessions.json`；
  - `mkdirSync(dirname(this.file), { recursive: true })` 确保父目录存在；
  - 先 `writeFileSync(temp, ...)` 写到 `.tmp` 临时文件，再通过 **`renameSync(temp, this.file)`** 原子替换，防止写到一半进程退出把原 JSON 破坏。
- **启动前路径校验（`src/index.ts:7, 328, 335`、`src/live-shell.ts:20, 84`）**：
  - `statSync(opts.cwd).isDirectory()` 确认工作目录有效；
  - `existsSync(...)` 检查 Claude CLI 与 Git Bash 可执行文件是否存在。

### ② `node:path` —— 跨平台路径处理

Windows（`\`、大小写不敏感）与 POSIX（`/`、大小写敏感）规则不同，本仓从不手动拼接路径字符串：

| API | 本仓用法 | 解决的问题 |
|---|---|---|
| **`join(...)`** | `session-store.ts:74-75` 拼 `~/.dsh/claude-delegate-sessions.json`；`live-shell.ts:76` 从 `Git\cmd` 反推 `Git\bin\bash.exe` | 按当前操作系统分隔符安全拼接路径片段 |
| **`dirname(p)`** | `session-store.ts:176` 在 `mkdirSync` 前获取文件所在目录；`live-shell.ts:76` 取上级目录 | 提取父目录路径 |
| **`resolve(cwd)`** | `session-store.ts:82-85` 规范化工作目录并在 Windows 转小写 | 把相对路径、`..`、末尾斜杠与大小写差异规整为唯一 key，避免同一目录产生重复会话记录 |

### ③ `node:child_process` —— 启动与管理外部子进程

- **`spawnSync`：短平快的同步探测与强杀（`src/index.ts:8, 311`、`src/live-shell.ts:131`）**
  - 启动前用 `spawnSync(probe, ['claude'], { stdio: 'ignore', windowsHide: true })`（Windows 为 `where`，其他平台为 `which`）探测 CLI 是否安装；
  - 超时清理时在 Windows 调用 `spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], ...)` 强杀整棵进程树（仅调 `child.kill()` 只会杀掉 `bash.exe` 本身，留下一堆孤儿构建子进程）。
- **`spawn`：非阻塞、流式输出、带超时的异步子进程（`src/live-shell.ts:19, 205-269`）**
  ```ts
  child = spawn(bash, ['-lc', command], {
    cwd,
    env: { ...process.env, ...options.env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  ```
  - **为什么长命令必须用 `spawn` 而不用 `exec` / `spawnSync`？**
    1. `stdio: ['ignore', 'pipe', 'pipe']` 关闭标准输入、把 `stdout`/`stderr` 接成流，每收到一块字节按行拆分实时推向面板，不必等命令结束；
    2. 配合 `setTimeout` 与 `killTree(child)` 可在超时时立刻终止子进程并带回尾部日志，不阻塞主事件循环；
    3. **`windowsHide: true`** 避免在 Windows 后台服务拉起外部命令时弹出控制台黑框。

### 阅读重点清单

1. **`fs/promises` / `fs`**：`readFile(path, 'utf8')`（编码与 `Buffer` 的区别）、`open` + `handle.read`（大文件窗口读）、`writeFileSync` + `renameSync`（原子写入）；
2. **`path`**：`join`、`dirname`、`resolve`（跨平台拼接与归一化）；
3. **`child_process`**：`spawnSync`（等结果的短命令）vs `spawn`（流式输出、超时控制与 `windowsHide`）。
