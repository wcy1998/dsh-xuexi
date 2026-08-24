/**
 * 【源码解析】consumed-work.ts — 从会话日志推断「已消费工作」的交代情况
 * 对应源码：./consumed-work.ts（本文件仅供学习，不参与编译）
 *
 * 问题：只看 turn/start～turn/end 不够——有的 turn 没进 step 却像「正常结束」；
 * 有的在 turn 打开前就被 cancel，根本没有 turn/end。
 * foldConsumedWork 单遍扫描事件，找出最近一次「交代过工作」的 turn/end，
 * 以及之后是否还有「领了但没跑就被丢掉」的 inbox 工作。
 */

/**
 * 模块说明：如何根据 agent 日志记账 consumed work
 * @module @deepseek-ai/dsh-agent/consumed-work
 */
/**
 * How one agent log accounts for the work it consumed.
 * ...
 * @module @deepseek-ai/dsh-agent/consumed-work
 */

import type { SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'

/**
 * ConsumedWork：foldConsumedWork 的返回值
 * - end：最近一次「对消费的工作作出交代」的 turn/end 事件（可能不存在）
 * - droppedUnrun：在那次 turn 之后，是否还有「接受后未跑就被取消」的 inbox 项
 */
/** How one agent log accounts for the work it consumed. */
export interface ConsumedWork {
  /**
   * The latest closed turn that accounts for consumed work: one that entered a
   * model step, or one that claimed inbox input and then failed, was stopped,
   * or was rejected. Absent when no turn closed over any work.
   */
  readonly end?: SessionEvent<'turn/end'>
  /**
   * Whether accepted work was cancelled out of the inbox, unrun, after that
   * turn. This is the only account of input a cancellation took before any turn
   * could open over it — no `turn/end` describes it.
   */
  readonly droppedUnrun: boolean
}

/**
 * accountsForClaim：turn 领了 inbox 但从未 step/start 时，turn/end 的 reason 是否算「交代了输入」
 * - completed：输入被 pre-step 改写掉，不算交代领取的那批
 * - blocked/aborted/interrupted/error：都算交代
 */
/**
 * Whether a turn that consumed input but never reached a step ends in a way
 * that accounts for that input. ...
 */
function accountsForClaim(reason: TurnEndReason): boolean {
  switch (reason.kind) {
    case 'completed':
      return false // 正常完成且没 step，说明 claim 被消化/拒绝，不算「消费交代」
    case 'blocked':
    case 'aborted':
    case 'interrupted':
    case 'error':
      return true // 这些结束方式都意味着「领了的输入有结局」
    /* v8 ignore next 4 -- unreachable: ... */
    default:
      return true // 未知 reason 保守视为已交代，避免误判成功
  }
}

/**
 * foldConsumedWork：主算法，线性扫描 events 一次。
 *
 * 维护状态：
 * - stepped：进过 step/start 的 turn 号集合
 * - claimed：在打开 turn 内发生过 inbox claim 的 turn 号集合
 * - open：当前打开的 turn 号
 * - end：目前找到的「交代 turn/end」
 * - droppedUnrun：是否发现 turn 之后的未跑取消
 */
/**
 * Fold one agent log, or an owned suffix of one, into its account of consumed
 * work. ...
 */
export function foldConsumedWork(events: readonly SessionEvent[]): ConsumedWork {
  const stepped = new Set<number>()
  const claimed = new Set<number>()
  let open: number | undefined
  let end: SessionEvent<'turn/end'> | undefined
  let droppedUnrun = false
  for (const event of events) {
    switch (event.type) {
      case 'turn/start':
        open = event.data.turn // 记录当前打开的 turn
        break
      case 'step/start':
        stepped.add(event.data.turn) // 该 turn 至少进过一次模型 step
        break
      case 'agent/inbox/spliced': {
        const { removedCount, outcome, inserted } = event.data
        if (removedCount === undefined) break // 纯插入，不是 claim/取消删除
        // 取消且没有插入替代：工作被丢掉且未跑
        if (outcome === 'canceled') droppedUnrun ||= inserted.length === 0
        // 非取消删除且在 turn 内：视为 loop 的 claim
        else if (open !== undefined) claimed.add(open)
        break
      }
      case 'turn/end': {
        const { turn, reason } = event.data
        open = undefined // turn 已关闭
        // 若该 turn 进过 step，或 claim 了且 end reason 交代了 claim → 更新 end
        if (stepped.delete(turn) || (claimed.delete(turn) && accountsForClaim(reason))) {
          end = event
          // 本次 turn 结束前丢掉的，已由这次 end 交代；清空 droppedUnrun
          droppedUnrun = false
        }
        break
      }
      default:
        break // 其他事件与 consumed work 记账无关
    }
  }
  // end 有值时展开进对象；否则只返回 droppedUnrun
  return { ...end === undefined ? {} : { end }, droppedUnrun }
}
