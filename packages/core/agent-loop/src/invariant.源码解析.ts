/**
 * 【源码解析】invariant.ts — 循环发出的 LLM 请求须可从日志重建
 * 对应源码：./invariant.ts（本文件仅供学习，不参与编译）
 *
 * 在 llm/stream 上 prepend 检查（仅 isAgentLoopRequest）：
 * 1. options 与 messages 必须 frozen
 * 2. 必须带 live sessionId
 * 3. 日志须有 step/start 与可折叠的 request/header
 * 4. options.messages === session.deriveMessages()（JSON 比较）
 * 5. model/system/temperature/maxTokens/stop/tools 与 header 一致
 *
 * 直接一次性调用即使 frozen 也不在此约定内。
 * 根 AgentLoop 服务不隐式加载本配套；需要时显式挂 @deepseek-ai/dsh-agent-loop/invariant。
 */

/**
 * Package-owned request-reconstruction invariant for loop-built LLM calls.
 * @module @deepseek-ai/dsh-agent-loop/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import { isAgentLoopRequest, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { foldRequestHeader } from '@deepseek-ai/dsh-session'

const PACKAGE_NAME = '@deepseek-ai/dsh-agent-loop'

export const name = 'agent-loop-invariant'
export const inject = ['invariants']

/**
 * install：ctx.on('llm/stream', …, { global: true, prepend: true })
 * inject: ['sessions'] 保证能 get(sessionId)
 */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('llm/stream', (options: GenerateOptions, next) => {
    if (!isAgentLoopRequest(options)) return next()
    // … frozen / session / deriveMessages / header 比对 …
    return next()
  }, { global: true, prepend: true })
}, { inject: ['sessions'] })

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
