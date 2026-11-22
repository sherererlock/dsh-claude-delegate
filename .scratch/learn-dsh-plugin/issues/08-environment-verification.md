# 08 — 环境验证：最小插件能否跑通

Type: task
Status: resolved
Blocked by: —

## Question

本机能否按计划跑通「最小插件」的构建与本地安装链路？实际命令、版本与坑是什么？

需要实际执行（**联网前先让用户确认 exe 是否在白名单**；已知 `node` / `npm` / `pnpm` 在白名单）：

1. 记录 `node -v`、`npm -v`、`pnpm -v`、`dsh --version`。
2. 在临时目录（仓库外，单独空目录）建一个最小插件：`package.json` + 一个导出 `name` / `inject` / `apply` 的入口。
3. 安装最小依赖并构建出 `lib/`。
4. 用文档给出的方式挂进 profile（`dsh plugin --profile <test-profile> add <path>` 或 `--patch` 临时覆盖），确认插件被加载（`dsh --dump-config` 能看到条目）。
5. 启动一个可交互 profile（如 web/headless），确认工具或客户端扩展真的出现。
6. 记录每一步的报错、原因与修正；对比本项目 `peerDependencies` 与已安装 `dsh@0.2.2-rc.5` 的兼容情况。
7. 清理临时 profile / 目录，或在票里记录保留位置。

产出：

- 可复现的最小命令序列（供 HTML 的「环境准备」阶段直接引用）
- 版本矩阵
- 已知坑清单

## Answer

2026-11-20 实测。**结论：整条链路可以跑通**，唯一卡住的是最后一步「让模型真的调用工具」——本机 TowerAI 凭据过期（401），与插件无关。所有能离线验证的环节全部通过，包括插件加载、工具注册、工具执行。

### 版本矩阵

| 组件 | 实测版本 | 位置 |
|---|---|---|
| node | v24.14.0 | `C:\Program Files\nodejs\node.exe` |
| npm | 11.20.0 | 同上 |
| pnpm（系统） | 11.21.0 | 同上 |
| pnpm（dsh 内部使用） | 11.7.0 | dsh 转发 `plugin` 命令时自报，**与系统 pnpm 不同** |
| dsh | 0.2.2-rc.5 | `E:\nodejs\node-global\dsh` |
| `@deepseek-ai/dsh-tools` | 0.2.2-rc.5 | `C:\Users\ruizu\.dsh\profiles\node_modules\` |
| typescript（全局） | 6.0.3 | `E:\nodejs\node-global\node_modules\typescript` |
| typescript（本项目要求） | `^5.4.5` | 本项目 `devDependencies` |

`@deepseek-ai/dsh-tools` 的版本号与 dsh 版本号一致（都是 `0.2.2-rc.5`），所以「按 `@deepseek-ai/dsh*` peer 范围判断兼容」时，可以把它当作 dsh 版本处理。

### 可复现的最小命令序列

```bash
# 0. 版本自检（离线）
node -v && npm -v && pnpm -v && dsh --version

# 1. 建最小插件：一个目录、三个文件
#    package.json  -> name / type:module / main / dsh.bundle.patch
#    index.js      -> export const name / inject / export function apply(ctx)
#    cordis.patch.yml -> - insert: [{ id, name }]

# 2a. 开发期挂载（零安装、零构建）——改完源码重启即生效
dsh --profile headless --patch ./patch-overlay.yml --dump-config   # 只看配置层组合
dsh --profile headless --patch ./patch-overlay.yml                 # 真正 boot 并加载模块

# 2b. 正式安装到测试 profile（本地路径，实测不联网）
dsh plugin --profile smoke add E:/workspace/GitRepository/dsh-plugin-smoke
dsh --profile smoke --dump-config | grep smoke
dsh --profile smoke                                                # 启动加载

# 3. 卸载
dsh plugin --profile smoke remove dsh-plugin-smoke

# 4. 版本不兼容时的显式豁免（仅在明确知道风险时）
dsh plugin --profile smoke allow-version <pkg>@<ver> --dsh-version 0.2.2-rc.5 --accept-risk
```

`patch-overlay.yml` 的写法（开发期直接指向源码，不安装）：

```yaml
- insert:
    - id: dsh-plugin-smoke
      name: file:///E:/workspace/GitRepository/dsh-plugin-smoke/index.js
```

注意 `file:///` 是三条斜杠，路径用正斜杠；`id` 必须是稳定字符串，否则编辑配置时会重挂。

`cordis.patch.yml` 的写法（装成 bundle 后由 `dsh plugin add` 自动纳入 `dsh.profile.bundles`）：

```yaml
- insert:
    - id: dsh-plugin-smoke
      name: dsh-plugin-smoke
```

### 最小工具插件的真实形态（重要修正）

01 票说「用 `defineTool`」，实测发现更根本的事实：

- **`ctx.tools.register()` 直接接受原始 JSON Schema `ToolDefinition`**，`defineTool` 只是第一方 TS 工具的类型辅助函数。官方 cookbook 明确写了这一点（MCP 来源的工具就是这样注册的）。
- 所以**零依赖、零构建、纯 JS 的最小插件是可行的**，不需要 `npm install` 任何东西。
- `ToolDefinition` 的最小必填字段：`name`、`description`、`parameters`（标准 JSON Schema）、`output.schema`（标准 JSON Schema）、`output.render(args, value) => ContentBlock[]`、`execute(args, exec) => Promise<value>`。
- `execute` 的返回值必须能被 `output.schema` 校验；`render` 负责把值变成模型可见的 `[{ type: 'text', text }]`。

实测的最小 `index.js`（已验证可加载、可注册、可执行）：

```js
export const name = 'dsh-plugin-smoke'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'echo',
    description: 'Echo the given text back, optionally with a prefix.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo back.' } },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { echoed: { type: 'string' } },
        required: ['echoed'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.echoed }],
    },
    async execute(args) {
      return { echoed: args.text }
    },
  })
}
```

### 验证到什么程度

| 环节 | 方式 | 结果 |
|---|---|---|
| 配置层组合 | `--patch` + `--dump-config` | ✅ 条目出现在 `# == <overlay 路径>` 注释下 |
| 模块加载 | 启动 headless，`apply` 写日志 | ✅ `loaded.log` 有记录 |
| 工具注册 | `ctx.tools.get('echo')` | ✅ 返回定义，`disposer` 是函数 |
| 工具执行 | 注册后直接 `execute({text:'smoke-ok'})` | ✅ 返回 `{"echoed":"smoke-ok"}` |
| 离线契约 | `node verify-offline.mjs`（mock ctx） | ✅ name/inject/apply/schema/execute/render 全部符合 |
| 本地安装 | `dsh plugin add <本地路径>` | ✅ `link:` 依赖，427ms，不联网 |
| 卸载 | `dsh plugin remove` | ✅ bundles 与 dump-config 都恢复 |
| 版本强制 | 故意写 `>=99.0.0` 的 peer | ✅ 安装被拒绝并给出 `allow-version` 命令 |
| 模型调用 | `--json` 发真实任务 | ✅ 事件流里 `tool_call tool=echo` → `tool_result result="smoke-ok"` → `final text="smoke-ok"` |

模型调用这一步第一次跑时失败过：headless 当时挂的是 `llm-towerai` 源码插件，凭据来自 `~/.towerai/state.json`（浏览器登录态换的短期 token，`last_refresh` 停在 2026-08-17），网关回 401 `{"error_code":600015,"error_msg":"access token过期"}`。与插件无关。

随后把 headless 改成和 web 相同的 yotta 路由（`llm-pi-ai` 的 `providers.yotta`，`anthropic-messages` + 固定 `Token` header，不依赖浏览器会话），重跑同一条命令，工具调用成功。原 patch 备份在 `~/.dsh/profiles/headless/cordis.patch.yml.bak-20261120`。

### 已知坑清单

1. **`--dump-config` 不加载模块。** 它只把 bundle / profile / overlay 三层 YAML 组合后打印。要证明模块真能 import，必须实际 boot 一次。这一点极易误判。
2. **新 profile 默认只有 `@deepseek-ai/dsh-base`，没有 app。** `dsh plugin --profile smoke add` 初始化出的 profile 启动后会静默挂起（实测 25s 超时）。要可交互，得手动把 `@deepseek-ai/dsh-headless`（或 web）加进 `package.json` 的 `dsh.profile.bundles` 再启动——实测加完就正常报 `a task is required`。
3. **peer 版本是强制检查，不是文档约定。** 不兼容的 peer 范围会让 `dsh plugin add` 直接拒绝，并打印 `allow-version ... --accept-risk` 豁免命令。错误信息里明确写「Running it may cause crashes or data loss」。
4. **dsh 用的是内置 pnpm 11.7.0**，不是系统的 11.21.0。排查 pnpm 行为时要看 `~/.dsh/profiles/<name>/.plugin-manager/logs/` 下的日志。
5. **本地路径安装完全不联网。** `pnpm add <本地目录>` 生成 `link:` 依赖，381–427ms 完成。只有从 registry 拉包才需要网络。
6. **全局 TypeScript 6.0.3 与本项目不兼容。** `^5.4.5` 的项目在 TS6 下会因 `baseUrl` 弃用直接报 `TS5101`（不是警告，是 error）。项目必须用自己的 `node_modules/typescript`。
7. **`tsc` 默认在类型错误时仍然产出 JS。** `noEmitOnError` 默认 false，所以看到 `lib/index.js` 不代表编译成功——必须看退出码和错误输出。
8. **TS 解析 `@deepseek-ai/*` 需要插件目录自己的 `node_modules`。** 只靠 `tsconfig.paths` 指到绝对路径在 TS6 下没生效；实际可行的替代是用目录 junction 把 `~/.dsh/profiles/node_modules/@deepseek-ai` 和 `@types` 链进来。
9. **`output.schema` 是 `ValueSchemaSpec`，不是裸 JSON Schema。** 对象形式不接受 `required` 键（类型报错 `'required' does not exist in type 'ObjectValueSchemaSpec'`），对象里的字段默认全必填。想用完整 JSON Schema 就走原始 `ToolDefinition` 路线。
10. **靠浏览器登录态换 token 的网关会过期，且 headless 下无法自动续期。** 本机原 headless 用 `llm-towerai` 源码插件读 `~/.towerai/state.json`，三个月后 401 `{"error_code":600015,"error_msg":"access token过期"}`。改用 `llm-pi-ai` 的固定 `Token` header 路由后正常。给学习者选 provider 时优先固定 API key / 固定 token，不要依赖浏览器会话。

### 保留位置与清理

- 插件与验证脚本：`E:\workspace\GitRepository\dsh-plugin-smoke\`
  - `index.js`、`package.json`、`cordis.patch.yml` — 最小插件本体
  - `patch-overlay.yml`、`patch-overlay-ts.yml` — 开发期挂载用的两个 overlay
  - `ts-src/index.ts`、`tsconfig.smoke.json`、`lib/` — TS 版本与编译产物
  - `verify-offline.mjs` — 不启动 dsh 的契约验证脚本
  - `node_modules/@deepseek-ai`、`node_modules/@types` — 指向 `~/.dsh/profiles/node_modules` 的 junction
- 测试 profile：`C:\Users\ruizu\.dsh\profiles\smoke\`（当前已装回 `dsh-plugin-smoke`）
- 清理：`dsh plugin --profile smoke remove dsh-plugin-smoke`，再删 `~/.dsh/profiles/smoke` 与 `E:\workspace\GitRepository\dsh-plugin-smoke` 即可。

