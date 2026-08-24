/**
 * 【源码解析】agent.ts — ReactLoopAgent：具体驱动器
 * 对应源码：./agent.ts（本文件仅供学习，不参与编译）
 *
 * 包内唯一 Agent 实现。不对外导出；经 AgentLoop 发布后以 Agent 把手出现。
 *
 * 核心状态机 phase：
 * - idle { lastTurn }
 * - running { abort, turn, step, wakeRequested }
 * - maintenance { abort, lastTurn, wakeRequested }  // 对外 status 仍 idle
 *
 * 主路径：send/followup → wakeDriver → withInitiator(kick) → while turn()
 * turn：claim → pre-step → step(模型+工具) → turn-stopping? → turn/end
 */

/**
 * Default Agent driver over queued turns and step-boundary input.
 * @module dsh-agent-loop/agent
 */

import type { Agent, InboxTarget, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { Inbox, agentEvents, assembleContextFor } from '@deepseek-ai/dsh-agent'
// … llm / session / system-prompt / cordis …
import { RuntimeContextProjection } from './runtime-context.ts'
import { executeToolCalls } from './tool-calls.ts'

/**
 * Phase：驱动器私有状态；status 由 phase.kind 派生
 * wakeRequested：cancel/maintenance 收敛窗口锁存的唤醒
 */

/**
 * ReactLoopAgent implements Agent
 *
 * 构造：
 * - agentEvents(loopCtx, this) 融合分发器（热路径不重复分配）
 * - Inbox + inserted/discarded/claimed 通知
 * - createScope → ctx.extend({ agent: this })
 * - RuntimeContextProjection 跟踪动态上下文快照
 *
 * send(message, target, wakeup)：
 * - 若活动已 abort 且 wakeup：改投 next-turn，wakeAfterAbort=true
 * - splice 写入 inbox；wakeup 则 wakeDriver
 *
 * wakeDriver：
 * - 非 idle：maintenance 或 abort 后锁存；disposed 不锁存；活 running 自 claim
 * - idle：切 running，withInitiator(() => kick())
 *
 * kick：while (await turn())；finally 回 idle，必要时重放 wakeRequested
 *
 * turn()：
 * - turn/start；首步 target=next-turn，之后 next-step
 * - preStep → reject/空批可无模型调用结束
 * - step/start → user/message → step() → step/end
 * - turn-stopping；inbox 仍有活则换 AbortController 返回 true
 *
 * step(assembly)：
 * - buildRequest → stream chunks → assistant/message
 * - executeToolCalls；失败进 agent/request-error 可 retry
 *
 * buildRequest：
 * - agent/request waterfall → llm.prepareCall → 记 request/header
 * - 去掉 adapterDefaults 标记字段，让新路由重填默认
 *
 * cancel：默认 clear inbox + abort；idle 空操作
 * runMaintenance：仅 true idle；结束后可重放 wake
 * whenIdle：跟 activityDone 直到引用稳定
 */

/**
 * 读文件时重点看：
 * - setPhase 与 agent/status 的对应
 * - preStep 里 claim + runtimeContext.project + assemble
 * - 取消流 interrupted 锚点（用户已见前缀）
 * - max-tokens 粘性 turnEnds
 */
