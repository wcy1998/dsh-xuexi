/**
 * 【源码解析】dispatch.ts — Agent 作用域事件的分发器
 * 对应源码：./dispatch.ts（本文件仅供学习，不参与编译）
 *
 * agentEvents 把「scope carrier」与 payload 里的 agent 字段绑死，
 * 避免监听器收到的 agent 与作用域键不一致。
 */

/**
 * Agent-scoped dispatch and prompt assembly helpers. ...
 * @module @deepseek-ai/dsh-agent/dispatch
 */
/**
 * Agent-scoped dispatch and prompt assembly helpers. The fused dispatcher
 * {@link agentEvents} couples the agent subject to its scope carrier, so the
 * scope key and the payload's `agent` cannot diverge; repeat dispatchers (the
 * loop driver) build it once in the agent's constructor and reuse it.
 * @module @deepseek-ai/dsh-agent/dispatch
 */

import type { Context, Events } from '@deepseek-ai/cordis'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import type { Scoped } from '@deepseek-ai/dsh-scope'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { Agent } from './runtime-types.ts'

/** Params：从事件处理函数类型提取参数元组 */
/** Extract the parameter tuple from an event handler type (its `this` is not part of the tuple). */
type Params<F> = F extends (...args: infer P) => unknown ? P : never
/** Return：提取处理函数返回类型 */
/** Extract the return type from an event handler type. */
type Return<F> = F extends (...args: never[]) => infer R ? R : never

/**
 * AgentSubjectEvent：所有「第一个参数 payload 带 agent 且 this 为 Scoped<Agent>」的事件名联合类型
 */
/**
 * The event names whose subject is an agent: ...
 */
export type AgentSubjectEvent = {
  [K in keyof Events]: Events[K] extends (this: Scoped<Agent>, ...args: infer P) => unknown
    ? P extends [infer Payload, ...unknown[]]
      ? Payload extends { agent: Agent } ? K : never
      : never
    : never
}[keyof Events]

/** PayloadOf：某 agent 事件的完整 payload 类型 */
/** The full payload object of one agent-subject event. */
type PayloadOf<K extends AgentSubjectEvent> = Params<Events[K]> extends [infer Payload, ...unknown[]] ? Payload : never

/** Tail：payload 之后的参数（waterfall 的 next 等） */
/** The event arguments AFTER the payload: the waterfall `next` when present. */
type Tail<K extends AgentSubjectEvent> = Params<Events[K]> extends [unknown, ...infer R] ? R : never

/**
 * PayloadRest：调用方传入的 payload（不含 agent，由分发器注入）
 */
/**
 * The payload as emit-side callers pass it: ...
 */
type PayloadRest<K extends AgentSubjectEvent> = Omit<PayloadOf<K> & object, 'agent'>

/**
 * AgentEventDispatch：fuse 后的分发接口——emit / serial / waterfall
 */
/**
 * The fused dispatcher {@link agentEvents} returns: ...
 */
export interface AgentEventDispatch {
  /** emit：通知型，不 veto 生命周期；监听器错误被 log 并隔离 */
  emit<K extends AgentSubjectEvent>(name: K, payload: PayloadRest<K>): void
  /** serial：顺序 await 链（Cordis serial） */
  serial<K extends AgentSubjectEvent>(name: K, payload: PayloadRest<K>): Promise<Awaited<Return<Events[K]>>>
  /** waterfall：围绕 next 的中间件链 */
  waterfall<K extends AgentSubjectEvent>(name: K, payload: PayloadRest<K>, ...rest: Tail<K>): Return<Events[K]>
}

/**
 * agentCarrier：为 Agent 构建 scope carrier（stateless 路由对象，可复用）
 */
/**
 * Build the fused scope carrier for one agent subject. ...
 */
export function agentCarrier(agent: Agent): Scoped<Agent> {
  return scopeTarget(agent, agent) // 键与主体都是同一个 Agent
}

/**
 * agentEvents：构建 fused dispatcher。
 * carrier 默认 agentCarrier(agent)；loop 在构造 Agent 时建一次复用。
 */
/**
 * Build a dispatcher that couples the agent subject to its scope carrier. ...
 */
export function agentEvents(ctx: Context, agent: Agent, carrier: Scoped<Agent> = agentCarrier(agent)): AgentEventDispatch {
  // fused：把 caller payload 与 agent 合并；spread payload 在前，agent 在后防覆盖
  const fused = <K extends AgentSubjectEvent>(payload: PayloadRest<K>): PayloadOf<K> =>
    ({ ...payload, agent } as PayloadOf<K>)
  return {
    emit(name, payload) {
      // 不用 Cordis 默认 emit：自行 dispatch 并 contain 同步 throw / async reject
      const args: unknown[] = [carrier, name, fused(payload)]
      const callbacks = ctx.events.dispatch('emit', args)
      for (const callback of callbacks) {
        try {
          const returned: unknown = callback(...args)
          void Promise.resolve(returned).catch((error: unknown) => {
            ctx.logger.warn(`agent event "${name}" listener rejected: ${String(error)}`)
          })
        } catch (error: unknown) {
          ctx.logger.warn(`agent event "${name}" listener threw: ${String(error)}`)
        }
      }
    },
    async serial(name, payload) {
      const serial = ctx.serial as (thisArg: Scoped<Agent>, name: string, ...args: unknown[]) => Promise<never>
      return await serial(carrier, name, fused(payload))
    },
    waterfall(name, payload, ...rest) {
      const waterfall = ctx.waterfall as (thisArg: Scoped<Agent>, name: string, ...args: unknown[]) => never
      return waterfall(carrier, name, fused(payload), ...rest)
    },
  }
}

/**
 * emitAgentEvent：一次性 emit，内部临时建 dispatcher（有分配开销）
 */
/**
 * Emit one contained agent notification without allocating a retained dispatcher. ...
 */
export function emitAgentEvent<K extends AgentSubjectEvent>(
  ctx: Context,
  agent: Agent,
  name: K,
  payload: PayloadRest<K>,
): void {
  agentEvents(ctx, agent).emit(name, payload)
}

/**
 * assembleContextFor：构造 system-prompt assemble 上下文，agent 与 scope 同指一个 Agent
 */
/**
 * Build the prompt assembly context with agent and scope set together, ...
 */
export function assembleContextFor(agent: Agent, signal?: AbortSignal): AssembleContext {
  return { agent, scope: agent, ...signal === undefined ? {} : { signal } }
}
