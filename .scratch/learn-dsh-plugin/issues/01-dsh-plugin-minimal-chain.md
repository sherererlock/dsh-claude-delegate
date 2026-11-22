# 01 — DSH 插件的最小完整链路

Type: research
Status: resolved
Blocked by: —

## Question

一个 DSH 插件从零到「可加载、可本地安装」的最小完整链路是什么？

需要回答：

1. `package.json` 的 `dsh` 字段（`bundle.patch`、`client.platform`、`client.inject`）分别声明什么？缺省时插件还能被加载吗？
2. `cordis.patch.yml` 的 `insert` 条目如何把插件挂进 profile？`id`、`name`、`config` 各是什么？patch 层与 profile 的关系是什么？
3. 一个最小工具插件需要哪些文件（源码、tsconfig、构建产物、类型声明）？最小客户端插件又需要哪些？
4. `dsh plugin --profile <name> add <package>` 实际做了什么？插件被装到哪里？本地路径安装与 npm 安装有何区别？
5. 宿主侧插件的契约：`export const name`、`export const inject`、`export function apply(ctx)` 分别何时被调用？`ctx.tools` / `ctx.skills` 等服务的用法是什么？
6. 客户端插件的契约：`inject = ['slots', 'connection']`、`ctx.slots.inject(...)` 的加载时序与 `apply` 的关系；`client.platform: web` 与 `client.inject` 的作用。
7. 开发期调试与热重载：`dsh-hmr`、`dsh --patch`、`--dump-config` 的用法。
8. 版本兼容：本机 `dsh@0.2.2-rc.5`，本项目 peerDependencies 声明 `>=0.1.0-rc.6 <0.3.0`（部分为 `0.2.0-rc.2` devDeps）。学习者应如何判断一个插件与当前 dsh 版本兼容？

权威来源（按优先级）：

- 本机 `@deepseek-ai/dsh/docs/cookbook/extension-cookbook.zh.md`
- `docs/cordis-tutorial/01-first-plugin.zh.md` ~ `07-into-the-harness.zh.md`
- `docs/subsystems/core.zh.md`、`tools.zh.md`、`client-modules.zh.md`、`slots.zh.md`
- `docs/architecture.zh.md`、`docs/config-catalog.zh.md`
- 已安装包源码：`E:\nodejs\node-global\node_modules\@deepseek-ai\dsh\` 及其 `node_modules\@deepseek-ai\`
- `dsh --help`、`dsh plugin --help`

产出：

- 机制说明（按上面 8 问逐条）
- 最小工具插件 / 最小客户端插件的文件清单
- 可执行命令清单（构建、安装、启动、dump-config）
- 文档章节索引（路径 + 标题）

## Answer

1. **「插件」与「可安装包」是两层**：模块导出 `apply(ctx)` 即可被 Cordis 加载；而 `dsh plugin add` 只认在 `package.json` 中声明了 `dsh.bundle.patch` 的包，否则当作普通依赖安装并给出警告。
2. **最小可安装工具插件 = 3 件硬性文件**：插件模块（`name` / `inject` / `apply`）、`package.json`（含 `dsh.bundle.patch`）、`cordis.patch.yml`。TypeScript 与 `.d.ts` 是发布要求，不是加载前提。
3. **最小客户端插件的额外要求**：`dsh.client.platform: "web"`、`exports["./client"]`、以裸包名进入 Loader（子路径会被跳过）；客户端 bundle 必须是 `window.__ModuleLoader__.load({ id: <包名>, factory })` 形式的 classic script。
4. **最容易踩的坑**：模块导出的 `inject`（Cordis 服务依赖）与 `dsh.client.inject`（包级到达边）是两套不同机制；服务缺失只会静默 PENDING；patch 的 `config` 是整体替换而非深合并；未写稳定 `id` 会导致编辑配置时重挂。
5. **版本兼容**：只看 `engines.dsh`（存在则独占）或 `@deepseek-ai/dsh*` peer 范围，比较包含 prerelease；devDependencies 不参与。本项目 `>=0.1.0-rc.6 <0.3.0` 实测兼容 `0.2.2-rc.5`。
6. 文档还记录了 `dsh plugin add` 的完整调用链、安装位置（`~/.dsh/profiles/<name>`）、本地/npm/git/tarball 差异，以及 `--dump-config`、`dsh-hmr`、`allow-version` 等命令清单。

完整研究：`.scratch/learn-dsh-plugin/research/01-dsh-plugin-minimal-chain.md`
