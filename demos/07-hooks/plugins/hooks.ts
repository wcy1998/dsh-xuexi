/**
 * Demo 7 · 事件钩子：拦截请求与工具
 *
 * 一个插件同时演示五种扩展点：
 *   ① llm/stream（waterfall）          —— 包裹每一次模型调用（含标题生成等辅助调用）
 *   ② agent/request（waterfall）       —— 观察/替换模型请求配置
 *   ③ tools/pre-execute（waterfall）   —— 工具执行前的审批闸门
 *   ④ session/event（emit）            —— 观察持久事件流
 *   ⑤ agent/turn-stopping（serial）    —— turn 关闭前的最终检查点
 *
 * 交互开关：DSH_DEMO_DENY_ECHO=1 时，pre-execute 会拒绝所有 echo 调用。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'

export const name = 'demo-hooks'
export const inject = ['llm', 'tools', 'sessions', 'agents'] as string[]

export function apply(ctx: Context) {
  // ── ① llm/stream：包裹每一次模型调用 ──────────────────────────────
  let callCount = 0
  ctx.on('llm/stream', async function* (options, next) {
    callCount += 1
    const id = callCount
    console.log(`[hooks] ① llm/stream 第 ${id} 次调用开始：` +
      `${options.provider}/${options.model}，${options.messages.length} 条消息，` +
      `${options.tools?.length ?? 0} 个工具 schema`)
    let chunkCount = 0
    for await (const chunk of next()) {
      chunkCount += 1
      yield chunk
    }
    console.log(`[hooks] ① 第 ${id} 次调用结束（${chunkCount} 个 chunk）`)
  })

  // ── ② agent/request：观察请求配置（改返回值即替换配置）────────────
  ctx.on('agent/request', async (payload, next) => {
    const config = await next()   // 先拿默认配置（agent options / 上一次请求头）
    console.log(`[hooks] ② agent/request：turn ${payload.turn} step ${payload.step}，` +
      `配置 = ${config.provider}/${config.model}（maxTokens=${config.maxTokens}）`)
    return config                // 原样返回；换一个对象就是"替换配置"
  })

  // ── ③ tools/pre-execute：审批闸门 ────────────────────────────────
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    console.log(`[hooks] ③ tools/pre-execute：${exec.name}(${JSON.stringify(exec.arguments)})`)
    if (process.env.DSH_DEMO_DENY_ECHO === '1' && exec.name === 'echo') {
      console.log('[hooks] ③ 策略生效：拒绝 echo 调用（deny）')
      return { kind: 'deny', reason: '演示：策略拒绝了 echo' }
    }
    return next()                // 只读观察必须委托
  })

  // ── ④ session/event：观察持久事件流 ──────────────────────────────
  const watched = new Set(['turn/start', 'turn/end', 'step/start', 'step/end', 'tool/call', 'tool/result'])
  ctx.on('session/event', (_session, event) => {
    if (watched.has(event.type)) {
      console.log(`[hooks] ④ session 事件：${event.type}（seq=${event.seq}）`)
    }
  })

  // ── ⑤ agent/turn-stopping：turn 关闭前的最终检查点 ────────────────
  ctx.on('agent/turn-stopping', (payload) => {
    console.log(`[hooks] ⑤ agent/turn-stopping：turn ${payload.turn} 即将关闭（serial 检查点）`)
  })

  console.log('[hooks] 五个钩子已就绪')
}
