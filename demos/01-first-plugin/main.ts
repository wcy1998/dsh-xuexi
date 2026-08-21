/**
 * Demo 1 · 第一个插件与可逆副作用
 *
 * 跑法：npm run demo:1
 *
 * 本 Demo 依次演示 Cordis 五个核心概念中的四个：
 *   1. 插件的三种形态（函数 / 对象 / 类）
 *   2. 上下文是服务的容器（ctx 上按 key 取服务）
 *   3. 用 inject 声明依赖（加载顺序由依赖决定）
 *   4. 注册是可逆的副作用（ctx.effect / ctx.on 自动清理）
 */
import { Context, Service } from '@deepseek-ai/cordis'

// ── 形态 1：函数插件 ──────────────────────────────────────────────
// 最小形态：一个 (ctx, config) => void 的函数。
function clockPlugin(ctx: Context, config: { prefix: string }) {
  console.log(`[clock] 启动，前缀 = ${config.prefix}`)

  // 非托管资源（setInterval）用 ctx.effect 包起来：
  // 返回的清理函数会在插件卸载时自动执行（逆序）。
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log(`[clock] ${config.prefix} ${new Date().toISOString()}`)
    }, 400)
    return () => {
      clearInterval(timer)
      console.log(`[clock] 定时器已清理（${config.prefix}）`)
    }
  })
}
// 给函数插件挂元数据：声明它需要的服务（本插件不需要任何服务）
clockPlugin.inject = [] as string[]

// ── 形态 2：对象插件 ──────────────────────────────────────────────
const listenerPlugin = {
  name: 'listener-plugin',   // 显示名，用于诊断
  apply(ctx: Context) {
    // ctx.on 注册的监听器是 effect：插件卸载时自动移除
    ctx.on('greet', (who: string) => {
      console.log(`[listener] 收到 greet 事件：hello, ${who}!`)
    })
    console.log('[listener] 已监听 greet 事件')
  },
}

// ── 形态 3：类插件（同时也是服务提供者）────────────────────────────
// 服务：占据稳定的 ctx.<key>。这里提供 ctx.greeter。
declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')   // 注册为服务名 'greeter'
  }

  greet(name: string) {
    return `你好，${name}！`
  }
}

// 依赖注入：这个插件声明它需要 greeter 服务，
// 等 GreeterService 就绪后才启动；greeter 被卸载时它也会先被卸载。
function consumerPlugin(ctx: Context) {
  console.log(`[consumer] 通过 ctx.greeter 拿到服务：${ctx.greeter.greet('Cordis')}`)
}
consumerPlugin.inject = ['greeter'] as string[]

// 声明 greet 事件的类型签名（声明合并，全局生效）
declare module '@deepseek-ai/cordis' {
  interface Events {
    greet(who: string): void
  }
}

// ── 组装 ──────────────────────────────────────────────────────────
console.log('== 创建根上下文，依次挂载插件 ==')
const root = new Context()

root.plugin(clockPlugin, { prefix: 'tick' })
root.plugin(listenerPlugin)
root.plugin(consumerPlugin)     
const greeterFiber = root.plugin(GreeterService)  // 类插件：直接用类当插件加载
                // inject: ['greeter']，此时才启动

// 注意：同一个插件不能重复加载两次——第二次会重复注册 "greeter" 服务并抛错。
// 这就是 dsh 里每个服务只有一个提供者的语义来源。
await greeterFiber   // 等待插件加载完成（plugin 返回 fiber，可 await）

// 派发一次事件，验证监听器在工作
root.emit('greet', 'world')

console.log('== 3 秒后卸载 GreeterService，观察级联清理 ==')
setTimeout(() => {
  root.registry.delete(GreeterService)  // 卸载服务 → consumerPlugin 也会被级联卸载
  setTimeout(() => {
    console.log('== 卸载 clockPlugin，观察 effect 逆序清理 ==')
    root.registry.delete(clockPlugin)
    setTimeout(() => {
      console.log('== 卸载根上下文 ==')
      root.fiber.dispose()
    }, 1200)
  }, 800)
}, 3000)
