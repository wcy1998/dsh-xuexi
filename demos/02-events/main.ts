/**
 * Demo 2 · 事件总线的四种分发模式
 *
 * 跑法：npm run demo:2
 *
 * 依次演示 emit / waterfall / parallel / serial 四种模式，
 * 并亲手制造两个经典 bug：waterfall 忘了调 next()、监听器抛错。
 */
import { Context } from '@deepseek-ai/cordis'

// 事件签名（声明合并）
declare module '@deepseek-ai/cordis' {
  interface Events {
    // @mode emit —— 广播，不等监听者
    tick(n: number): void
    // @mode waterfall —— 可拦截的中间件链
    calculate(expr: string, next: () => Promise<number>): Promise<number>
    // @mode parallel —— 并发执行并等待全部
    fetchAll(urls: string[]): Promise<void>
    // @mode serial —— 顺序执行直到有人拍板
    whoCan(skill: string): Promise<string | undefined>
  }
}

const root = new Context()

// ── 1. emit：同步广播 ────────────────────────────────────────────
console.log('── 1. emit：同步广播，不等待监听者 ──')
root.on('tick', (n) => console.log(`  监听器 A 收到 tick #${n}`))
root.on('tick', (n) => console.log(`  监听器 B 收到 tick #${n}`))
root.emit('tick', 1)
// 输出顺序永远是 A、B（注册顺序），且 emit 不等待任何异步完成

// ── 2. waterfall：环绕式中间件 ───────────────────────────────────
console.log('── 2. waterfall：监听器包裹 next() ──')
root.on('calculate', async (expr, next) => {
  console.log(`  [审计] 计算请求：${expr}`)
  const result = await next()          // 委托给下游
  console.log(`  [审计] 计算结果：${result}`)
  return result
})
root.on('calculate', async (expr, next) => {
  if (expr.includes('evil')) {
    console.log('  [策略] 检测到非法表达式，短路！')
    return -1                            // 不调 next()：否决下游与内置行为
  }
  return next()
})
// 内置行为（瀑布最内层的 next）
const answer = await root.waterfall('calculate', '1 + 1', async () => 2)
console.log(`  waterfall('1 + 1') = ${answer}`)
const vetoed = await root.waterfall('calculate', 'evil()', async () => 999)
console.log(`  waterfall('evil()') = ${vetoed}  ← 内置行为从未执行`)

// ── 3. parallel：并发扇出 ────────────────────────────────────────
console.log('── 3. parallel：并发执行并等待全部 ──')
const started: string[] = []
root.on('fetchAll', async (urls) => {
  started.push('慢速')
  await new Promise((r) => setTimeout(r, 300))
  console.log(`  [慢速] 完成 ${urls.length} 个 URL`)
})
root.on('fetchAll', async (urls) => {
  started.push('快速')
  await new Promise((r) => setTimeout(r, 50))
  console.log(`  [快速] 完成 ${urls.length} 个 URL`)
})
const t0 = Date.now()
await root.parallel('fetchAll', ['a', 'b'])
console.log(`  总耗时 ${Date.now() - t0}ms（并发 ≈ 300ms，串行要 350ms）`)

// ── 4. serial：顺序执行直到有人拍板 ──────────────────────────────
console.log('── 4. serial：依次询问，直到有人 bail ──')
root.on('whoCan', async (skill) => {
  console.log('  [翻译官] 我会翻译，但这题问我？不会。')
  return undefined                       // undefined = 不拍板，继续问下一个
})
root.on('whoCan', async (skill) => {
  console.log(`  [工程师] ${skill}？我会！`)
  return 'engineer'                      // 非空返回值 = bail，链条停止
})
root.on('whoCan', async (skill) => {
  console.log('  [厨师] 轮不到我……')
  return 'chef'
})
const winner = await root.serial('whoCan', 'debug TypeScript')
console.log(`  最终接单者：${winner}（厨师从未被询问）`)

// ── 5. 两个经典 bug ──────────────────────────────────────────────
console.log('── 5. 经典 bug：waterfall 忘了调 next() ──')
root.on('calculate', async (expr, next) => {
  console.log(`  [bug 监听器] 只想记录 ${expr}，但忘了 next()…`)
  return 0                              // 返回值直接短路，下游全被跳过
})
const bugged = await root.waterfall('calculate', '2 + 2', async () => 4)
console.log(`  结果 = ${bugged}（预期 4，实际被 bug 监听器短路成 0）`)
console.log('  教训：只读监听必须委托 next()，只有明确否决时才短路。')

console.log('── 5b. 经典 bug：emit 监听器抛错 ──')
const badOff = root.on('tick', () => {
  throw new Error('我崩了')
})
try {
  root.emit('tick', 2)
} catch (err) {
  console.log('  emit 同步抛出：', (err as Error).message)
  console.log('  教训：emit 是同步的，监听器异常会中断派发；关键路径用 parallel 隔离。')
}
// 坏监听器会污染之后的所有派发。ctx.on 返回 disposer：手动移除它。
badOff()
console.log('  （已调用 on() 返回的 disposer 移除坏监听器）')

// ── 6. 卸载：监听器是 effect，随 fiber 自动移除 ───────────────────
console.log('── 6. 卸载插件 = 移除它的全部监听器 ──')
const temp = root.plugin((ctx: Context) => {
  ctx.on('tick', () => console.log('  [临时监听器] 收到 tick'))
  console.log('  [临时插件] 已挂载')
})
root.emit('tick', 3)          // 此时临时监听器还在
await temp
root.registry.delete(temp)    // 卸载临时插件
root.emit('tick', 4)          // 临时监听器不再出现

await new Promise((r) => setTimeout(r, 400))
await root.fiber.dispose()
console.log('== Demo 2 完成 ==')
