# 01 — DSH 插件的最小完整链路（研究结果）

> 对应票：`.scratch/learn-dsh-plugin/issues/01-dsh-plugin-minimal-chain.md`
>
> 研究对象：一个 DSH 插件从零到「可加载、可本地安装」所需的最小机制链路；不研究本仓库的业务实现。
>
> 版本快照：本机 `dsh@0.2.2-rc.5`，安装于 `E:\nodejs\node-global\node_modules\@deepseek-ai\dsh`。
>
> 来源标记约定：
>
> - **【文档】** = 官方中文文档明确写到；
> - **【源码】** = 在已安装包的 `src/` / `lib/` 中核实到的代码行为（文档未逐字写）；
> - **【推断】** = 由文档 + 源码组合推出，没有单一一句话直接背书。
>
> 下文用 `$DSH` 指代 `E:\nodejs\node-global\node_modules\@deepseek-ai\dsh`；`docs/...` 与 `node_modules/@deepseek-ai/...` 均相对于 `$DSH`。

---

## 0. 先给结论

1. **「插件」与「可安装包」是两层概念。** 一个模块只要导出 `apply(ctx)` 就能被 Cordis 加载；而 `dsh plugin add` 只认识声明了 `dsh.bundle.patch` 的包。没有 `dsh.bundle` 的包会被装成普通依赖，并打印警告，**不会自动挂进 profile**。【文档 + 源码】
2. **profile 不是插件树本身，而是「层清单 + 用户 patch」。** 真正生效的树由空根开始，按 `dsh.profile.bundles` 顺序叠加各 bundle 的 patch，再叠加 profile 自己的 `cordis.patch.yml`、`$DSH_HOME/cordis.patch.yml`、`--patch` overlay。【文档 + 源码】
3. **patch 的 `insert` 只做两件事**：没有 patch 级 `id` 时追加到根条目列表；有 `id` 时插入到该 group 的 `config` 数组。非 `insert` patch 按 `id` 找到行并逐键覆盖；**`config` 整体替换，不深合并**。【源码 + 文档】
4. **最小工具插件的硬性文件只有三件**：一个导出 `apply` 的模块、一个 `package.json`（含 `dsh.bundle.patch`）、一个 `cordis.patch.yml`（用 `insert` 把该包挂进树）。TypeScript 与类型声明是发布质量要求，不是加载的硬性前提。【文档 + 源码】
5. **最小客户端插件多三件硬性条件**：`package.json` 声明 `dsh.client`（至少 `platform: "web"`）、导出 `./client` 构建产物、该包必须以**裸包名**出现在 Loader 行中（子路径行不会被扫描）。浏览器 bundle 必须是一段 classic script，内容为 `window.__ModuleLoader__.load({ id: <包名>, factory })`，且 `id` 与包名完全一致。【源码 + 推断】
6. **有两套完全不同的 `inject`，最容易混淆。** 模块导出的 `export const inject = [...]` 是 Cordis **服务依赖**；`package.json` 里的 `dsh.client.inject` 是**包级模块到达边**（官方 JSDoc 明确说「不是 Cordis service injection」）。写错位置不会报错，只会表现为「插件永远 PENDING」或「bundle 到达顺序不对」。【源码】
7. **宿主侧插件 PENDING 是静默的。** `inject` 里写了无提供方的服务，插件不会报错、不会输出，进程甚至可能正常退出。客户端同理。【文档】
8. **`dsh plugin add` 本质是「在 profile 目录里跑 pnpm + 安装后对账」。** 它先把 profile 初始化（自定义 profile 默认只含 `@deepseek-ai/dsh-base`），转发 pnpm，再扫描直接依赖：有 `dsh.bundle` 的追加进 `dsh.profile.bundles`，没有的只警告。【文档 + 源码】
9. **本地路径安装与 npm 安装的关键差异不在「装到哪」，而在「装的是什么」**：本地路径通常是 `link:` 链接、保留自己的 `node_modules`；npm 装预构建产物；git 安装拉源码，必须有 `prepare` 脚本并让用户在 pnpm 中授权 `allowBuilds`。【文档】
10. **版本兼容由 `engines.dsh` 或 `@deepseek-ai/dsh*` peer 范围决定，语义化版本比较包含 prerelease。** 本项目 `>=0.1.0-rc.6 <0.3.0` 是兼容 `0.2.2-rc.5` 的；devDependencies 里的 `0.2.0-rc.2` 只服务于类型检查，不是运行时兼容声明。【源码 + 实测】

---

## 1. Q1：`package.json` 的 `dsh` 字段分别声明什么？缺省还能加载吗？

### 1.1 三个字段的准确语义

| 字段 | 类型 | 声明什么 | 依据 |
|---|---|---|---|
| `dsh.bundle.patch` | `string \| string[]`（在 `DshBundleManifest` 中是必填） | 该包作为**组合包（bundle）**贡献的一层 patch 文件；路径相对包根；可以是按顺序应用的文件列表 | 【源码】`node_modules/@deepseek-ai/dsh-package-manifest/src/types.ts:71-78`；`dsh-app-boot/src/profile.ts:54-83` |
| `dsh.client.platform` | `string`（在 `DshClientManifest` 中是必填） | 浏览器半区的平台标识；当前 Web 消费方只接受 `"web"` | 【源码】`dsh-package-manifest/src/types.ts:87-100`；`dsh-client-modules/src/index.ts:905` |
| `dsh.client.inject` | `string[]`（可选） | **信息性的包名依赖边**，用于客户端 bundle 工厂的到达顺序；官方 JSDoc 明确写着「not Cordis service injection」 | 【源码】`dsh-package-manifest/src/types.ts:90-91`；`dsh-client-modules/src/client/system.ts:275` |

同一份类型里还有几个票中没有点名、但实际存在的字段：

| 字段 | 含义 | 依据 |
|---|---|---|
| `dsh.bundle.platforms` | 支持的 Host 平台名列表（Node 平台名或 `wsl`）；缺省表示全平台 | 【源码】`types.ts:72-73`；`dsh-app-boot/src/profile.ts:698`；`dsh-plugin-manager/src/operations.ts:113` |
| `dsh.bundle.listedByDefault` | GUI 插件列表是否默认展示；缺省为 true | 【源码】`types.ts:76-77` |
| `dsh.client.external` | 除客户端 baseline 之外显式请求的模块表项，可含子路径 | 【源码】`types.ts:94-99` |
| `dsh.client.immediately` | 是否属于启动第一阶段预取批次 | 【源码】`types.ts:92-93`；`dsh-client-modules/src/index.ts:915` |
| `dsh.profile.bundles` | **profile** manifest 的组合包有序列表，不是插件包字段 | 【源码】`types.ts:80-84`；`dsh-app-boot/src/profile.ts:678-712` |

### 1.2 缺省时的加载行为

这里必须区分「被 Loader 加载」与「被 `dsh plugin add` 安装成层」。

| 情形 | 还能被加载吗 | 说明 |
|---|---|---|
| 完全没有 `dsh` 字段 | **能，但只能作为普通依赖被别的 patch 行直接引用** | `dsh plugin add` 会打印 `declares no dsh.bundle — installed as a plain dependency, not a profile layer`，不追加到 `dsh.profile.bundles`。【源码】`dsh-plugin-manager/src/operations.ts:106-112`；【文档】`docs/user/develop/basic/publish.zh.md` §「组合包 manifest」 |
| 有 `dsh.bundle` 但没有 `patch` | **不能形成有效层** | 安装对账把「无 patch」视为非 bundle；真正加载 bundle 时 `bundlePatchFiles` 会抛 `dsh.bundle.patch must be a file path or a list of file paths`。【源码】`dsh-app-boot/src/profile.ts:54-60`、`:701-704` |
| 有 `dsh.client` 但缺 `platform` | **客户端扫描会抛错** | `parseDshClient` 直接抛 `dsh.client.platform must be a string`。【源码】`dsh-client-modules/src/client/manifest.ts:173-186` |
| `dsh.client.platform` 不是 `web` | **不会报错，但不会产生客户端行** | `if (decl === undefined \|\| decl.platform !== 'web') return null`。【源码】`dsh-client-modules/src/index.ts:905` |
| 有 `dsh.client` 但没有 `exports["./client"]` | **客户端扫描会抛错** | `declares dsh.client but exports no "./client" bundle`。【源码】`dsh-client-modules/src/index.ts:906-909` |
| 缺 `dsh.client.inject` | **完全合法** | 该字段可选，缺省即没有额外包边。【源码】`types.ts:90-91` |
| 缺 `dsh.client` 整体 | **宿主插件正常加载，只是没有浏览器半区** | 扫描只对声明了 `dsh.client` 的包建行。【源码】`dsh-client-modules/src/index.ts:900-905` |

### 1.3 第一性原理：这些字段不是「插件运行时契约」

`dsh` 字段全部是**分发/组装元数据**，不是 Cordis 的运行时契约。Cordis 只关心模块导出了什么（`name` / `inject` / `apply` / `Config`）。这解释了为什么：

- 一个包可以没有 `dsh` 字段，却仍被别的 patch 行直接引用并加载；
- 一个包可以有 `dsh.bundle`，但它自己并不是插件（只是给 profile 增加行）；
- 客户端半区是否存在，由宿主扫描 `package.json` 决定，而不是由浏览器代码自己声明。

---

## 2. Q2：`cordis.patch.yml` 的 `insert` 如何挂插件？patch 层与 profile 是什么关系？

### 2.1 `insert` 的精确语义

一个 patch 文件是顶层 YAML 数组，元素类型是 `PatchOptions`：

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
      config:
        greeting: Hi
```

【文档】`docs/user/develop/basic/publish.zh.md` §「组合包 manifest」；【源码】`node_modules/@deepseek-ai/cordis-plugin-include/src/patch.ts:7-16`。

`applyPatches` 的行为（【源码】`cordis-plugin-include/src/patch.ts:47-110`）：

1. `insert` 且 patch 自身**没有** `id`：把 `insert` 数组 clone 后**追加到根条目列表**（`data.push(...clone)`）。
2. `insert` 且 patch 自身**有** `id`：按 `id` 找到目标行；目标必须是 `group: true`，然后把 `insert` 数组推进该 group 的 `config` 数组；找不到或不是 group 只发警告并跳过。
3. 非 `insert`：必须有 `id`；按 `id` 找到目标行；若同时写了 `name`，必须与目标行的 `name` 完全一致，否则警告并跳过；然后对 `overrides` 中的每个键执行 `target[key] = value`。
4. 因此 `config` 是**整个对象替换**，不是逐键深合并。文档也明确写了这一点。【文档】`docs/architecture.zh.md` §「Profile 与组合包」；`docs/user/develop/basic/publish.zh.md` §「加载顺序」。
5. `insert` 条目如果缺 `id`，Loader 会生成随机 id（`ensureInsertIds` / `ensureIds`，【源码】`patch.ts:29-41`、`cordis-plugin-include/src/index.ts:124-129`）。随机 id 每次读取不稳定，配置编辑会被当成「先删后加」，所以**显式写稳定 `id`**。【文档】`docs/cordis-tutorial/06-composition-and-hmr.zh.md` §「热模块替换」；【源码】同上。

### 2.2 行字段：`id`、`name`、`config` 各是什么

| 字段 | 含义 | 备注 |
|---|---|---|
| `id` | 该条目在所属条目树中的稳定身份 | 后续 patch 靠它定位；HMR 靠它比较「改配置」还是「删旧增新」。没有业务语义，但要唯一且稳定。 |
| `name` | Loader 导入的模块说明符 | bundle patch 里应写**包名**（如 `dsh-hello-plugin`），这样 Node 从已安装位置解析；`--patch` overlay 里可以写绝对路径、`file:` URL，或 `./` / `../` 相对路径（相对 patch 文件解析）。 |
| `config` | 传给插件 `apply(ctx, config)` 的配置值 | 由插件导出的 `Config` schema 校验并填默认值；后续 patch 替换整个值。 |

【源码】`node_modules/@deepseek-ai/cordis-plugin-loader/src/config/entry.ts:10-23`（`EntryOptions`）；【文档】`docs/user/develop/basic/config.zh.md` §「定义 Config 类型」。

`EntryOptions` 还允许 `group`（嵌套组）、`disabled`（停用但保留条目）、`inject`（Loader 级的服务注入声明）。这些不是票中三字段，但在实际 patch 里会出现。【源码】同上。

关于相对路径有一个文档/代码差异，见 §12。

### 2.3 patch 层与 profile 的关系

**profile**：`$DSH_HOME/profiles/<name>` 下的一个目录，包含：

- `package.json`：`dependencies`（树外插件）+ `dsh.profile.bundles`（有序组合包列表）；
- `cordis.patch.yml`：用户自己的 patch 层。

【文档】`docs/user/develop/basic/publish.zh.md` §「profile manifest」；`$DSH/README.zh.md` §「Profile」。

**bundle**：一个 npm 包，`package.json` 声明 `dsh.bundle.patch`，回答「这个包贡献什么行」。

**生效树的叠加顺序**（【文档】`docs/architecture.zh.md` §「Profile 与组合包」；`docs/user/develop/basic/publish.zh.md` §「加载顺序」；【源码】`dsh-app-boot/src/profile-context.ts:74-84`）：

1. `dsh.profile.bundles` 中每个 bundle 的 patch，按列表顺序；
2. profile 自己的 `cordis.patch.yml`；
3. `$DSH_HOME/cordis.patch.yml`（机器级、所有 profile 共享，优先级高于 profile 层）；
4. 每个 `--patch <path>` overlay，按 argv 顺序；
5. 遥测开关生成的补丁（源码附加，见 `profile-context.ts:81-83`）。

后应用的层按行胜出。`dsh --dump-config` 正是按这个顺序渲染，并在每段前加 `# == <来源>` 注释。【源码】`$DSH/src/dump-config.ts:1-42`、`dsh-app-boot/src/index.ts:630-637`。

**关键推论**：bundle 的作者只需要保证自己的 patch 插入的行有稳定 `id`；用户可以在 profile 的 `cordis.patch.yml` 里按 `id` 覆盖它，而无需改包。【文档】`publish.zh.md` §「加载顺序」。

---

## 3. Q3：最小工具插件 / 最小客户端插件需要哪些文件？

### 3.1 最小工具插件（JavaScript，能加载 + 能被本地安装）

```
hello-tool/
├── package.json       # 声明 dsh.bundle.patch；type: module；main/exports 指向入口
├── cordis.patch.yml   # insert 一条行，name 写包名
└── index.js           # 导出 name / inject / apply；在 apply 里 ctx.tools.register(...)
```

**这是能完成「安装 + 加载」的最小集合。** 文件职责：

| 文件 | 必需性 | 作用 |
|---|---|---|
| `package.json` | 必需（若要 `dsh plugin add` 成层） | `name`、`version`、`type: "module"`、`main` / `exports`、`dsh.bundle.patch`；运行时用到的 `@deepseek-ai/dsh-*` 包放 `peerDependencies`（并在 `devDependencies` 镜像）。【文档】`publish.zh.md` §「组合包 manifest」；`docs/cookbook/adding-a-package.zh.md` §「1. 创建包」 |
| `cordis.patch.yml` | 必需（bundle 形式） | 顶层数组；`insert` 一条带 `id`、`name: <包名>` 的行。 |
| `index.js` / `src/index.ts` | 必需 | 插件模块本身。 |
| `tsconfig.json` | TypeScript 才需要 | 编译配置。 |
| `lib/index.js` | 发布产物 | `main` 指向它；本地 link 时也直接从它加载。 |
| `lib/types/index.d.ts` | 类型消费方需要 | `types` / `exports["."].types` 指向它。 |

`index.js` 的最小工具插件骨架（综合自【文档】`docs/user/develop/basic/tool.zh.md` §「创建工具插件」与 `docs/cordis-tutorial/07-into-the-harness.zh.md` §「工具插件」）：

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'hello-tool'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: hello-tool
      name: hello-tool
```

> 如果插件导出了 `Config` schema，可以再加 `config: {...}`；没有 `Config` 时建议省略 `config`，避免把未声明的配置传进插件。

> 注意：`name` 必须是**已安装包的包名**，不能写源码相对路径；bundle patch 的模块解析发生在 profile 的安装上下文里。【文档】`publish.zh.md` §「组合包 manifest」。

### 3.2 TypeScript 版工具插件

在上面的基础上增加：

| 文件 | 作用 |
|---|---|
| `src/index.ts` | 源码；相对导入用显式 `.ts` 后缀（仓库内约定）。【文档】`adding-a-package.zh.md` §「1. 创建包」 |
| `tsconfig.json` | 例如 `module`/`moduleResolution: NodeNext`、`outDir: lib`、`declarationDir: lib/types`。 |
| `lib/index.js` | 编译后的宿主入口。 |
| `lib/types/index.d.ts` | 声明文件。 |

`package.json` 的发布字段应至少包括：

```json
{
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" }
  },
  "files": ["lib", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

【文档】`docs/cookbook/adding-a-package.zh.md` §「1. 创建包」列出了官方仓库内包的完整不变式（`private: true`、版本与根一致、`files` 精确清单等）。**那是仓库内 workspace 包的约束，外部插件不必照抄 `private` 与版本一致这两条。**【推断，基于该节开头「为新建 `@deepseek-ai/dsh-<name>` 包提供的逐文件清单」与发布文档的独立包示例】

### 3.3 最小客户端插件

客户端半区不是「另一个插件系统」，而是**同一个包在浏览器里的第二入口**。最小集合：

```
hello-client/
├── package.json         # dsh.client.platform + exports["./client"] + 根入口
├── cordis.patch.yml     # insert 一条裸包名行（让包进入 Loader）
├── src/index.ts         # 宿主半区；可为空 apply，但必须是可加载插件
├── src/client/index.ts  # 浏览器半区：导出 name / inject / apply
└── lib/client.js        # 构建后的 classic script bundle
```

| 文件 / 条件 | 必需性 | 作用 |
|---|---|---|
| `package.json` 的 `dsh.client.platform: "web"` | 必需 | 不声明就不会被客户端扫描；声明了但缺 `platform` 会抛错。 |
| `package.json` 的 `exports["./client"]` | 必需 | 指向构建后的浏览器 bundle。 |
| 包的根入口（`main` / `exports["."]`） | 必需【推断】 | 客户端扫描以 **Loader entry** 为起点；包必须以裸包名被挂成一行。若包没有根入口，该行无法 import，包就不会成为有效行。 |
| `cordis.patch.yml` | 本地安装成 bundle 时必需 | 把该包的裸包名插入 profile，客户端扫描才有行可扫。 |
| `src/client/index.ts` | 必需 | 浏览器插件模块；导出 `inject` / `apply`。 |
| `lib/client.js` | 必需 | 浏览器实际执行的字节；必须满足 §6.5 的 bundle 契约。 |
| `locale/*.json` | 可选 | 插件展示元信息。【文档】`adding-a-package.zh.md` §「5. 添加可选的插件展示元信息」 |

`package.json` 的最小形状：

```json
{
  "name": "hello-client",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" }
  },
  "files": ["lib", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-ui-renderer"]
    }
  }
}
```

`src/client/index.ts` 的最小形态：

```ts
export const inject = ['slots']

export function apply(ctx) {
  // 把 'some.declared.slot' 换成真实存在的 slot key；直接 register 一个未声明的 slot 会失败。
  ctx.slots.inject('some.declared.slot', () =>
    ctx.slots.register({
      name: 'some.declared.slot',
      id: 'hello',
      order: 100,
    }, () => null))
}
```

【文档】`docs/subsystems/slots.zh.md` §「声明与生命周期」；`docs/subsystems/client-modules.zh.md` §「扫描」。

**为什么客户端插件也需要宿主行？** 【推断，但有源码支撑】客户端模块 registry 扫描的是宿主 Loader 的 entry，并只接受能解析到**包根**的说明符；子路径行（如 `pkg/client`）会被明确跳过（`dsh-client-modules/src/index.ts:894-895`、`:931-935`）。因此：

- 行必须指向包的裸包名；
- 行的模块必须能被 Loader 导入（空 `apply` 即可）；
- 仅声明 `dsh.client` 而没有任何行引用该包，浏览器半区不会被发现。

---

## 4. Q4：`dsh plugin --profile <name> add <package>` 实际做了什么？

### 4.1 调用链

1. **参数分流。** `dsh plugin` 先拦截 DSH 自有命令 `allow-version` / `revoke-version` / `version-exemptions`；其余参数原样转发给 pnpm。【源码】`$DSH/src/plugin.ts:18-79`；【文档】`dsh --help` 输出（`dsh plugin --profile <name> <pnpm-args...>`）。
2. **初始化 profile。** 若 `$DSH_HOME/profiles/<name>/package.json` 不存在，用随附模板的 bundle 列表初始化；自定义 profile 的默认列表是 `['@deepseek-ai/dsh-base']`。【源码】`dsh-plugin-manager/src/operations.ts:597-610`；`dsh-official-bundles/src/bundles.ts:45`。
3. **安装前兼容性预检。** 对 `add` / `install` / `i` 后的每个具名 spec，读取其 manifest（路径 spec 直接读盘；registry spec 通过 pnpm 的配置做 `pnpm view`），按 `engines.dsh` 或 DSH peer 范围判断；不兼容则**在安装前拒绝**，什么都不装。【源码】`operations.ts:158-169`、`:361-380`。
4. **执行 pnpm。** 在 profile 目录下运行 `pnpm add ...`；相对路径 spec 会先按**调用者当前目录**解析成绝对路径（`anchorPathSpec`）。【源码】`operations.ts:69-73`、`:386`。
5. **安装后对账。** 重新读取 profile manifest 的 `dependencies`：新出现的直接依赖若声明 `dsh.bundle` 且平台受支持，就追加进 `dsh.profile.bundles`；没有 `dsh.bundle` 只警告「installed as a plain dependency, not a profile layer」。【源码】`operations.ts:96-127`。
6. **写回 manifest。** 只有 `dsh.profile.bundles` 真的变化时才重写 `package.json`。【源码】`operations.ts:124-126`。

### 4.2 插件被装到哪里

- **profile 目录**：`$DSH_HOME/profiles/<name>`；本机默认 `C:\Users\<user>\.dsh\profiles\<name>`。【源码】`dsh-home-paths/src/*.ts`（`DSH_HOME_DIR_NAME = '.dsh'`，`resolveDshHome` 缺省 `homedir()/.dsh`）；【文档】`$DSH/README.zh.md` §「Profile」。
- **依赖**：写进该 profile 的 `package.json` 的 `dependencies`；代码在 `<profile>/node_modules`。
- **层选择**：该包名出现在 `dsh.profile.bundles`。
- **用户层**：`<profile>/cordis.patch.yml` 始终保留，由用户维护。【文档】`publish.zh.md` §「profile manifest」。
- `@deepseek-ai/dsh-base` 等内置组合包**始终从 dsh 安装目录解析**，不会从 profile 的 `node_modules` 取。【源码】`dsh-app-boot/src/profile.ts:646-658`；【文档】`$DSH/README.zh.md` §「Profile」。

### 4.3 本地路径 vs npm vs git vs tarball

| 安装形式 | 实际装的是什么 | 关键差异 | 依据 |
|---|---|---|---|
| `dsh plugin add ./hello-plugin` | pnpm 把本地目录链接进 profile，manifest 记录 `link:/path/to/hello-plugin` | 链接安装的 checkout **保留自己的 `node_modules`**；与宿主共享的 dsh 包要靠 peer 解析；改源码后无需重新安装 | 【文档】`publish.zh.md` §「安装进 profile」、§「加载顺序」；【源码】`operations.ts:69-73` |
| `dsh plugin add hello-plugin`（npm） | registry 上的**预构建产物** | 安装前会读取 registry manifest 做兼容检查；不需要用户授权构建脚本 | 【文档】`publish.zh.md` §「从 GitHub 安装：构建脚本这道坎」；【源码】`operations.ts:171-179`、`:361-380` |
| `dsh plugin add github:you/hello-plugin` | **源码**，不是构建产物 | pnpm 会跑作者的 `prepare`；pnpm ≥10 默认阻止，需要用户在 profile 的 `pnpm-workspace.yaml` 写 `allowBuilds: { <pkg>: true }`；应锁 commit | 【文档】`publish.zh.md` §「从 GitHub 安装：构建脚本这道坎」 |
| `dsh plugin add ./hello-plugin-0.1.0.tgz` | 预先 `pnpm pack` 的 tarball | 不需要构建权限，相当于离线发布 | 【文档】同上 |

`dsh plugin --profile <name> remove <pkg>` 会同时移除依赖与对应的 bundle 选择。【文档】`publish.zh.md` §「安装进 profile」；`dsh --help` 示例。

### 4.4 常见失败

- `pnpm` 不在 PATH：退出码 127，并提示安装 pnpm。【源码】`$DSH/src/plugin.ts:99`。
- 版本不兼容：安装前拒绝，并打印 `dsh plugin ... allow-version ... --accept-risk` 的修法。【源码】`$DSH/src/plugin.ts:100-102`。
- git 安装的 `prepare` 被 pnpm 阻止：提示把 pnpm 打印的精确键放进 `pnpm-workspace.yaml` 的 `allowBuilds`。【源码】`$DSH/src/plugin.ts:104-106`；【文档】`publish.zh.md` 同上。
- 包声明了 `dsh.bundle` 但 patch 文件缺失：安装对账阶段按非 bundle 处理；真正启动时加载该层会报错。

---

## 5. Q5：宿主侧插件的契约

### 5.1 `name` / `inject` / `apply` 分别何时被调用

| 导出 | 是什么 | 何时被读取 / 调用 | 依据 |
|---|---|---|---|
| `export const name` | **可选的显示元数据**，用于诊断信息标识插件 | 加载时读取；**不是回调，不会被执行** | 【文档】`docs/cordis-tutorial/01-first-plugin.zh.md` §「编写插件」 |
| `export const inject` | 需要的 Cordis 服务名数组 | 挂载前读取；列出的服务没就绪时 fiber 停在 **PENDING**；服务消失时插件被卸载，服务恢复后重新加载 | 【文档】`docs/cordis-tutorial/03-services.zh.md` §「使用 inject 消费服务」、§「加载后仍会跟踪依赖关系」；`docs/user/develop/framework/index.zh.md` §「依赖驱动的加载」 |
| `export function apply(ctx, config?)` | 插件主体 | 所有 `inject` 服务就绪后调用一次；通过 `ctx` 做的注册都是 effect，卸载时自动撤销 | 【文档】`docs/cordis-tutorial/02-lifecycle-and-effects.zh.md` §「Effect」、§「已经属于 effect 的操作」；`docs/user/develop/basic/index.zh.md` §「自动清理」 |

补充：

- 没有提供方的 `inject` 服务会导致**静默 PENDING**：不崩溃、不输出，甚至进程可以正常退出。【文档】`03-services.zh.md` §「使用 inject 消费服务」。
- 可选依赖的写法是**不要写进 `inject`**，在 `apply` 里用 `ctx.get('service')` 探测。【文档】`03-services.zh.md` §「可选依赖」。
- **不要使用 `{ required, optional }` 对象形式。** 本机 `@deepseek-ai/cordis` 4.x 没有可选注入语义；对象形式会被当成字面量服务名 `required` / `optional`，导致 fiber 死锁。这是本仓库在 `src/index.ts:30-35` 记录的实际经验（项目注释，非官方文档）。【源码/项目经验】
- 插件有三种形态：函数、带 `apply` 的对象、`Service` 子类。大多数情况用函数形态。【文档】`docs/user/develop/basic/index.zh.md` §「插件的三种形态」；`01-first-plugin.zh.md` §「其他两种插件形态」。
- `Config`：导出同名 Schemastery schema；Cordis 在加载时校验并填默认值，然后把配置作为 `apply` 的第二个参数传入；配置非法会让插件加载失败。【文档】`docs/user/develop/basic/config.zh.md` §「定义 Config 类型」、§「Schema 校验」。

### 5.2 `ctx.tools` 的用法

```ts
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: '...',
    parameters: { name: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `Hello, ${args.name}!` },
  }))
}
```

- `ctx.tools.register(definition, options?)`：全局注册；如果插件挂在某个 agent 的 scope 里，则注册到该 scope。返回**精确的注销 disposer**，并自动附着到当前插件 effect。【文档】`docs/subsystems/tools.zh.md` §「`ctx.tools` — `ToolsService`」；【源码】`tools.zh.md:650-750`。
- `defineTool` 是类型化辅助函数；`ctx.tools.register()` 也直接接受原始 JSON Schema 的 `ToolDefinition`（MCP 工具就是这样接入的）。【文档】`docs/cookbook/extension-cookbook.zh.md` §「工具插件」。
- 工具 schema 会自动进入系统提示词装配；`ctx.tools` 的消费方通常还需要 `systemPrompt` 提供方，否则可能保持 PENDING。【文档】`docs/cordis-tutorial/07-into-the-harness.zh.md` §「组合并运行」。
- 扩展点：`tools/pre-execute`（策略/门禁）、`tools/execute`（包裹分发）、`tools/post-execute`（结果变换）、`tools/result`（观察最终结果）。【文档】`extension-cookbook.zh.md` §「钩子插件」、§「功能→机制映射」；`tools.zh.md` §「`tools/*` events」。
- `ctx.tools.guard()` 用于单调的最终拒绝；`ctx.tools.restrict()` 用于按 scope 过滤全局工具。【文档】`tools.zh.md` §「Cordis API」。

### 5.3 `ctx.skills` 的用法

- `ctx.skills.register(skill)`：注册一个“借用的只读运行时 skill”；同步发生在 `apply` 期间；同名规则与分层规则由 registry 处理；返回注销 disposer。【文档】`docs/subsystems/skills.zh.md` §「`ctx.skills` — `SkillRegistry`」。
- `ctx.skills.registerProvider(create)`：注册一个 skill 提供方（本地目录、远程 registry 等）；工厂同步接收生命周期控制，远程发现放到 `list()` 的 await 阶段。【文档】同上、§「提供方注册表」。
- 注册落入调用方 context 的 scope 层：宿主插件落全局层，agent preset 里的插件落该 preset 层。【文档】`skills.zh.md` 同上。
- 读取用 `ctx.skills.list()` / `snapshot()` / `get(name)`。【文档】同上。

### 5.4 自动清理

`ctx.on(...)`、`ctx.tools.register(...)`、`ctx.skills.register(...)`、`ctx.plugin(child)` 都是 effect；手动资源（连接、定时器、watcher）要包在 `ctx.effect(() => cleanup)` 里。异步 disposer 按注册逆序**启动**，但彼此并发，需要顺序时放进同一个 disposer。【文档】`02-lifecycle-and-effects.zh.md` §「已经属于 effect 的操作」；`docs/user/develop/framework/index.zh.md` §「自动清理机制」。

---

## 6. Q6：客户端插件的契约

### 6.1 先分清两套 `inject`

| 位置 | 名字 | 语义 | 写错的后果 |
|---|---|---|---|
| 浏览器模块导出 | `export const inject = ['slots', 'connection']` | **Cordis 服务依赖**；等待客户端树里的 `slots` / `connection` 服务就绪后再执行 `apply` | 服务不存在 → 永久 PENDING，界面无任何变化 |
| `package.json` | `dsh.client.inject: ["@deepseek-ai/dsh-client-ui-renderer"]` | **包级模块到达边**；官方 JSDoc：「Informational package-name dependencies, not Cordis service injection」 | 不会影响服务等待；只影响 bundle 工厂的到达/组合顺序，缺省合法 |

【源码】`dsh-package-manifest/src/types.ts:87-100`；`dsh-client-modules/src/client/system.ts:275`；【文档】`docs/subsystems/client-modules.zh.md` §「wire」；`docs/subsystems/slots.zh.md` §「声明与生命周期」示例。

### 6.2 `ctx.slots.inject(...)` 与 `apply` 的加载时序

完整链路：

1. **宿主侧**：profile 的 Loader 行把包的**裸包名**挂成 entry；该包的宿主半区被 import。
2. **扫描**：`ClientModuleRegistry` 构造时同步扫描 Loader entry，读取最近包 manifest 的 `dsh.client`；只接受 `platform === 'web'`；读取 `exports["./client"]` 得到 bundle 路径。【源码】`dsh-client-modules/src/index.ts:894-915`；【文档】`client-modules.zh.md` §「扫描」。
3. **下发图**：宿主把 bundle 组合成 `/plugins/...` 路由，并把 entry 图注入 `window.__DSH_BOOT__`。【文档】`client-modules.zh.md` §「wire」、§「bundle 路由与 index 注入」。
4. **浏览器装载**：客户端 Loader 按 entry 图创建 `{ name: id }` 条目；bundle 以 classic script 执行，只注册 factory；首次 import 时才物化 exports。【源码】`dsh-client-modules/src/client/entries.ts:182-190`；`client/manifest.ts:10-16`。
5. **Cordis 等待服务**：客户端 Loader 读取模块导出的 `inject`；`slots`、`connection` 等客户端服务就绪后调用 `apply`。
6. **`apply` 内注册**：`ctx.slots.inject(key, callback)` 注册一个「等待声明」的 effect：
   - 如果目标 slot 已经声明，callback **同步**执行；
   - 否则 callback 会在 owner 的 `register()` 提交声明后执行；
   - owner 折叠时 effect 被 dispose，贡献被移除；
   - owner 再次声明时 callback 重新执行。【源码】`dsh-client-ui-renderer/src/client/registry.ts:209-269`；【文档】`slots.zh.md` §「声明与生命周期」。
7. **注册生效**：callback 内调用 `ctx.slots.register(options, Component)`；它本身也是 effect（`registry.ts:746`），插件卸载时自动注销。【文档】`slots.zh.md` 同上。

关键点：**`apply` 运行 ≠ slot 一定存在**。slot 由别的插件声明，可能更晚；所以向别人的 slot 贡献内容必须用 `ctx.slots.inject`，直接 `register` 会在 slot 未声明时失败。【文档】`slots.zh.md` §「声明与生命周期」、§「扩展规则」；【源码】`registry.ts:209`。

### 6.3 `ctx.slots.register` 的输入

- `name`：目标 slot key；
- `id`：`list` / `keyed` / `hoc` 等基数要求的稳定 id；
- `order` / `priority`：排序与遮蔽优先级；
- `locale`、`inject`、`store`、`children` 等可选面；
- 组件本身。

组件**不会收到 `ctx`**；父组件已知的值走 owner props，私有 observable/callback 走注册项的 `inject` factory，跨 entry 共享视图状态走声明的 store，React 内容通过 child slot 组合。【文档】`slots.zh.md` §「组件输入」、§「开发者提供的 injection」。

### 6.4 `client.platform` / `client.inject` 的作用

- `platform`：当前 Web 消费方只接受 `"web"`；其他值不会报错，但不会生成客户端行。【源码】`dsh-client-modules/src/index.ts:905`。
- `inject`：包级依赖边；代码用它保证被依赖包的 factory 先到达（`system.ts:271-279`）。它不是服务注入，也不能替代模块导出的 `inject`。
- `external`：模块表额外请求；`immediately`：第一阶段预取。两者都可选。【源码】`types.ts:92-99`。

### 6.5 浏览器 bundle 的字节契约（最小客户端插件最容易踩的坑）

一个能被 DSH Web 加载的客户端 bundle 必须满足：

1. 是 **classic script**，不是 ESM；
2. 整体是一个 `window.__ModuleLoader__.load({ id, factory })` 调用；
3. `id` **必须等于包名**；
4. `factory(require)` 返回模块 exports；
5. `require` 只能解析 shell 的 seed 模块表（react、react-dom、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-slots` 等）；其他依赖必须被打进 bundle；
6. bundle 被加载后若未注册对应 id，会报 `loaded without registering "<id>" via __ModuleLoader__.load`。

【源码】`dsh-client-modules/src/client/manifest.ts:10-16`、`:362-368`；`client/system.ts:224`、`:336`、`:377`；【推断】seed 表的具体内容会随版本变化，应以当前 shell 的模块表为准（本仓库的 `scripts/build-client.mjs` 列出了它针对 0.2.x 使用的 seed 列表，可作为示例）。

### 6.6 客户端插件在卸载时

`ctx.slots.register`、`ctx.slots.inject`、`ctx.connection` 订阅、样式注入都应绑定到 effect；插件卸载时注册消失、slot 折叠。客户端 Loader 会拆除 fiber 并移除该 entry 拥有的样式。【源码】`registry.ts:209-269`、`:746`；`client/entries.ts:192-204`（`replace` 中 `tearDownEntryFiber` + `removeOwnedStyles`）。

---

## 7. Q7：开发期调试与热重载

### 7.1 `--patch` overlay

```sh
dsh web --patch ./scratch-plugin/cordis.yml
```

- 可重复；按 argv 顺序叠加在 profile 层与 home 层之后。【文档】`dsh --help`；`publish.zh.md` §「加载顺序」。
- 用于开发本地源码插件，不需要打包或安装。【文档】`docs/user/develop/basic/index.zh.md` §「注册到 cordis.yml」。
- patch 里的 `name` 在 0.2.2 中可以是绝对路径、`file:` URL，或 `./` / `../`（相对 patch 文件解析成 file URL）；官方入门文档仍建议写绝对路径。【源码】`dsh-app-boot/src/index.ts:566-577`；【文档】`basic/index.zh.md` §「注册到 cordis.yml」。

### 7.2 `--dump-config` 系列

| 命令 | 行为 | 依据 |
|---|---|---|
| `dsh --profile <name> --dump-config` | 组合全部层并打印 YAML；每段带 `# == <来源文件 / bundle>`；不启动、不求值 `!!js` | 【源码】`$DSH/src/dump-config.ts:1-42`；【文档】`publish.zh.md` §「安装进 profile」 |
| `dsh --profile <name> --dump-default-config` | 只打印 bundle 层，跳过 profile 用户层、home 层与 `--patch`，用于修复坏掉的用户 patch | 【源码】`dump-config.ts:32-42`、`:51-74`；`dsh --help` |
| `dsh --profile <name> --dump-config-schema` | 导入组合树中插件声明的 schema，打印 entry / patch 的 JSON Schema；会执行插件模块，检查不可信插件前要看安全说明 | 【文档】`$DSH/README.zh.md` §「Profile」 |

`--dump-config` 是**验证「我的 patch 是否真的挂上了」的最快方式**：如果输出里没有你的行，先怀疑 `dsh.bundle.patch` 路径、`dsh.profile.bundles` 是否包含该包、patch 结构是否合法。

### 7.3 `dsh-hmr`

- base bundle 在存在 `profileContext` 时启用 `hmr` 行，默认 `config.root: []`，即**只热重载配置，不监听源码模块**。【源码】`dsh-base/cordis.patch.yml`（`id: hmr`）；【文档】`node_modules/@deepseek-ai/dsh-hmr/README.zh.md` §「使用本包」。
- 要监听源码，在 profile patch 中覆盖该行：

```yaml
- id: hmr
  disabled: false
  config:
    root: ["."]
```

【文档】`dsh-hmr/README.zh.md` §「使用本包」。

- HMR 监视 profile manifest、profile 的 `cordis.patch.yml`、home 的 `cordis.patch.yml`；配置变化会卸载旧实例并加载新实例，注册随 effect 清理。【文档】`$DSH/README.zh.md` §「Profile」；`dsh-hmr/README.zh.md` §「理解实现」。
- HMR 还会比较 profile 目录与**已链接包目标**的文件；构建输出发生变化的 linked 包会在下一次 profile 重组时生效，不要求 `root` 监听源码。【文档】`dsh-hmr/README.zh.md` §「使用本包」。
- HMR 在 Headless / SDK / ACP 组合中被禁用；禁用时改动要重启才生效。【文档】`docs/architecture.zh.md` §「Profile 与组合包」；`dsh-hmr/README.zh.md` 同上。
- HMR 配置字段：`base`、`root`、`ignored`、`debounce`、`awaitWriteFinish`。【文档】`dsh-hmr/README.zh.md` §「配置」。

### 7.4 诊断 PENDING / 未加载

- 启动审计会收集每个 entry 的状态和缺失服务，输出形如 `pending (waiting for services: ...)`；最多 256 行 / 256 条缺失服务观测。【源码】`dsh-app-boot/src/startup-diagnostics.ts:55-105`；`dsh-app-boot/src/index.ts:1093-1151`。
- 在插件里可以遍历 `ctx.registry.values()`，检查 `FiberState.PENDING`。【文档】`docs/cordis-tutorial/06-composition-and-hmr.zh.md` §「诊断始终无法加载的插件」。
- 常见原因：`inject` 写了没有提供方的服务；profile 里服务提供方被 disabled；客户端 `inject` 写了客户端树里不存在的服务。

### 7.5 推荐的开发循环

1. 本地 link 安装：`dsh plugin --profile demo add ./hello-plugin`。
2. 先 dump：`dsh --profile demo --dump-config`，确认出现 `# == dsh-hello-plugin` 段与你的行。
3. 启动：`dsh --profile demo`（或 `dsh web`）。
4. 若只改配置：编辑 profile 的 `cordis.patch.yml`，HMR 会重组。
5. 若改源码：确认 `hmr` 的 `root` 覆盖了源码目录，或在每次构建后触发一次 profile 重组。
6. 失败时：看启动审计的 pending 列表；用 `--dump-config` 排除层没挂上的可能。

---

## 8. Q8：版本兼容怎么判断？

### 8.1 运行时使用的判定规则

`evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)` 的逻辑（【源码】`dsh-app-boot/src/plugin-compatibility.ts:44-104`）：

1. 如果 manifest 有 `engines.dsh`，**只用它**决定；peerDependencies 被忽略。
2. 否则检查**所有** `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的 peerDependencies。
3. `@deepseek-ai/cordis` 不在检查范围内（名字不匹配）。
4. semver 比较使用 `{ includePrerelease: true }`，所以 prerelease 版本能匹配范围。
5. `workspace:^` / `workspace:~` / `workspace:*` 在 peer 中视为当前运行时版本；空或非法范围视为不满足。
6. 运行时不满足要求时，返回 `PluginCompatibility`；安装与启动按各自策略处理。

### 8.2 在本机 / 本项目上的结论

- 本机 `dsh --version` = `0.2.2-rc.5`（已实测）。
- 本项目 `package.json` 的 dsh peer 范围是 `>=0.1.0-rc.6 <0.3.0`（`@deepseek-ai/dsh-tools`、`dsh-skill`、`dsh-typert-protocol`、`dsh-client-ui-primitives`）。用 semver + `includePrerelease` 实测：
  - `0.2.2-rc.5` satisfies `>=0.1.0-rc.6 <0.3.0` → **true**；
  - `0.2.2-rc.5` satisfies `>=0.2.0 <0.3.0` → **true**；
  - `0.2.2-rc.5` satisfies `0.2.0-rc.2` → **false**（但这是 devDependency 的精确版本，不参与运行时检查）。
- 因此本项目在当前机器上**通过兼容检查**；devDependencies 里的 `0.2.0-rc.2` 只说明类型检查/构建时使用的 API 快照，不构成运行时兼容声明。【源码 + 实测】

### 8.3 安装期 vs 启动期

| 阶段 | 检查对象 | 不满足时 |
|---|---|---|
| `dsh plugin add` | 具名 spec 的 manifest（路径直接读盘；registry 经 `pnpm view`；git/tarball 安装后检查） | **安装前拒绝**，什么都不装；或安装后撤销并报告 |
| profile 启动（bundle 层） | `dsh.profile.bundles` 中每个 bundle 的 manifest | 该 bundle 被**跳过**，记入 `skippedBundles`，其余 profile 继续启动 |
| profile 启动（普通行） | 组合树中每一行的模块 manifest | 该行被**禁用**（`disabled: true`），stderr 打印原因 |
| `--patch` 引入的行 | 同上，按行检查 | 同上 |

【源码】`dsh-plugin-manager/src/operations.ts:361-380`、`:500-525`；`dsh-app-boot/src/profile.ts:678-710`；`dsh-app-boot/src/compatibility-preflight.ts:62-120`。

### 8.4 精确版本豁免

不兼容但用户愿意承担风险时：

```sh
dsh plugin --profile <name> allow-version <pkg>@<exact-version> \
  --dsh-version <exact-dsh-version> --accept-risk
```

- 只对**精确的包版本 + 精确的 dsh 版本**生效；
- 记录在 profile 的 `compatibility.json`，不写进包 manifest 或 patch；
- 撤销用 `revoke-version`，查看用 `version-exemptions`。

【源码】`$DSH/src/plugin.ts:18-63`；`dsh-app-boot/src/profile-compatibility.ts:10-11`、`:42-80`；【文档】`$DSH/README.zh.md` §「Profile」；`publish.zh.md` §「组合包 manifest」。

### 8.5 学习者实用判断流程

1. `dsh --version` 得到运行时版本。
2. 打开目标插件 `package.json`。
3. 有 `engines.dsh` → 只比较它；否则逐个比较 `@deepseek-ai/dsh*` peer 范围。
4. 范围比较要按 semver 且 `includePrerelease: true`；不要用编辑器里「看起来像」的直觉。
5. 看 `dsh.bundle.platforms` 是否包含当前平台（Windows 用 `win32`；或 `wsl`）。
6. 不相信 devDependencies 的版本号；那是编译期快照。
7. 若安装被拒，先找兼容版本；确实要用旧版，再用 `allow-version`，并把它当作「允许可能崩溃或损坏数据」的决定。

---

## 9. 最小文件清单汇总

### 9.1 最小工具插件

| 层级 | 文件 | 说明 |
|---|---|---|
| 仅能被 Loader 加载 | 任意可 import 的模块（如 `index.js`） | 导出 `name` / `inject` / `apply`；任何 patch 行可直接引用它 |
| 能被 `dsh plugin add` 安装成层 | `package.json`（含 `dsh.bundle.patch`）+ `cordis.patch.yml` | patch 中用裸包名 insert |
| 可发布的 TypeScript 包 | `src/index.ts`、`tsconfig.json`、`lib/index.js`、`lib/types/index.d.ts` | `main`、`types`、`exports` 指向产物 |
| 可选 | `locale/en.json`、`locale/zh.json`、`README.md` | 展示元信息与文档 |

### 9.2 最小客户端插件

| 层级 | 文件 / 条件 | 说明 |
|---|---|---|
| 宿主行 | `package.json` 根入口（可为空 `apply`）+ `cordis.patch.yml` | 必须有一行用**裸包名**挂载该包 |
| 客户端声明 | `package.json` 的 `dsh.client.platform: "web"`、`exports["./client"]` | 缺 platform 抛错；非 web 被跳过 |
| 浏览器源码 | `src/client/index.ts` | 导出 `inject` / `apply`；用 `ctx.slots.inject` + `ctx.slots.register` |
| 浏览器产物 | `lib/client.js` | classic script；`window.__ModuleLoader__.load({ id: "<包名>", factory })`；只 require shell seed |
| 可选 | `dsh.client.inject`、`dsh.client.external`、`dsh.client.immediately`、`locale/*.json` | 包边、额外模块请求、预取、展示元信息 |

---

## 10. 可执行命令清单

> 以下命令只列出语义；本次研究**未执行任何安装、构建、联网或 git 操作**。

| 目的 | 命令 | 说明 |
|---|---|---|
| 查看 dsh 版本 | `dsh --version` | 用于兼容性比较 |
| 查看启动器帮助 | `dsh --help` | 列出 `--profile`、`--patch`、`--dump-config` 等 |
| 查看插件管理帮助 | `dsh plugin --help` | 说明参数原样转发 pnpm |
| 构建本项目 | `npm run build`（或 `pnpm build`） | 先宿主 `tsc`，再客户端 `tsc` + bundle |
| 类型检查 | `npm run typecheck` | 宿主与客户端两份 tsconfig |
| 本地安装插件 | `dsh plugin --profile <name> add ./hello-plugin` | 首次会初始化 profile；路径按当前目录解析 |
| 从 npm 安装 | `dsh plugin --profile <name> add <package>` | 安装预构建产物 |
| 从 git 安装 | `dsh plugin --profile <name> add github:you/hello-plugin#<sha>` | 需要 `prepare` 与 `allowBuilds` 授权 |
| 卸载 | `dsh plugin --profile <name> remove <package>` | 同时移除依赖与 bundle 选择 |
| 检查组合树 | `dsh --profile <name> --dump-config` | 输出带 `# ==` 层来源 |
| 只检查 bundle 层 | `dsh --profile <name> --dump-default-config` | 跳过用户层与 overlay，用于修复坏 patch |
| 打印配置 schema | `dsh --profile <name> --dump-config-schema` | 会导入插件模块 |
| 启动 profile | `dsh --profile <name>` 或 `dsh <name>` | `web` / `headless` / `sdk` / `acp` 等 |
| 开发期 overlay | `dsh web --patch ./scratch-plugin/cordis.yml` | 不安装、不打包 |
| 重建内置 profile | `dsh --profile <name> --from-default-profile <template>` | 会替换整个 profile 目录 |
| 版本豁免 | `dsh plugin --profile <name> allow-version <pkg>@<ver> --dsh-version <ver> --accept-risk` | 精确版本，风险自负 |
| 查看豁免 | `dsh plugin --profile <name> version-exemptions` | 读取 `compatibility.json` |
| 撤销豁免 | `dsh plugin --profile <name> revoke-version <pkg>@<ver> --dsh-version <ver>` | 同上 |

---

## 11. 文档章节索引（路径 + 标题）

### 入门与教程

| 路径 | 标题 | 本票相关点 |
|---|---|---|
| `docs/user/develop/basic/index.zh.md` | 「第一个插件」§「插件是什么」「注册到 cordis.yml」「自动清理」「声明依赖」「插件的三种形态」 | 最小 `apply`、`--patch` 用法、PENDING |
| `docs/user/develop/basic/tool.zh.md` | 「开发一个工具」§「创建工具插件」「运行并调用工具」 | `defineTool` 最小示例 |
| `docs/user/develop/basic/config.zh.md` | 「插件配置」§「定义 Config 类型」「Schema 校验」「配合 HMR」 | `Config` 与热替换 |
| `docs/user/develop/basic/publish.zh.md` | 「打包与安装插件」§「两个概念，两种 manifest」「组合包 manifest」「profile manifest」「安装进 profile」「加载顺序」「从 GitHub 安装」 | 本票主干 |
| `docs/user/develop/framework/index.zh.md` | 「插件与生命周期」§「Fiber 状态机」「依赖驱动的加载」「自动清理机制」 | `inject` / `apply` 时序 |
| `docs/user/develop/framework/service.zh.md` | 「服务与依赖」§「必需依赖与可选依赖」「服务消失时的行为」 | optional inject |
| `docs/cordis-tutorial/01-first-plugin.zh.md` | 「编写第一个插件」§「编写插件」「组合应用」「其他两种插件形态」 | `name` 只是元数据 |
| `docs/cordis-tutorial/02-lifecycle-and-effects.zh.md` | 「生命周期与 effect」§「Effect」「Fiber 状态机」「已经属于 effect 的操作」 | effect 与清理 |
| `docs/cordis-tutorial/03-services.zh.md` | 「服务」§「使用 inject 消费服务」「加载后仍会跟踪依赖关系」「可选依赖」 | PENDING 与可选依赖 |
| `docs/cordis-tutorial/06-composition-and-hmr.zh.md` | 「组合与 HMR」§「Cordis 配置项不只有名称」「热模块替换」「诊断始终无法加载的插件」 | `id`、HMR、PENDING 诊断 |
| `docs/cordis-tutorial/07-into-the-harness.zh.md` | 「进入 harness」§「工具插件」「组合并运行」 | 工具注册与依赖组合 |

### 子系统与架构

| 路径 | 标题 | 本票相关点 |
|---|---|---|
| `docs/subsystems/client-modules.zh.md` | 「Client 模块」§「wire」「扫描」「bundle 路由与 index 注入」「服务」 | `dsh.client` 扫描与 bundle 契约 |
| `docs/subsystems/slots.zh.md` | 「Web Client Slots」§「声明与生命周期」「Cardinality 与 scope」「组件输入」「开发者提供的 injection」「扩展规则」 | `slots.inject` / `register` |
| `docs/subsystems/tools.zh.md` | 「工具」§「`ToolDefinition`」「Cordis API」「`ctx.tools` — `ToolsService`」 | `ctx.tools` 完整签名 |
| `docs/subsystems/skills.zh.md` | 「Skills」§「提供方注册表」「Cordis API」「`ctx.skills` — `SkillRegistry`」 | `ctx.skills` 用法 |
| `docs/architecture.zh.md` | 「DeepSeek Harness 架构」§「Profile 与组合包」「核心包」「新行为的归属位置」 | 层顺序、包角色、扩展点 |
| `docs/cookbook/extension-cookbook.zh.md` | 「实操手册：扩展插件形态」§「工具插件」「钩子插件」「可运行的组装示例」「功能→机制映射」 | 插件形态与扩展点总览 |
| `docs/cookbook/adding-a-package.zh.md` | 「实操手册：添加 workspace 包」§「1. 创建包」「2. 在根配置中注册」「5. 添加可选的插件展示元信息」 | 仓库内包的完整文件清单；外部包只借结构 |
| `docs/cookbook/adding-a-tool.zh.md` | 「添加工具」 | `defineTool` 详细参考 |
| `docs/config-catalog.zh.md` | 生成的配置目录 | 各内置插件的 `config` 字段；**不含** `dsh` manifest 字段 |
| `$DSH/README.zh.md` | 「Profile」 | profile 目录、层顺序、安装位置、兼容检查 |
| `node_modules/@deepseek-ai/dsh-hmr/README.zh.md` | 「使用本包」「配置」「理解实现」 | HMR 配置与重载范围 |

---

## 12. 文档与代码的差异 / 需要注意的边界

以下不是票中 8 问的直接答案，但会影响学习者判断，单列出来：

1. **相对插件路径。** `docs/user/develop/basic/index.zh.md` §「注册到 cordis.yml」说「插件路径必须是绝对路径」；但 0.2.2 的 `anchorInsertedPluginNames` 会把 `insert` 条目中以 `./` / `../` 开头的 `name` 转成相对 patch 文件的 file URL（`dsh-app-boot/src/index.ts:566-577`）。**结论**：绝对路径最稳；`./` 相对路径在当前版本也可用，但不要依赖未文档化的行为。【文档 + 源码】
2. **`dsh.client.inject` 的定位。** 包类型 JSDoc 说它是「信息性包名依赖，不是 Cordis 服务注入」（`types.ts:90-91`）；`system.ts:271-279` 确实用它排序 bundle 工厂到达；`docs/subsystems/client-modules.zh.md` §「wire」又说「Cordis separately uses the same package edges to compose entries」。**结论**：把它当「包级到达/组合边」，不要当服务依赖；服务依赖写模块导出的 `inject`。【文档 + 源码】
3. **`dsh.bundle` 有值但缺 `patch`。** 安装对账把它当非 bundle（警告），启动加载时 `bundlePatchFiles` 抛格式错误。两种路径行为不同，不要只看安装成功就以为能启动。【源码】
4. **`client.platform` 目前只认 `web`。** 类型上是 `string`，代码把非 `web` 静默跳过；不要写 `"desktop"` 之类期待未来兼容。【源码】
5. **客户端包没有 `dsh.bundle` 也能有客户端半区吗？** 理论上可以，但前提是用户在自己的 profile patch 里手动插入该包的裸包名行；`dsh plugin add` 不会帮你插。**最省事的方式仍是声明 `dsh.bundle.patch`。**【推断】
6. **仓库内包清单 ≠ 外部插件要求。** `adding-a-package.zh.md` 的 `private: true`、版本与根一致、tsconfig references 等是 monorepo 约束；外部插件只需满足发布与加载的最小集合。【推断】

---

## 13. 一句话总结

> DSH 插件的最小链路是：**一个导出 `apply` 的模块 → 一条引用它的 patch 行 → 一个把该包列为 bundle 的 profile**。工具插件在 `apply` 里用 `ctx.tools.register` 贡献能力；客户端插件在此之上再要 `dsh.client.platform: web`、`./client` 构建产物、以及一个裸包名的 Loader 行。版本兼容只看 `engines.dsh` 或 `@deepseek-ai/dsh*` peer 范围，不看 devDependencies。
