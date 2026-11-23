import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-plugin-greeting'

export interface Config {
  greeting: string
}

export const Config: z<Config> = z.object({
  greeting: z.string().default('Hello'),
})

// =============================================================================
// 示例 1：Service 子类，用 ctx.plugin() 作为子插件挂载
// =============================================================================
//
// 类插件同样支持 `static inject` / `static Config`，由 registry 在挂载时解析。
// 本服务没有依赖其他服务，所以省略 inject；需要时写 `static inject = ['llm']`。

export interface GreeterConfig {
  salutation: string
}

export class GreeterService extends Service {
  static Config: z<GreeterConfig> = z.object({
    salutation: z.string().default('Hello'),
  })

  private readonly salutation: string

  constructor(ctx: Context, config: GreeterConfig) {
    // super() 会把实例注册为名为 'greeter' 的服务：
    // 注册是挂在子插件 fiber 上的 effect，子插件卸载时自动注销。
    super(ctx, 'greeter')
    this.salutation = config.salutation
  }

  greet(who: string): string {
    return `${this.salutation}, ${who}!`
  }
}

// =============================================================================
// 示例 2：普通对象服务，用 ctx.provide() 注册、ctx.set() 覆盖
// =============================================================================

export interface GreeterLite {
  greet(who: string): string
}

export function apply(ctx: Context, config: Config) {
  // --- 示例 1：作为子插件挂载 ---
  // 独立 fiber：有完整的插件生命周期（Config 校验、inject、单独卸载/热替换），
  // 并且会随父插件一起卸载。
  ctx.plugin(GreeterService, { salutation: config.greeting })

  // --- 示例 2：provide + set ---
  const base: GreeterLite = {
    greet: (who) => `${config.greeting}, ${who}!`,
  }

  // provide()：注册服务实现，归属当前 fiber，父插件卸载时自动注销。
  ctx.provide('greeterLite', base)

  // set()：覆盖「已提供」服务的值，必须与 provide() 处于同一个 fiber。
  // 注意：set() 不能单独创建服务——对未 provide 的名称调用 set() 会抛错。
  // 覆盖不会通知依赖方，依赖方下次通过 ctx.greeterLite / ctx.get() 读取时才会拿到新值。
  ctx.set('greeterLite', {
    greet(who) {
      console.log('[greeterLite] greet:', who)
      return base.greet(who)
    },
  })

  console.log('[dsh-plugin-greeting] greeting =', config.greeting)

  // --- 消费方式：ctx.inject() 会等依赖就绪后再执行回调 ---
  // 等价于挂载一个 `inject = ['greeter', 'greeterLite']` 的子插件。
  // 注意不要在 apply 里直接读刚挂载的服务：此时提供方 fiber 尚未激活，
  // 默认 strict 的 ctx.get() / ctx.greeter 会返回 undefined。
  ctx.inject(['greeter', 'greeterLite'], (ctx) => {
    console.log('[dsh-plugin-greeting]',
      ctx.greeter.greet('World'), '|', ctx.greeterLite.greet('World'))
  })
}

// =============================================================================
// 类型声明合并：让 ctx.greeter / ctx.greeterLite 在 TypeScript 里有类型
// （纯类型，不生成代码；没有它运行时也能工作，只是会丢失类型提示）
// =============================================================================

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
    greeterLite: GreeterLite
  }
}
