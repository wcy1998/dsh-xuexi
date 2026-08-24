/**
 * 【源码解析】runtime-types.ts — Agent 公共类型与 live agent/* 事件声明
 * 对应源码：./runtime-types.ts（本文件仅供学习，不参与编译）
 *
 * 持久 turn/step 边界在 dsh-session；本文件定义：
 * - Agent 接口（send/cancel/…）
 * - AgentStatus、PreStepDecision 等辅助类型
 * - Cordis Events 模块合并里的 agent/* 实时事件
 */

/**
 * Public agent types and live-runtime events. ...
 * @module @deepseek-ai/dsh-agent
 */
/**
 * Public agent types and live-runtime events. Durable transcript facts and
 * turn/step boundaries remain `@deepseek-ai/dsh-session` events.
 *
 * @module @deepseek-ai/dsh-agent
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Scoped } from '@deepseek-ai/dsh-scope'
import type { LlmCallConfig, LlmFailure, ResolvedRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { AgentCancelCause, Session, SessionId, UserMessage } from '@deepseek-ai/dsh-session'
export type { AgentCancelCause } from '@deepseek-ai/dsh-session'
import type { Inbox } from './inbox.ts'
import type { InboxTarget } from './types.ts'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** 扩展 AssembleContext：组装 prompt 时可携带 agent */
declare module '@deepseek-ai/dsh-system-prompt' {
  interface AssembleContext {
    /** Agent for this assembly; absent on diagnostics. When present, `scope` must identify the same agent. */
    agent?: Agent
  }
}

/** AgentOptions：创建 Agent 时的可配项（模型路由等；persona 在 system-prompt） */
/** Merge-extensible agent creation options. Persona belongs to system-prompt sections. */
export interface AgentOptions {
  provider?: string
  model?: string
  maxTokens?: number
}

/** CancelOptions：cancel 是否保留 inbox 排队项 */
/** Options for {@link Agent.cancel}. */
export interface CancelOptions {
  /**
   * Preserve queued and steering inbox items instead of discarding them. ...
   */
  keepInbox?: boolean | undefined
}

/**
 * AgentStatus：idle = 无驱动器；running = 从唤醒到 drain 完成。
 * dispose 不是第三种可观察 status。
 */
/**
 * An agent's lifecycle state, emitted on every transition as `agent/status`: ...
 */
export type AgentStatus = 'idle' | 'running'

/** PreStepDecision：pre-step waterfall 的返回——拒绝 step 或带着 messages 进入 */
/** Whether and with which messages the loop enters a proposed step. */
export type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: UserMessage[] }

/** RequestErrorAction：request-error 监听器声明是否自行 retry */
/** Action returned by a listener that owns model-request recovery. */
export type RequestErrorAction = { kind: 'retry' } | undefined

/** SessionStartSource：session 生命周期为何开始 */
/** Why a session lifecycle began; seeded creates are `startup`, while persisted loads are `resume`. */
export type SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'

/**
 * Agent：对外 live 句柄——id、session、inbox、status、ctx + 驱动 API
 */
/** Public live-agent handle. */
export interface Agent {
  readonly id: SessionId // 与 session.id 相同
  readonly options: AgentOptions
  readonly session: Session // 会话日志是唯一真相源
  readonly inbox: Inbox
  readonly status: AgentStatus
  readonly ctx: Context // Agent 作用域 Cordis 上下文

  /** cancel：默认清 inbox + 中止当前 turn；keepInbox 只中止 turn */
  cancel(cause: AgentCancelCause, options?: CancelOptions): void

  /** whenIdle：当前整 agent 活动静默后 resolve（含替换进来的新驱动） */
  whenIdle(): Promise<void>

  /** runMaintenance：真正 idle 阶段跑维护任务，status 仍 idle */
  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>

  /**
   * send：把消息路由到 inbox 边界，可选 wakeup 唤醒驱动器
   */
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void

  /** followup：排队一条普通跟进 turn 并唤醒 */
  followup(message: UserMessage): void

  /** steer：nearest step 的 steering；idle 会开 turn，running 在下一 step 边界消费 */
  steer(message: UserMessage): void

  /** inject：注入上下文但不唤醒；running 时在 later step 边界 claim */
  inject(message: UserMessage): void
}

/**
 * Cordis Events 模块合并：声明所有 agent/* 实时事件及 dispatch mode
 */
declare module '@deepseek-ai/cordis' {
  interface Events {
    // ---- lifecycle (emit) ----
    /** agent/created：Agent 与 session 已发布；同步 throw 可否决发布 */
    'agent/created'(this: Scoped<Agent>, payload: { agent: Agent }): void
    /** agent/disposed：从注册表移除后、session detach 前 */
    'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void
    /** agent/status：idle ⇄ running 每次转换 */
    'agent/status'(this: Scoped<Agent>, payload: { agent: Agent; status: AgentStatus }): void
    /** agent/inbox/inserted：一条消息进入 live inbox */
    'agent/inbox/inserted'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
    /**
     * agent/inbox/claimed：消息在 open turn 内被 claim；
     * pre-step reject 时消息在此结束，不会变成 user/message
     */
    'agent/inbox/claimed'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage; turn: number }): void
    /** agent/inbox/discarded：从 live inbox 丢弃 */
    'agent/inbox/discarded'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void

    // ---- session lifecycle (emit) ----
    /** agent/session-start：session 生命周期开始，第一轮 turn 之前一次 */
    'agent/session-start'(this: Scoped<Agent>, payload: { agent: Agent; source: SessionStartSource }): void

    // ---- the machine's extension points ----
    /**
     * agent/pre-step (waterfall)：可 reject step 或替换进入 step 的 messages
     */
    'agent/pre-step'(this: Scoped<Agent>, payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
    /**
     * agent/request (waterfall)：替换冻结的 LlmCallConfig；不能改 messages
     */
    'agent/request'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; signal: AbortSignal }, next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig>
    /**
     * agent/request-error (waterfall)：失败请求恢复；返回 retry 且不 next 表示自行恢复
     */
    'agent/request-error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; provider: string; failure: LlmFailure; retryPolicy: ResolvedRetryPolicy | undefined; signal: AbortSignal }, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction>
    /**
     * agent/turn-stopping (serial)：turn 即将关闭前；listener 可 steer 延长 turn
     */
    'agent/turn-stopping'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> | void

    // ---- error notifications (emit) ----
    /** agent/error：step/turn 出错通知 */
    'agent/error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; error: unknown }): void
  }
}
