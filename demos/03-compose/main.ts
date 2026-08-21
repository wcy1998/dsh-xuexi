/**
 * Demo 3 · 依赖注入与组合
 *
 * 跑法：npm run demo:3
 *
 * 演示：
 *   1. inject 依赖驱动加载：服务就绪前插件保持 PENDING
 *   2. 依赖变化 → 级联卸载与重载
 *   3. isolate：给子上下文一个独立的服务作用域（同名服务，不同实现）
 *   4. 服务是"注册进 fiber"的，其他插件必须用 inject 拿——直接读属性读不到
 */
import { Context, Service } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    database: DatabaseService
    cache: CacheService
  }
  interface Events {
    'db/query'(sql: string): void
  }
}

// ── 服务：数据库（构造参数 = 连接串）───────────────────────────────
class DatabaseService extends Service {
  constructor(ctx: Context, public connectionString: string) {
    super(ctx, 'database')
    console.log(`[database] 连接已建立：${connectionString}`)
  }
  query(sql: string) {
    console.log(`[database] 执行：${sql}`)
  }
}

// ── 服务：缓存（依赖 database）─────────────────────────────────────
class CacheService extends Service {
  static inject = ['database']
  constructor(ctx: Context) {
    super(ctx, 'cache')
    console.log('[cache] 缓存服务已就绪（database 一定先就绪）')
  }
}

// ── 消费者插件：用 inject 声明依赖 ─────────────────────────────────
function reporterPlugin(ctx: Context) {
  // 到这里时，inject 声明的服务一定已经在 ctx 上可读
  console.log(`[reporter] 启动，看到的 database = ${ctx.database.connectionString}`)
  ctx.on('db/query', (sql) => {
    console.log(`[reporter] 观察到查询：${sql}`)
  })
}
reporterPlugin.inject = ['database', 'cache'] as string[]

// ── 组装 ──────────────────────────────────────────────────────────
const root = new Context()

console.log('== 1. 先挂 reporter（依赖未满足，保持 PENDING）==')
const reporter = root.plugin(reporterPlugin)
console.log(`   reporter fiber 状态：${fiberState(reporter.state)}`)

console.log('== 2. 依次挂 database 与 cache ==')
const dbFiber = root.plugin(DatabaseService, 'postgres://localhost/demo')
// 时序陷阱：提供者 fiber 还没 ACTIVE 时，直接读属性读不到
console.log(`   不 await 立即读 root.database = ${(root as unknown as { database?: unknown }).database}`)
await dbFiber
console.log(`   await 之后读 root.database  = ${(root as unknown as { database?: unknown }).database}`)
await root.plugin(CacheService)
await reporter
console.log(`   reporter fiber 状态：${fiberState(reporter.state)}`)

root.emit('db/query', 'SELECT 1')

// ── 3. 为什么必须 inject ──────────────────────────────────────────
console.log('== 3. 为什么必须 inject ==')
console.log('   直接读属性：读得到与否取决于提供者 fiber 的加载时机，且没有类型保证、')
console.log('   没有卸载级联。跨插件取服务的正路是 inject：类型化、依赖驱动、级联卸载。')
console.log('   本 demo 的 reporter 插件从头到尾只写了 inject 声明，就拿到了正确实例。')

// ── 4. isolate：同名服务、不同作用域、不同实现 ─────────────────────
console.log('== 4. isolate：子作用域里换一套 database ==')
const child = root.isolate('database')      // 子作用域：database 走独立实现
const childReporter = child.plugin(reporterPlugin)  // 同一个消费者插件，inject 语义不变
await child.plugin(DatabaseService, 'sqlite://:memory:')
await childReporter
// 子作用域的 reporter 打印的应是 sqlite 连接串；根作用域的 reporter 不受影响
child.emit('db/query', 'SELECT * FROM t')   // 子作用域内派发，只有子 reporter 收到

// ── 5. 级联卸载：database 没了，依赖它的插件全部卸载 ───────────────
console.log('== 5. 卸载 database：观察级联 ==')
root.registry.delete(DatabaseService)
await new Promise((r) => setTimeout(r, 100))
console.log(`   根 reporter fiber 状态：${fiberState(reporter.state)}（回到 PENDING 等新 database）`)
console.log('   cache 的 fiber 也被级联卸载，等新 database 出现再启动')
console.log('   子作用域不受影响：sqlite 仍可用')

await root.fiber.dispose()

function fiberState(state: number): string {
  return ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING'][state] ?? String(state)
}
