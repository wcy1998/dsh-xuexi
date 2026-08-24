/**
 * 【源码解析】index.ts — AgentLoop 服务：工厂、配置创建、有序 teardown
 * 对应源码：./index.ts（本文件仅供学习，不参与编译）
 *
 * AgentLoop（ctx.agentLoop）职责：
 * 1. 实现 AgentFactory，setFactory 挂到 ctx.agents
 * 2. prepare → setup → enter/announce → session-start → 可唤醒
 * 3. FactoryOwnership 跟踪 live dispose 与进行中的 create/resume
 * 4. 配置 agents[] 启动时实体化；maxParallelToolCalls 可进 Settings
 */

/**
 * Concrete agent-loop plugin: creates scoped ReactLoopAgents, publishes them
 * through the agent/session registries, and owns their ordered teardown.
 * @module @deepseek-ai/dsh-agent-loop
 */

import { Context, FiberState, Service } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { emitAgentEvent } from '@deepseek-ai/dsh-agent'
import type {
  Agent,
  AgentFactory,
  AgentHandle,
  AgentOptions,
  AgentSetup,
  CreateAgentOptions,
  ResumeAgentOptions,
  SessionStartSource,
} from '@deepseek-ai/dsh-agent'
import { errorChain } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { SessionId, SessionPreparation } from '@deepseek-ai/dsh-session'
import type { Session, SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { ReactLoopAgent } from './agent.ts'
import { DEFAULT_MAX_PARALLEL_TOOL_CALLS } from './constants.ts'

/**
 * FactoryOwnership：工厂级所有权
 * - accepting=false + abort 表示循环不再接新活
 * - liveAgents：每个已发布 agent 的 dispose
 * - startupTasks / trackWrapper：配置启动与公开 create/resume 在途 Promise
 */
class FactoryOwnership {
  // … track / trackStartup / trackWrapper / waitWhileActive / dispose
}

/** raceAbort：setup/load 与 signal 竞速；取消时带 session id 的错误 */
/** raceAbortCall：取消后仍 resolve 的值可经 releaseAbandoned 释放（如 persistence prepare） */

/**
 * PreparedAgent：已构造未发布的资源 + 记忆化 dispose
 * publish(source)：enter 两注册表 → announce → session-start → 返回 Handle
 */

/**
 * AgentLoop extends Service implements AgentFactory
 *
 * 关键路径：
 * - create(id)           同步配置路径，无 setup，丢弃 handle
 * - createAgent(ownerCtx) 编程式，await setup 后 publish('startup')
 * - resume(ownerCtx)      经 sessionPersistence.prepare 再 setupAndPublish('resume')
 *
 * teardown 顺序（dispose）：停循环 → 等退出 → 注销 agent → 移会话 → 撤 scope
 */

export { DEFAULT_MAX_PARALLEL_TOOL_CALLS }
export const CONFIGURED_AGENT_IDENTITIES_KEY = 'configuredAgentIdentities'

/**
 * 读文件时重点看：
 * - prepare()：造 ReactLoopAgent + abort 融合（caller / owner / factory）
 * - setupAndPublish()：setup → commit → publish
 * - 配置 agents 循环：resumeSessionId vs 新 sessionId
 * - installSettingsSection 只挂 maxParallelToolCalls
 */
