/**
 * 【源码解析】inbox.ts — 收件箱：两条队列的增量投影 + 持久化 splice
 * 对应源码：./inbox.ts（本文件仅供学习，不参与编译）
 *
 * Inbox 是「会话日志里 agent/inbox/spliced 事件」的内存投影。
 * 每次 mutate 先 append 日志事件，再改内存；同步监听器能看到 splice 前状态。
 */

/**
 * Incremental projection of durable agent inbox events.
 * @module @deepseek-ai/dsh-agent/inbox
 */
/**
 * Incremental projection of durable agent inbox events.
 *
 * @module @deepseek-ai/dsh-agent/inbox
 */

import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEventMap, UserMessage } from '@deepseek-ai/dsh-session'
import type { InboxTarget } from './types.ts'

/** InboxState：两个队列名 → 可变 UserMessage 数组 */
/** Mutable state privately owned by an {@link Inbox}. */
type InboxState = Record<InboxTarget, UserMessage[]>

/**
 * InboxNotifications：mutate 时向 live 层发布的回调（inserted/discarded/claimed）
 */
/** Live notifications committed by inbox mutations. */
export interface InboxNotifications {
  /** Publish one inserted message. */
  inserted(message: UserMessage): void
  /** Publish one discarded message. */
  discarded(message: UserMessage): void
  /** Publish one claimed message inside its owning turn. */
  claimed(message: UserMessage, turn: number): void
}

/**
 * Inbox 类：从 seed 之后的事件重放构建初始状态，之后每次 splice 增量更新。
 */
/** A replay-once projection that incrementally consumes later inbox splices. */
export class Inbox {
  // 私有状态：两条队列初始为空数组
  private readonly state: InboxState = { 'next-turn': [], 'next-step': [] }

  constructor(
    private readonly session: Session, // 写 splice 事件的会话
    private readonly notifications: InboxNotifications, // live 通知桥
  ) {
    // 从 seedLength 起重放历史 splice，恢复持久化后的 inbox 投影
    for (const event of session.events.slice(session.header.seedLength ?? 0)) {
      if (event.type !== 'agent/inbox/spliced') continue
      try {
        this.apply(event.data) // 只改内存，不再写日志
      } catch (error: unknown) {
        throw new Error(`invalid persisted inbox splice at session seq ${event.seq}`, { cause: error })
      }
    }
  }

  /** nextTurn：只读视图，排队等单独一轮的消息 */
  /** Prompts awaiting individual turns. */
  get nextTurn(): readonly UserMessage[] {
    return this.state['next-turn']
  }

  /** nextStep：只读视图，等下一步边界的 steering/inject */
  /** Input awaiting the next step boundary. */
  get nextStep(): readonly UserMessage[] {
    return this.state['next-step']
  }

  /** hasPending：任一条队列非空即有待处理工作 */
  /** Whether either pending-message list contains work. */
  get hasPending(): boolean {
    return this.nextTurn.length > 0 || this.nextStep.length > 0
  }

  /**
   * clear：取消全部待处理输入。
   * 顺序：先清 next-step，再清 next-turn（与 step 边界消费顺序一致）。
   */
  /** Durably cancel all pending input, clearing next-step before next-turn. */
  clear(): void {
    this.splice('next-step', 0, this.nextStep.length, [])
    this.splice('next-turn', 0, this.nextTurn.length, [])
  }

  /**
   * claim：loop 在 step 边界调用，取出本 step 要用的消息批次。
   * - 总是先 claim 全部 next-step
   * - target===next-turn 时再 claim 一条 next-turn（新开一轮的普通消息）
   * discardRemoved=false：删除不算「用户取消」，不标 outcome:canceled
   */
  /**
   * Remove and return the complete batch proposed for one step, publishing
   * each claimed message. ...
   */
  claim(target: InboxTarget, turn: number): UserMessage[] {
    const claimed = this.mutate('next-step', 0, this.nextStep.length, [], false)
    if (target === 'next-turn') {
      claimed.push(...this.mutate('next-turn', 0, 1, [], false))
    }
    for (const message of claimed) this.notifications.claimed(message, turn)
    return claimed
  }

  /** append：在队列末尾追加一条并写日志 */
  /** Append one message to a pending list and durably record the insertion. */
  append(target: InboxTarget, message: UserMessage): void {
    this.splice(target, this.state[target].length, 0, [message])
  }

  /** prepend：在队列头部插入一条 */
  /** Prepend one message to a pending list and durably record the insertion. */
  prepend(target: InboxTarget, message: UserMessage): void {
    this.splice(target, 0, 0, [message])
  }

  /**
   * replace：按 messageId 定位并替换；旧消息 discarded，新消息 inserted
   */
  /** Replace one pending message in place, possibly changing its identity. */
  replace(messageId: MessageId, newMessage: UserMessage): boolean {
    const location = this.locate(messageId)
    if (location === undefined) return false
    this.splice(location.target, location.index, 1, [newMessage])
    return true
  }

  /** remove：按 id 删除一条待处理消息（记为 canceled splice） */
  /** Remove one pending message and durably record its cancellation. */
  remove(messageId: MessageId): boolean {
    const location = this.locate(messageId)
    if (location === undefined) return false
    this.splice(location.target, location.index, 1, [])
    return true
  }

  /**
   * splice：公开入口，discardRemoved=true（删除会触发 discarded 通知与 canceled outcome）
   */
  /** Apply standard splice semantics and durably record the normalized result. */
  splice(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    inserted: UserMessage[],
  ): UserMessage[] {
    return this.mutate(target, start, deleteCount, inserted, true)
  }

  /** locate：在两条队列里按 message.id 查找下标 */
  /** Locate one pending identity across both owned lists. */
  private locate(messageId: MessageId): { target: InboxTarget; index: number } | undefined {
    for (const target of ['next-turn', 'next-step'] as const) {
      const index = this.state[target].findIndex(message => message.id === messageId)
      if (index >= 0) return { target, index }
    }
    return undefined
  }

  /**
   * mutate：核心——规范化坐标 → validate → append 日志 → 改内存 → 发通知
   */
  /** Commit one normalized mutation and publish its live notifications. */
  private mutate(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    inserted: UserMessage[],
    discardRemoved: boolean,
  ): UserMessage[] {
    const inbox = this.state[target]
    // 规范化 start（支持负索引、NaN→0、越界截断）
    const truncatedStart = Math.trunc(start)
    const offset = Number.isNaN(truncatedStart) ? 0 : truncatedStart
    const actualStart = offset < 0
      ? Math.max(inbox.length + offset, 0)
      : Math.min(offset, inbox.length)
    const truncatedDeleteCount = Math.trunc(deleteCount)
    const actualDeleteCount = Math.min(
      Math.max(Number.isNaN(truncatedDeleteCount) ? 0 : truncatedDeleteCount, 0),
      inbox.length - actualStart,
    )
    if (actualDeleteCount === 0 && inserted.length === 0) return [] // 无操作
    // 用户可见的删除且 discardRemoved → outcome canceled
    const outcome = discardRemoved && actualDeleteCount > 0 ? 'canceled' as const : undefined
    const splice = {
      target,
      start: actualStart,
      ...(actualDeleteCount === 0 ? {} : { removedCount: actualDeleteCount }),
      inserted,
      ...(outcome === undefined ? {} : { outcome }),
    }
    this.validate(splice) // 越界、重复 id 等
    const event = this.session.append('agent/inbox/spliced', splice) // 先落日志
    const removed = inbox.splice(actualStart, actualDeleteCount, ...event.data.inserted)
    if (discardRemoved) {
      for (const message of removed) this.notifications.discarded(message)
    }
    for (const message of event.data.inserted) this.notifications.inserted(message)
    return removed
  }

  /** apply：重放历史事件时只改内存，不写日志 */
  /** Apply one normalized durable splice to the projection. */
  private apply(splice: SessionEventMap['agent/inbox/spliced']): UserMessage[] {
    this.validate(splice)
    const inbox = this.state[splice.target]
    return inbox.splice(splice.start, splice.removedCount ?? 0, ...splice.inserted)
  }

  /**
   * validate：检查 splice 合法且合并两条队列后 message.id 不重复
   */
  /** Validate one normalized splice against the current projection. */
  private validate(splice: SessionEventMap['agent/inbox/spliced']): void {
    const inbox = this.state[splice.target]
    const removedCount = splice.removedCount ?? 0
    if (!Number.isSafeInteger(splice.start) || splice.start < 0 || splice.start > inbox.length
      || !Number.isSafeInteger(removedCount) || removedCount < 0
      || splice.start + removedCount > inbox.length) {
      throw new Error('invalid inbox splice')
    }
    const candidate = inbox.toSpliced(splice.start, removedCount, ...splice.inserted)
    const ids = new Set<string>()
    // 校验「改动的队列 + 另一条队列」合并后的全局 id 唯一性
    for (const message of splice.target === 'next-turn'
      ? [...candidate, ...this.nextStep]
      : [...this.nextTurn, ...candidate]) {
      if (ids.has(message.id)) throw new Error(`message "${message.id}" is already pending`)
      ids.add(message.id)
    }
  }
}
