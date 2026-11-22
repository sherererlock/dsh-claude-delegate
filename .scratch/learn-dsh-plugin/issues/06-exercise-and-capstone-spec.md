# 06 — 练习设计与毕业项目规格

Type: grilling
Status: resolved
Blocked by: 05

## Question

每个阶段的练习做什么？三个毕业项目候选的规格与验收标准是什么？

需要和用户一起拍板：

1. **每阶段一个「改项目」练习**，例如：
   - 给工具加一个配置项并让它影响行为
   - 给事件流加一种事件类型并让面板渲染
   - 给面板加一列/一个筛选
   - 给会话恢复加一个边界处理
   - 至少一道「把本项目的一处偏离改回官方推荐做法」的练习（对应 09 票的偏离清单）
   - 每个练习给出：题目、提示（不超过 3 条）、验收标准、参考实现位置。
2. **毕业项目三选一的详细规格**：
   - A. 文本统计工具插件：注册 tool + 配置 schema + 构建 + 安装；验收 = 能在 dsh 里调用并返回统计结果。
   - B. 外部 CLI 委托插件：子进程调用 + 事件映射 + 后台作业；验收 = 能看到实时输出与完成状态。
   - C. 客户端 UI 小组件：slot 注入 + React 组件 + 数据获取；验收 = 在 dsh web 里出现并随状态更新。
   - 每个候选给出：必须实现的功能、可选加分项、文件清单、验收清单、预估小时。
3. **毕业项目的验收方式**：如何证明「能独立开发简单插件」——能安装、能加载、有 README、有至少一个可演示行为、能解释自己的设计取舍。
4. **练习与 HTML 的交互**：练习在 HTML 里如何呈现（题目卡片、提示折叠、验收勾选、进度持久化）。

产出：

- 练习表（阶段 → 题目 → 提示 → 验收 → 参考位置）
- 三个毕业项目规格书
- HTML 练习区交互约定

## Answer

用户已确认：**每阶段 2–3 个必做练习**（不是 1 个）、**提示只给思路 + 参考位置**、**毕业项目保持三选一**、**每阶段一个 git 分支隔离**。

### 练习设计总则

- 每阶段 2–3 个必做练习，按「照着做 → 改一处 → 串起来」的梯度排列。
- 每个练习给：题目、≤3 条思路提示、参考位置（`文件:行号`）、验收标准；不给完整代码或 diff。
- 每阶段开始前从 `main` 建 `practice/stage-N` 分支；阶段验收通过后切回 `main`；分支可删除或保留供复习。
- 两条路径的取舍：阶段 4、5 的整组练习只在完整路径必做；阶段 1 的 1.3 在最短路径标为选做；其余练习两条路径都做。
- 每阶段 2–3 个练习共享一个「阶段动手验收」（对应 05 票的完成标志）。

### 练习清单

#### 阶段 0 — 环境与最小插件

**0.1 环境自检**
- 题目：记录 `node -v`、`npm -v`、`pnpm -v`、`dsh --version`；创建测试 profile；用 `dsh --dump-config` 导出配置。
- 提示：① `dsh --help` 看 profile 与 patch 参数；② profile 目录在 `~/.dsh/profiles/<name>`；③ `--dump-config` 打印组合后的插件树；④ 新 profile 默认只有 `@deepseek-ai/dsh-base`，没有 app，直接启动会静默挂起——要把 `@deepseek-ai/dsh-headless` 手动加进 `dsh.profile.bundles` 才能交互（08 票实测）。
- 参考：01 票产出、08 票 Answer、`README.md` 的安装章节。
- 验收：能说出插件装在哪里、`--dump-config` 里一个插件条目有哪些字段。

**0.2 写一个 echo 工具插件**
- 题目：创建最小工具插件（模块 + `package.json` + `cordis.patch.yml`），注册 `echo` 工具，参数 `{ text: string }`，返回 `{ echoed: string }`；构建并装进测试 profile。
- 提示：① 最小可安装插件的 3 件硬性文件见 01 票；② 纯 JS 直接用 `ctx.tools.register(原始 ToolDefinition)`，不必 import `defineTool`——那是 TS 的类型辅助（08 票实测）；③ 先不装任何依赖、不编译，把 `index.js` 跑通加载，再补 TS。
- 参考：`src/index.ts` 的工具注册段、`cordis.patch.yml`、08 票 Answer 里的最小 `index.js`。
- 验收：dsh 里能调用 `echo` 并看到 `echoed`；`--dump-config` 能看到插件条目。注意 `--dump-config` 只证明配置层组合，必须实际 boot 一次（哪怕只报 `a task is required`）才算模块加载成功。

**0.3 给 echo 加 prefix 配置**
- 题目：给插件加 `prefix: string` 配置（默认 `">"`），`echo` 结果带上前缀；用 patch 覆盖成 `"--"`。
- 提示：① Config 用 schemastery，给默认值；② patch 的 `config` 是整体替换，不是深合并；③ 改完用 `--dump-config` 确认。
- 参考：`src/index.ts` 的 `Config`、`cordis.patch.yml`。
- 验收：改 patch 后输出变化；能解释整体替换的坑。

#### 阶段 1 — TS + ESM/Node

**1.1 给 `delegate-model.ts` 加一个联合类型分支**
- 题目：在 `EFFORT_LEVELS` 和模型推导里加入 `'max'` 档，保持类型检查通过。
- 提示：① 先看现有返回类型，模仿写一个分支；② `as const` 让字面量数组保持窄类型；③ `typeof arr[number]` 取联合。
- 参考：`src/delegate-model.ts:1-36`。
- 验收：`npm run typecheck` 通过；能解释 `as const` 的作用。

**1.2 写 Node 脚本统计任务**
- 题目：用 ESM Node 脚本读取 `.dsh/tasks.json`，输出任务总数和每个状态的计数。
- 提示：① `node:fs/promises` 的 `readFile` + `JSON.parse`；② `node --input-type=module` 或 `.mjs`；③ 先打印原始结构再聚合。
- 参考：`.dsh/tasks.json`。
- 验收：脚本输出正确数字；能解释 ESM 与 CommonJS 的 `__dirname` 差异。

**1.3 抽一个纯函数并写断言**（完整路径必做，最短路径选做）
- 题目：从 `session-store.ts` 抽出「工作流名 + 目录 → session key」的纯函数（或写一个等价函数），用 `node:assert` 写 3 个断言。
- 提示：① 找现有 key 生成逻辑；② 纯函数不碰文件系统；③ `node:test` 或 `node:assert` 都能跑。
- 参考：`src/session-store.ts`。
- 验收：3 个断言全过；能说出为什么纯函数更容易测。

#### 阶段 2 — Cordis 与插件骨架

**2.1 加配置项并观察生效**
- 题目：在 `Config` 加 `greeting: string`，`apply` 启动时打印；用 patch 覆盖，观察输出。
- 提示：① schemastery 字段要给默认值；② `dsh --dump-config` 看最终配置；③ 打印放在 `apply` 开头。
- 参考：`src/index.ts:1-181`、`cordis.patch.yml`。
- 验收：启动日志出现自定义 greeting；能解释配置从 patch 到 `apply` 的路径。

**2.2 `inject` vs `ctx.get` 对照实验**
- 题目：把 `ctx.tools` 从 `inject` 移除，改用 `ctx.get('tools')`，观察加载状态；再改回 `inject`。
- 提示：① `src/index.ts:21-27` 有本项目的注释；② 硬依赖缺失时 fiber 会 PENDING；③ `ctx.get` 缺失返回 `undefined`。
- 参考：`src/index.ts:21-27`、`CHANGELOG.md` 0.4.1。
- 验收：能说出 PENDING 与 `undefined` 的差异；能解释 cordis 4.x optional-inject 的坑。

**2.3 注册并消费一个服务**
- 题目：在插件里注册一个 `claudeCodeDemo` 服务（`ctx.provide` / `ctx.set`），再从同插件或另一个最小插件里 `ctx.get` 消费。
- 提示：① 服务名不要和现有服务冲突；② 消费端用 `ctx.get` 而不是 `inject`，避免加载顺序问题；③ 观察卸载后服务是否消失。
- 参考：`src/remote.ts` 的服务注册段。
- 验收：服务能被取到；卸载后取不到；能画出注册/消费的时序。

#### 阶段 3 — 工具与技能

**3.1 给 `claude_code` 工具加 `label` 参数**
- 题目：在 `parameters` 加 `label?: string`，`execute` 使用它，并让结果/事件带上。
- 提示：① schemastery 可选字段用 `.optional()`；② `execute` 的参数是解析后的对象；③ 不要用 `any` 绕过类型。
- 参考：`src/index.ts` 的工具定义段。
- 验收：传 label 时结果包含它；不传时不报错。

**3.2 修工具契约的三处偏离**
- 题目：把 `args`/`value: any` 改成 `defineTool` 推断类型；给 `output.schema` 加 `required`；把 `permissionMode` 改成枚举。
- 提示：① 先让 typecheck 报错，再逐个修；② `z.union([...])` 做枚举；③ 非法配置应在加载时失败，而不是运行时静默。
- 参考：`src/index.ts` 的 `defineTool` 与 `Config`、09 票 D4/D5。
- 验收：typecheck 通过；非法配置能在启动时报错。

**3.3 写一个运行时技能**
- 题目：注册 `my-tips` 技能，内容是一段「何时使用 echo / text_stats」的简短规程。
- 提示：① `ctx.skills.register`；② `source: 'runtime'`；③ 先看 `delegation-skill.ts` 的 `SkillRegistration` 形状。
- 参考：`src/delegation-skill.ts`、`src/index.ts` 的技能注册段。
- 验收：技能列表可见；能被模型读取；卸载后消失。

#### 阶段 4 — 宿主业务载荷（完整路径必做）

**4.1 加 `notice` 事件并贯通**
- 题目：在 `ClaudeEvent` 联合加 `{ type: 'notice'; text: string }`，让 `tracker` 接受、`remote` 的 wire 校验放行、`EventView` 渲染成一行提示。
- 提示：① 先改类型，让编译器找出所有分支；② `client/api.ts` 有一段手写 wire 校验；③ `EventView` 的 switch 需要一个新分支。
- 参考：`src/tracker.ts`、`src/remote.ts`、`src/client/api.ts`、`src/client/EventView.tsx`。
- 验收：面板显示 notice；typecheck 通过；没有漏掉的分支。

**4.2 替换已弃用的 `stateOf`**
- 题目：把 `sessionProjections.stateOf(session, key)` 替换为 `exec.agent.model.current()`（或官方推荐的 awaited `handle.stateOf`）。
- 提示：① 先看 `src/index.ts:194-215` 的上下文；② 官方 upgrade-guide 说旧 API 已弃用；③ 替换后跑一次真实委派。
- 参考：`src/index.ts:194-215`、09 票 D1、官方 `upgrade-guide/v0.2.1-rc.2`。
- 验收：typecheck 通过；运行时行为不变；能说出为什么弃用。

**4.3 跟一遍后台作业取消链路**
- 题目：跟 `ctx.jobs.start` → `run` → `cancel` / `kill` 的路径，在关键点加日志，跑一次取消。
- 提示：① `remote.ts` 与 `tracker.ts` 都有作业相关代码；② 官方推荐 `ctx.jobs.readAt` / `kill`；③ 用日志证明 cancel 真的到了子进程。
- 参考：`src/remote.ts`、`src/tracker.ts`、09 票 D3。
- 验收：日志能证明取消链路；能解释前台/后台作业的差异。

#### 阶段 5 — 客户端 React 与面板（完整路径必做）

**5.1 给任务列表加状态筛选**
- 题目：在 `ClaudeCodeView` 加一个状态筛选控件（如只看 running / failed），用 `useMemo` 过滤三路合并后的数组。
- 提示：① 先找到三路 job 源合并后的数组；② `useMemo` 的依赖数组不要漏；③ 不要改数据源，只改渲染。
- 参考：`src/client/ClaudeCodeView.tsx`。
- 验收：筛选可切换；1 秒轮询不被破坏。

**5.2 把 `installStyles()` 包进 `ctx.effect`**
- 题目：给 `styles.ts` 加 `removeStyles()`，在 `client/index.ts` 用 `ctx.effect` 注册清理。
- 提示：① `ctx.effect` 的 cleanup 在卸载/HMR 时执行；② 当前 `installStyles` 是一次性注入；③ 09 票 D11 有说明。
- 参考：`src/client/styles.ts`、`src/client/index.ts`、09 票 D11。
- 验收：卸载后 `<style>` 标签被移除；HMR 不重复注入。

**5.3 加一个 `StatusBadge` 组件**
- 题目：写一个轻量组件显示当前选中任务的状态，从现有 props 或 `api` 取数，接入 `ClaudeCodeView`。
- 提示：① `client/types.ts` 有 wire 类型；② 先只做只读展示；③ 样式加进 `styles.ts` 的类名表。
- 参考：`src/client/types.ts`、`src/client/ClaudeCodeView.tsx`、`src/client/styles.ts`。
- 验收：面板出现徽标并随选中任务更新。

#### 阶段 6 — 构建、打包、安装、调试

**6.1 新增模块并更新产物断言**
- 题目：加 `src/version.ts` 导出 `PLUGIN_VERSION`，在 `index.ts` 引用；更新 `scripts/assert-artifacts.mjs`；构建。
- 提示：① `tsconfig.json` 的 include 会自动带上新文件；② `assert-artifacts` 是手写清单；③ 客户端新增模块还要改 `tsconfig.client.json` 与 `build-client` 入口。
- 参考：`scripts/assert-artifacts.mjs`、`tsconfig*.json`。
- 验收：`npm run build` 通过；断言覆盖新产物。

**6.2 改版本范围并判断兼容**
- 题目：把 peer 范围改成 `>=0.2.0 <0.3.0`，判断是否仍兼容本机 `0.2.2-rc.5`；再改回。
- 提示：① 版本比较包含 prerelease；② `engines.dsh` 存在时独占；③ devDependencies 不参与兼容判断。
- 参考：01 票的版本规则、`package.json`。
- 验收：判断有依据；能解释为什么 `0.2.2-rc.5` 在范围内。

**6.3 模拟一次安装与调试**
- 题目：用测试 profile 安装本地构建的插件，故意引入一个 patch `id` 错误，用 `--dump-config` 和启动日志定位并修复。
- 提示：① 先看 `--dump-config` 里条目是否出现；② 启动日志会指出缺失的服务/模块；③ 01 票有「未写稳定 id 会重挂」的坑。
- 参考：01 票的坑清单、`~/.dsh/profiles/<name>`。
- 验收：能定位并修复；能说出调试路径。

#### 阶段 7 — 毕业项目（三选一）

### 毕业项目规格

#### A. 文本统计工具插件（12–16h，推荐默认）

必须实现：
1. 注册 `text_stats` 工具，参数 `{ text: string, maxBytes?: number }`，返回字符数、词数、行数、最长行。
2. 用 schemastery 做参数校验；`maxBytes` 超限返回清晰错误。
3. `Config` 加 `maxBytes` 默认值 10000。
4. 构建 `lib/index.js`，通过 `dsh plugin add` 装进测试 profile。
5. README：安装、配置、调用示例、已知限制。

可选加分：
- 客户端面板显示最近 10 次统计。
- 运行时技能，教模型何时使用这个工具。
- 用 `ctx.jobs` 做后台大文件统计。

文件清单：`package.json`、`tsconfig.json`、`cordis.patch.yml`、`src/index.ts`、`README.md`。

验收清单：dsh 能调用并返回正确统计；超限返回清晰错误；README 能照做复现；能解释 `defineTool` 四段式；参数/输出 schema 完整。

对应阶段：0、2、3、6、7；可选 5。

#### B. 外部 CLI 委托插件（16–20h）

必须实现：
1. 注册 `run_cli` 工具，参数 `{ command: string, args?: string[] }`，只允许白名单命令（如 `git`）。
2. 用 `node:child_process` 执行，转发 `AbortSignal`。
3. 用 `ctx.jobs.start` 注册后台作业，实时 append stdout/stderr；结果用 `JobOutcome.result`。
4. 用 `ctx.jobs.readAt` 读输出，`ctx.jobs.kill` 取消；不要自建文本环。
5. README。

可选加分：客户端面板；错误映射；输出分页；超时。

文件清单：`src/index.ts`、`src/cli-runner.ts`、`package.json`、`cordis.patch.yml`、`README.md`；可选 `src/client/`。

验收清单：能启动、看到流式输出、能取消、超时生效；能解释前后台差异；没有重复造官方的 jobs API。

对应阶段：0、2、3、4、6、7；可选 5。

#### C. 客户端 UI 小组件（12–16h）

必须实现：
1. 注册 `conversation.view` slot 或在一个现有视图加一个面板，显示当前会话的工具调用次数。
2. 通过 `connection.rpc.call` 或一个自建 remote 服务从宿主拿数据。
3. React 组件 + hooks；样式注册与清理（`ctx.effect`）。
4. 构建客户端 bundle（`window.__ModuleLoader__.load`）。
5. README。

可选加分：自动刷新；深/浅色；错误态；空状态。

文件清单：`src/client/index.ts`、`src/client/View.tsx`、`src/client/api.ts`、`package.json`（`dsh.client`）、`tsconfig.client.json`、构建脚本、`README.md`。

验收清单：在 dsh web 里出现小组件并随状态更新；卸载后无样式残留；`dsh.client.platform` / `exports["./client"]` 正确。

对应阶段：0、2、3（最小宿主）、5、6、7。

### 毕业项目统一验收

1. **能安装**：`dsh plugin add` 成功，`--dump-config` 出现条目。
2. **能加载**：启动 profile 无报错，工具/UI 可用。
3. **有 README**：安装、配置、调用示例、已知限制。
4. **至少一个可演示行为**：一条命令或一次点击能展示核心功能。
5. **能解释取舍**：为什么用这个插件形态；哪些按官方最佳实践；哪些参考了本项目的特有做法及原因。
6. **代码检查**：参数 schema 有校验；output schema 有 `required`；`timeoutMs` 不为 0；没有已弃用 API；资源有清理。

### HTML 练习区交互约定

- **练习卡片**：题目、提示（默认折叠，点击展开）、参考位置（`文件:行号` 链接）、验收标准（可勾选）。
- **进度存储**：`localStorage` 键形如 `dsh-learn:stage-0:exercise-0.2`；值为 `done` / 空。
- **总进度**：按阶段聚合，顶部显示百分比；可一键重置。
- **自测题**：每阶段 3–5 道开放题，答案折叠；不判分。
- **分支提示**：每个阶段卡片顶部显示 `git switch -c practice/stage-N` 的命令和「练完切回 main」提醒。
- **毕业项目**：三张规格卡；选定一个后高亮，其余折叠；验收清单可勾选。
- **最短/完整路径**：顶部切换开关；选最短路径时，阶段 4、5 的练习卡片折叠并标注「完整路径内容」。
