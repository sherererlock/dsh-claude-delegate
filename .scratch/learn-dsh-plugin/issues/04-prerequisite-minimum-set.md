# 04 — 前置知识的最小够用集

Type: research
Status: resolved
Blocked by: —

## Question

读懂本项目与开发一个简单 DSH 插件，最少需要哪些前置知识？各自落在本仓库哪些位置？

需要回答：

1. **TypeScript**：泛型、联合/交叉类型、类型守卫、`satisfies`、`as`、接口与类型别名、声明文件、模块解析。本项目哪些行实际用到？每个概念给一个「本仓库中的最小例子」。
2. **ESM / Node**：`"type": "module"`、`import`/`export`、`node:fs`、`node:path`、子进程、`process`、事件循环。本项目哪些行实际用到？
3. **React**：函数组件、`useState` / `useEffect` / `useMemo` / `useRef`、context、JSX、列表渲染。客户端哪些行实际用到？
4. **依赖注入 / Cordis**：service、fiber、生命周期、`inject`、事件、`ctx.get()`。本项目哪些行实际用到？（注意本仓库注释里提到的「cordis 4.x 没有 optional-inject」等坑。）
5. **构建工具**：`tsc`、`esbuild`、`tsconfig` 的 `paths`/`module`/`jsx` 配置。本项目两侧构建分别依赖什么？
6. 每项给出「最小够用」的学习目标（学到这里就够读本项目，不必系统学完）与权威入口（官方文档 / MDN / TS Handbook 章节）。
7. 明确「可以不学」的部分（例如 React 高级模式、TS 类型体操、Cordis 插件生态的全部 API）。

产出：

- 补课清单（按学习顺序，标注「在哪个阶段插入」的建议）
- 每个概念在本仓库的落点（文件:行号）
- 可跳过清单

## Answer

1. **主干按 6 个阶段组织**：TypeScript → ESM/Node → Cordis/DI → React → 构建打包 → 选读/跳过。
2. **最该先学的三项**：① TS 联合类型 + 类型收窄；② ESM/Node 的模块与异步（`fs` / `path` / `spawn` / 事件循环）；③ Cordis 的 `inject` + `ctx.get()` 服务模型。
3. **重要发现**：本仓库实际**没有**使用 `satisfies`、交叉类型 `A & B`、React Context、`ctx.on`，均已标为可跳过并给出替代写法。
4. **cordis 4.x 无 optional-inject**：`{required, optional}` 会被当成两个服务名导致 fiber 死锁；仓库改用 `ctx.get()` 惰性读取（`src/index.ts:21-27` + `CHANGELOG.md:43`）。
5. **构建分两条**：Node 半边 `tsc` 直接产 JS；客户端先 `tsc` 只产 `.d.ts`，再由 esbuild 包成 `window.__ModuleLoader__.load` 的 CJS 工厂。
6. 每项都附了「学到什么程度」、本地 DSH 文档路径与官方入口，并给出可跳过清单和 21 步文件阅读路线。
7. 186 处 `文件:行号` 引用已全部校验在真实范围内。
8. **环境前提**：当前工作树没有 `node_modules`，练构建前需先 `npm install`（联网，需按公司白名单规则确认）。

完整研究：`.scratch/learn-dsh-plugin/research/04-prerequisite-minimum-set.md`
