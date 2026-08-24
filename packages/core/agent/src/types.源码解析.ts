/**
 * 【源码解析】types.ts
 * 对应源码：./types.ts | 本文件仅供学习，不参与编译
 */

/**
 * Durable agent session-event vocabulary shared with type-only consumers.
 *
 * @module @deepseek-ai/dsh-agent/types
 */
// ↑ 模块说明：本文件定义与「仅消费类型」的模块共享的 Agent 会话事件词汇

import type { UserMessage } from '@deepseek-ai/dsh-llm/types'
// ↑ 从 LLM 包导入 UserMessage 类型（用户消息：id、content、来源等）

/** One of the two ordered pending-message lists owned by an agent. */
export type InboxTarget = 'next-turn' | 'next-step'
// ↑ InboxTarget：Agent 拥有的两条有序待处理队列的名字
//   - 'next-turn'：排队等待「单独开一轮」的普通跟进消息
//   - 'next-step'：等待「下一步边界」的 steering / inject 类输入

declare module '@deepseek-ai/dsh-session/types' {
// ↑ 模块合并：扩展 session 包的 SessionEventMap，无需改 session 源码
  interface SessionEventMap {
    /**
     * One normalized mutation of an agent's durable pending-message lists.
     * Live dispatch precedes projection mutation, so synchronous observers may
     * read the pre-splice inbox to recover the removed messages.
     */
    // ↑ agent/inbox/spliced：收件箱发生一次规范化 splice 时写入会话日志
    //   先派发实时通知、再改内存投影，同步监听器可读 splice 前状态
    'agent/inbox/spliced': {
      target: InboxTarget
      // ↑ 被改动的队列：next-turn 或 next-step
      start: number
      // ↑ splice 起始下标（已规范化为合法范围）
      removedCount?: number
      // ↑ 删除条数；纯插入时可省略
      inserted: UserMessage[]
      // ↑ 插入的消息列表（可为空）
      outcome?: 'canceled'
      // ↑ 用户可见的取消删除时标 'canceled'
    }
  }
}
