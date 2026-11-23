# 第 0 节延伸问答：Bundle、Profile 与启动机制整理

本文整理自学习 [`docs/learn-dsh-plugin/index.html`](./index.html) 第 0 节（「环境与最小插件」）过程中的提问与解析，聚焦 **Bundle / Profile 的概念模型、包命名规范、`dsh-headless` 运行机制与 Profile 创建方式**。

---

## 目录

1. [Bundle 与 Profile 分别是什么？启动时怎么拼在一起？](#1-bundle-与-profile-分别是什么启动时怎么拼在一起)
2. [包名前面的 `@`（如 `@deepseek-harness-tui/dsh-tui`）有什么区别？加 `@` 更规范吗？](#2-包名前面的-如-deepseek-harness-tuidsh-tui有什么区别加-更规范吗)
3. [`dsh-tui` 已经有独立 Profile，为什么还会出现在 `web` 的 `package.json` 里？](#3-dsh-tui-已经有独立-profile为什么还会出现在-web-的-packagejson-里)
4. [只有 `dsh-base` 和 `dsh-headless` 两个包，就能用 DSH 的 Agent 功能了吗？](#4-只有-dsh-base-和-dsh-headless-两个包就能用-dsh-的-agent-功能了吗)
5. [为什么执行 `dsh smoke` 会报错 `error: a task is required`？](#5-为什么执行-dsh-smoke-会报错-error-a-task-is-required)
6. [一个新 Profile（如 `smoke`）是怎么创建的？一共有几种方式？](#6-一个新-profile如-smoke是怎么创建的一共有几种方式)
7. [`cordis.patch.yml` 里的 `- insert:` 作用是什么？为什么不能直接写 `- id:`？](#7-cordispatchyml-里的--insert-作用是什么为什么不能直接写--id)

---

## 1. Bundle 与 Profile 分别是什么？启动时怎么拼在一起？

### 第一性原理：为什么需要这两个概念？

DSH 底层基于 **Cordis** 插件框架，**不存在写死的特权内核**：模型适配器、工具注册表、会话日志、沙箱策略、Web Server、CLI Runner 全都是独立插件。由此产生两个基本工程问题：

1. **复用与分发问题**：如何把「插件代码 + 默认装配方式/默认配置」打包成一个可复用的单元？ → **Bundle（组合包）**
2. **多形态运行与环境隔离问题**：同一台机器需要同时跑网页端（`web`）、无头命令行（`headless`）、终端 UI（`dsh-tui`）或测试沙盘（`smoke`），如何互不干扰地选择不同的运行入口、第三方插件和模型配置？ → **Profile（配置集）**

### 概念对比

| 维度 | Bundle（组合包） | Profile（配置集） |
|---|---|---|
| **定位** | 零件 / 积木层（可被多个 Profile 复用） | 整机组装方案 / 独立运行环境实例 |
| **存在形式** | 一个 npm 包（本地目录或 registry 包） | `~/.dsh/profiles/<name>/` 下的独立项目目录 |
| **核心声明** | `package.json` 中的 `dsh.bundle.patch` | `package.json` 中的 `dsh.profile.bundles` |
| **包含内容** | 插件模块代码 + `cordis.patch.yml`（默认插入条目与配置） | 依赖清单（`dependencies`）、Bundle 叠加顺序、本环境专属的 `cordis.patch.yml` |

按职责体量，Bundle 通常分三类：
- **底座 Bundle**：如 `@deepseek-ai/dsh-base`，一次性插入核心能力（tools、session、llm、sandbox 等），**不包含启动入口（App）**。
- **App 入口 Bundle**：如 `@deepseek-ai/dsh-web-app`（Web 服务）、`@deepseek-ai/dsh-headless`（一次性 CLI 运行器），提供启动驱动器并禁用不适合该形态的底座条目（例如 `dsh-headless` 禁用了 `hmr`、`credentials`、`deepseek-account`）。
- **功能/三方插件 Bundle**：如 `dsh-claude-delegate` 或第 0 节的最小插件，通常只插入自己的 1 个或几个插件条目。自己写的 DSH 插件，在包管理视角下就是一个**单插件 Bundle**。

### 启动时的叠加链路

执行 `dsh --profile <name>` 时，DSH 从一张**空插件条目列表 `[]`** 开始，按顺序逐层应用 YAML patch：

```text
空列表 []
  ├─ 1. 按 dsh.profile.bundles 数组顺序依次应用每个 Bundle 的 cordis.patch.yml
  │       例如：@deepseek-ai/dsh-base -> @deepseek-ai/dsh-headless -> 第三方插件
  ├─ 2. 当前 Profile 自己的 ~/.dsh/profiles/<name>/cordis.patch.yml（环境级覆写）
  ├─ 3. 全局 ~/.dsh/cordis.patch.yml（Home 级覆写）
  └─ 4. 命令行临时 --patch <overlay.yml>（开发期免安装挂载 file:/// 源码）
```

> **核心规则**：patch 按条目的 `id` 定位；修改 `config` 时是**整体替换**整个 `config` 对象，而不是深合并（未写出的字段会回退到插件代码的 `Config` schema 默认值）。

### 用这个模型理解第 0 节的两个实测坑

1. **`--dump-config` 看到条目 ≠ 插件加载成功**：`--dump-config` 只执行到上面的 **1~4 步 YAML 拼装**并打印结果，**不 `import()` 任何 JS 模块，也不运行 `apply(ctx)`**。必须实际 boot 一次才能验证代码是否真能跑。
2. **新建 Profile 直接启动为什么会静默挂起**：`dsh plugin --profile <name> add` 初始化出的新 Profile，默认 `bundles` 里只有 `["@deepseek-ai/dsh-base", "你的插件"]`，没有 App 入口 Bundle。底座挂载完后没有前端或 CLI runner 接管输入与退出，进程就会一直挂起，直到把 `@deepseek-ai/dsh-headless`（或 `web-app`）加进 `bundles`。

---

## 2. 包名前面的 `@`（如 `@deepseek-harness-tui/dsh-tui`）有什么区别？加 `@` 更规范吗？

这是 **npm 包命名规范**的区别，**DSH 的插件加载器对两者一视同仁**（只认 `package.json` 里的 `dsh.bundle.patch`）：

- **带 `@` 的是 Scoped Package（作用域包）**：格式为 `@作用域/包名`，例如 `@deepseek-ai/dsh-base`（官方组织作用域）、`@deepseek-harness-tui/dsh-tui`（独立项目作用域）。
- **不带 `@` 的是 Unscoped Package（无作用域/顶层包）**：直接占用 npm 全局顶层命名空间，例如 `dsh-claude-delegate`、`dsh-better-sidebar`、`dshmarket`。

### 为什么工程实践上加 `@scope/` 更规范？

1. **避免全球抢注与命名冲突**：无作用域包名是全局扁平池、先到先得；带 `@你的用户名/` 或 `@组织名/` 后，命名空间独立归属，不会撞名。
2. **归属与信任边界一目了然**：看到 `@deepseek-ai/*` 就能区分官方包与社区包，也更容易防范仿冒包。
3. **便于企业/团队镜像分流**：`.npmrc` 支持配置 `@company:registry=...`，按作用域把私有包和公网包路由到不同源。
4. **方便多包拆分子包**：主包、协议包、CLI 包可以统一收拢在同一个 `@scope/` 下管理。

### 什么时候不加 `@` 也合理？

- 仅在本地开发测试、不打算发到 npm（如 `dsh-plugin-smoke`）；
- 追求单体插件名字简短好敲（如 `dsh plugin add dsh-pocket`）。

### 发布时的注意事项

如果以后自己开发并公开发布带 `@` 的插件（例如 `@your-name/dsh-xxx`），因为 npm 对作用域包**默认按私有处理**，必须在 `package.json` 中显式声明公开访问：

```json
"publishConfig": {
  "access": "public"
}
```

---

## 3. `dsh-tui` 已经有独立 Profile，为什么还会出现在 `web` 的 `package.json` 里？

先厘清概念：**`@deepseek-harness-tui/dsh-tui` 本质是一个 Bundle（npm 包），不是 Profile**。

- `~/.dsh/profiles/dsh-tui/package.json` 是一个专门单独跑 TUI 的 Profile（只叠了 `dsh-base` + `dsh-tui`）。
- `~/.dsh/profiles/web/package.json` 里也安装了它，通常是因为曾经在 `web` profile 下执行过安装（例如通过市场插件或 `dsh plugin --profile web add @deepseek-harness-tui/dsh-tui`）。

### 它在 `web` 里声明了有什么实际作用？

`@deepseek-harness-tui/dsh-tui` 内部专门实现了与 Web 共存的逻辑，在 `web` profile 中加载时会做三件事：

1. **挂载 TUI 专属扩展服务并让位给 Web 已有服务**：
   它的 `cordis.patch.yml` 会插入 `dsh-tui-workspaces`、`dsh-tui-panels`、`dsh-tui-extensions`、`dsh-tui-auth` 等服务；而对 `storage`、`workspace`、`webserver`、`agent-preset-registry` 这类和 `dsh-web-app` 重叠的条目，会通过 `!!js` 检测正式条目是否已在树中，检测到就自动 `disabled: true` 让位。
2. **根据运行终端类型决定是否画 TUI 界面**（`stdout.isTTY` 检查）：
   - **非交互宿主**（后台启动、桌面端拉起、管道重定向，`stdout.isTTY === false`）：打印 `non-interactive host detected; skipping the TUI frontend` 后静默跳过前端渲染，仅保留 Web 后台。
   - **直接在交互式终端运行 `dsh --profile web`**（`stdout.isTTY === true`）：单进程同时跑 Web 服务，并在当前终端接管屏幕渲染 TUI（与 Web 共享 `~/.dsh/sessions` 与 `~/.dsh/storages`）。
3. **覆盖部分底座默认配置**：
   会禁用已被 preset 接管的一批旧工具条目，并在 Windows 下将默认 `sandbox-policy` / `approval` 调整为适合终端本地执行的策略（后置的 `web/cordis.patch.yml` 仍可继续覆盖它）。

### 取舍建议

- 如果需要「终端里一条命令同时起 Web 后台 + TUI 交互」或依赖它提供的扩展服务，可以保留；
- 如果只用浏览器访问 Web、终端另开独立 `dsh-tui`，留在 `web` 里会额外加载 TUI 依赖并在直接终端跑 `dsh --profile web` 时接管屏幕，可执行以下指令清理（不影响独立的 `dsh-tui` profile）：

```bash
dsh plugin --profile web remove @deepseek-harness-tui/dsh-tui
```

---

## 4. 只有 `dsh-base` 和 `dsh-headless` 两个包，就能用 DSH 的 Agent 功能了吗？

**包层面完全够用。** 这两个包正是官方拆出来的「最小可运行 Agent 组合」：

- **`@deepseek-ai/dsh-base`**：提供完整核心能力（`agent-loop`、JSONL 会话日志与持久化、`llm` 适配层、沙箱与审批策略，以及内置工具 `bash`/`pwsh`、`fs`、`fs-search`、`subagent`、`workflow`、`skill`、`web`、`todo` 等）。
- **`@deepseek-ai/dsh-headless`**：提供一次性 CLI 驱动器，负责解析任务参数、创建或按 `--session-id` 恢复 Agent、执行完整的多轮工具调用并输出最终结果后退出（支持 `--json` 事件流）。

### 唯一额外前提：模型路由 / 凭据

`dsh-headless` 在其 `cordis.patch.yml` 中刻意禁用了交互式凭据和账号登录（`credentials`、`authorization`、`deepseek-account` 均为 `disabled: true`），因此包装齐后，必须二选一解决模型调用来源：

1. **使用默认 `deepseek-official` 路由**：启动前在环境变量中提供 `DEEPSEEK_API_KEY`。
2. **使用自定义网关**：在对应 profile 的 `cordis.patch.yml` 中配置 `llm-pi-ai`（provider / baseURL / headers / models）与 `agent-default-model`。

### 能力边界

只带这两个包时，**Agent 的推理、工具调用与会话接续能力是完整的**；缺少的只是交互外壳（无 Web/TUI 界面、无 HTTP Server、无 HMR 热重载），且每次命令为一次性执行（one-shot）。

---

## 5. 为什么执行 `dsh smoke` 会报错 `error: a task is required`？

```text
$ dsh smoke
error: a task is required, for example: dsh --profile headless "run the tests"
```

这个报错实际上是个**好消息**：说明 `smoke` profile 的配置解析成功，并且已经顺利启动到了 `dsh-headless` 的入口。

### 背后常见两个误解

1. **把 `dsh-headless` 当成了交互式 REPL（进去后再打字）**：
   `smoke/package.json` 挂载的 App 入口是 `@deepseek-ai/dsh-headless`，它是**一次性命令行运行器**，没有交互式输入框，必须在命令末尾直接传入任务字符串，跑完打印结果就退出。如果需要多轮交互界面，对应的入口是 `dsh-web-app` 或 `dsh-tui`。
2. **忽略了 App 接管命令行子参数**：
   `dsh <profile>` 等价于 `dsh --profile <profile>`，后续参数会交给该 Profile 的 App 处理。常用参数包括：
   - 查看当前 Profile App 的可用参数：`dsh --profile smoke --help`
   - 正常执行任务：`dsh --profile smoke "用 echo 工具返回 hello"`
   - 续跑会话：`dsh --profile smoke --session-id <会话ID> "继续"`
   - 输出 JSON 事件流：`dsh --profile smoke --json "你的任务"`

### 隐藏卡点

如果当前试验 Profile（如刚建好的 `smoke`）的 `cordis.patch.yml` 是空数组 `[]`，即使补上任务字符串，若环境中未配置 `DEEPSEEK_API_KEY`，仍会在发起模型请求时失败。对应三种验证做法：

1. **只检查插件树拼装是否正确（不调模型）**：
   ```bash
   dsh --profile smoke --dump-config
   ```
2. **借用已配好模型路由的 `headless` Profile 实测插件**：
   - 将插件安装到 `headless`，或使用 `--patch <overlay.yml>` 临时挂载后带任务运行。
3. **让独立试验 Profile 自己能调通模型**：
   - 在 `~/.dsh/profiles/<name>/cordis.patch.yml` 中补齐可用的 `llm-pi-ai` 与 `agent-default-model` 配置（或提供 `DEEPSEEK_API_KEY`），再执行 `dsh --profile <name> "<任务>"`。

---

## 6. 一个新 Profile（如 `smoke`）是怎么创建的？一共有几种方式？

### 本机 `smoke` 的实际来历

1. 先执行 `dsh plugin --profile smoke add <最小插件路径>`，触发了 `dsh plugin` 在首次使用时的自动初始化，生成 `~/.dsh/profiles/smoke/`（初始 `bundles` 仅包含 `@deepseek-ai/dsh-base` 与该插件）。
2. 随后手动将 `@deepseek-ai/dsh-headless` 加入 `smoke/package.json` 的 `dsh.profile.bundles`，使其拥有可启动的 App 入口；之后再继续用 `dsh plugin --profile smoke add ...` 挂入其他测试插件。

### 创建新 Profile 的 3 种方式

#### 方式 A：从官方发行模板克隆（最推荐）

使用 `--from-default-profile <模板名>`（可选模板：`web`、`headless`、`sdk`、`sdk-minimal`、`acp`）：

```bash
dsh my-test --from-default-profile headless
```

- **特点**：直接克隆完整模板，**自带 App 入口**，不会遇到只有 `dsh-base` 导致静默挂起的问题（注：无任务参数时，`headless` 模板初始化后立即运行会提示 `a task is required`，此时目录已创建完成）。后续再通过 `dsh plugin --profile my-test add <路径或包名>` 安装插件即可。

#### 方式 B：用 `dsh plugin --profile <新名字>` 首次触发自动初始化

对尚未存在的 Profile 名执行插件管理命令：

```bash
dsh plugin --profile smoke add <本地路径或包名>
```

- **特点**：会自动初始化目录并生成精简骨架，但 **`bundles` 中只有 `@deepseek-ai/dsh-base` 和你装的包，没有 App 入口**；必须手动在 `package.json` 的 `dsh.profile.bundles` 里补上 `@deepseek-ai/dsh-headless` 或 `@deepseek-ai/dsh-web-app` 才能正常启动。

#### 方式 C：手动建目录并创建配置文件

在 `~/.dsh/profiles/<name>/` 下手动新建两个文件：
1. `package.json`：声明 `"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"] } }`
2. `cordis.patch.yml`：写入 `[]` 或所需的覆盖配置项

### 清理方法

Profile 是完全自包含的目录；不再需要某个试验 Profile 时，直接删除 `~/.dsh/profiles/<name>/` 文件夹即可，不会影响其他 Profile。

---

## 7. `cordis.patch.yml` 里的 `- insert:` 作用是什么？为什么不能直接写 `- id:`？

`cordis.patch.yml` 的顶层数组**不是「插件列表」，而是「补丁指令（patch）列表」**。根据 `dsh --profile <name> --dump-config-schema` 中的定义，每条指令只分两类语义：

1. **带 `insert:` 的指令（追加/插入新条目）**：
   向插件树里**新增**原本不存在的插件条目（若同级未指定 `id`，默认追加到根列表末尾；若同级指定了某 group 条目的 `id`，则插入该 group 的子列表内部）。
2. **不带 `insert:` 的指令（按 `id` 修改已有条目）**：
   拿这条指令的 `id` 去前几层已经建好的插件树里**查找现有条目**，然后替换提供的字段（例如整体替换 `config`、设置 `disabled: true`、修改 `inject` 等）。
   - 如果找不到目标 `id`，**DSH 会报警并跳过该条目**（不会帮你自动新建插件）；
   - 如果在这种修改指令里写了 `name`，它不是改名，而是**校验断言**：确认原条目的包名确实等于这个 `name`。

### 两种写法的实际分工

| 场景 | 写法 | 原因 |
|---|---|---|
| **插件自身的 `cordis.patch.yml` / `--patch` overlay** | 写 **`- insert:`** | 插件原本不在树里，必须声明「新增挂载」 |
| **用户在 Profile 的 `cordis.patch.yml` 改配置或禁用** | 直接写 **`- id: ...`**（不写 `insert:`） | 底座或插件 Bundle 已经把条目插进树里了，只需按 `id` 定位并覆写 |

因此，如果插件自己的 `cordis.patch.yml` 漏写了 `- insert:` 而直接写 `- id: claude-code`，DSH 会把它当成修改指令去树里找 `claude-code`，结果找不到目标而跳过，插件也就不会加载。

