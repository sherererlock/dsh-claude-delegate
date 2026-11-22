# 05 — 阶段划分与每阶段验收标准

Type: grilling
Status: resolved
Blocked by: 01, 02, 03, 04, 09

## Question

学习路线应切成哪几个阶段？每阶段的目标、必修/选读、完成标志是什么？

需要和用户一起拍板：

1. 阶段数量与顺序。建议基线（可改）：
   - 阶段 0：环境准备与「最小插件」跑通（对应 08 票的产出）
   - 阶段 1：Cordis 最小概念 + 本插件入口（`src/index.ts` 的 `name` / `inject` / `apply`）
   - 阶段 2：配置 schema 与工具注册（`Config`、`defineTool`）
   - 阶段 3：作业、事件与实时输出（`tracker.ts`、`remote.ts`、`live-shell.ts`）
   - 阶段 4：会话持久化与恢复（`session-store.ts`、`output-file.ts`）
   - 阶段 5：客户端面板（`client/index.ts`、`api.ts`、`ClaudeCodeView.tsx`、`EventView.tsx`）
   - 阶段 6：构建、打包、安装与调试（两套 tsconfig、esbuild、`assert-artifacts`）
   - 阶段 7：毕业项目（三选一）
2. 每阶段的「完成标志」：能回答什么问题 / 能改出什么可见效果 / 能通过什么自测。
3. 必修与选读的划分（尤其阶段 3–5 的特殊实现）。
4. 前置补课插在哪些阶段（与 04 票的补课清单对齐）。
5. 每阶段的预估小时数与「最短路径 / 完整路径」两条路线。
6. **官方最佳实践与偏离的教学安排**：在哪些阶段插入「官方推荐 vs 本项目做法」对照；哪些偏离要作为独立小节；哪些只在源码旁标注一句警告（与 09 票的 15 个偏离清单对齐）。

产出：

- 阶段表：阶段名 → 目标 → 覆盖模块 → 官方文档章节 → 练习 → 完成标志 → 预估小时
- 必修/选读标记
- 两条学习路径（最短 / 完整）

## Answer

用户已确认：**8 阶段结构、保留两条路径、最佳实践内联标注 + 末尾总表、每阶段开放题 + 动手验收**。

### 阶段表

| 阶段 | 目标 | 覆盖模块 / 内容 | 官方文档 | 练习方向 | 完成标志 | 预估 |
|---|---|---|---|---|---|---|
| **0 环境与最小插件** | 建立「插件是什么、装到哪、怎么被加载」的实物感 | 版本检查；最小工具插件 3 件硬性文件；`dsh plugin add`；`--dump-config`；启动 profile 调用工具 | cordis-tutorial/01；cookbook/extension-cookbook；architecture（Profile/组合包） | 写一个 `echo` 工具插件并装进测试 profile | 能在 dsh 里调用自己写的工具并看到返回 | 2–3h |
| **1 TS + ESM/Node 够用集** | 能读懂源文件的类型标注与 Node 调用 | 联合类型与收窄、泛型、`as const`、模块、`fs/path/spawn`、Promise/AbortSignal；跳过 `satisfies`、交叉类型、事件循环深水区 | 04 票列出的 TS Handbook / MDN 入口 | 给 `delegate-model.ts` 加一个联合类型分支；用 Node 脚本读写 JSON | 读懂 36 行的 `delegate-model.ts` 并改一处类型 | 8–10h |
| **2 Cordis 与插件骨架** | 理解 `name`/`inject`/`apply`、service、fiber、Config schema | `src/index.ts:1-181`；`apply` 注册段；`remote.ts` 服务注册（略读） | cordis-primer；cordis-tutorial 02–05；subsystems/core | 加一个配置项并让它在启动时打印；把一处 `inject` 服务改成 `ctx.get` 体会区别 | 能解释启动时注册了什么；改配置能生效 | 6–8h |
| **3 工具与技能** | 能独立写带参数校验的工具和运行时技能 | `defineTool` 四段式、`ctx.tools.register`、`ctx.skills.register`、`presentCall`、`timeoutMs`；`index.ts` 工具定义；`delegation-skill.ts`（略读） | cookbook/adding-a-tool；subsystems/tools；subsystems/skills | 加一个工具参数并让 `execute` 使用；写一个最小运行时技能 | 独立写出能被模型调用、参数有校验的工具 | 6–8h |
| **4 宿主业务载荷**（完整路径必修，最短路径跳过） | 读懂一次委派从工具调用到 SDK 消息流 | `tracker` → `session-store` → `output-file` → `remote` → `index` 的 `execute`/`buildQueryOptions`/`runClaude`；`live-shell` 选读 | subsystems/jobs、persistence、session、subagent；cookbook/adding-an-llm-adapter（对照） | 加一种事件类型并让 tracker/remote 传递；把一处 `stateOf` 改成 `agent.model.current()`；读懂后台 job 取消路径 | 画出「工具调用 → SDK → 事件 → remote」完整链路；能加一种事件 | 12–14h |
| **5 客户端 React 与面板**（完整路径必修，最短路径跳过） | 能读懂并小改客户端面板 | `client/types` → `api` → `OutputView`（hooks 手感）→ `EventView` → `ClaudeCodeView` → `client/index`；`styles`/`md` 选读 | subsystems/client-modules、slots、conversation、web-client | 加一个筛选/一列；把 `installStyles()` 包进 `ctx.effect` | 面板上出现由你添加的可见元素并能读宿主数据 | 10–12h |
| **6 构建、打包、安装、调试** | 能自己构建、安装、调试插件 | 两套 tsconfig；esbuild；`assert-artifacts`；`package.json` 的 `dsh`/`exports`/`files`；`cordis.patch.yml`；版本兼容 | subsystems/core；config-catalog；cordis-tutorial/06 | 新增一个模块并让产物断言通过；改版本范围并判断兼容性 | 构建并本地安装成功；新增模块不遗漏 | 4–6h |
| **7 毕业项目** | 独立开发一个简单插件，按官方最佳实践写 | 三选一：文本统计工具 / 外部 CLI 委托 / 客户端 UI 小组件；需求、设计、实现、构建、安装、README、演示 | 按所选项目回查 | 毕业项目本身 | 安装、加载、README、至少一个可演示行为、能解释取舍 | 12–16h |

### 两条路径

- **最短路径（约 35h）**：0 → 1（精简）→ 2 → 3 → 6 → 7。跳过 4/5 的本项目业务载荷；阶段 1 只学读类型和 Node 基础。目标是「能独立开发简单插件」的最低闭环。
- **完整路径（约 60–77h）**：0 → 1 → 2 → 3 → 4 → 5 → 6 → 7。覆盖全部 20 个源文件，目标是「吃透本项目」。

### 官方最佳实践与偏离的教学安排

- **每阶段内联**：遇到本项目做法与官方不一致时，用固定五段式标注：`官方推荐 → 本项目做法 → 差异 → 原因 → 你该怎么做`。
- **阶段 7 前插入「总对照表」**：汇总 09 票的 15 个偏离和 8 个灰色地带，作为毕业前的检查清单。
- **三张清单贯穿**：可以照抄（09 §6.1）/ 不要照抄（§6.2）/ 只作为本项目知识（§6.3）。
- 每阶段末尾至少标出该阶段涉及的「不要照抄」条目；阶段 4、5 是偏离密集区，需要重点标注。

### 自测约定

- 每阶段 3–5 道开放题，答案折叠；不判分，只要求能用自己的话答出来。
- 每阶段一个动手验收，对应上表的「完成标志」。
- 复习节点：阶段 3 后、阶段 5 后、阶段 7 前，各用自测题 + 总对照表做一次回顾。

### 必修 / 选读

- **必修（两条路径都走）**：0、2、3、6、7。
- **完整路径必修、最短路径跳过**：4、5。
- **阶段 1**：两条路径都走，但最短路径可精简到「读类型 + 看懂 Node 调用」。
- **选读**：`live-shell.ts`、`delegation-skill.ts` 正文、`styles.ts` CSS 正文、`md.ts`、`PersistedOutput.tsx`、`JobDetailModal.tsx` 等 02 §6.3 列出的模块。
