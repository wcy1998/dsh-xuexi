/**
 * 【源码解析】index.ts — Agent 服务：注册表、工厂委托、发起方作用域
 * 对应源码：./index.ts（本文件仅供学习，不参与编译）
 *
 * AgentRegistry（ctx.agents）职责：
 * 1. 跟踪 live Agent（register/enter/announce/get/list）
 * 2. 委托 AgentLoop 的 create/resume（setFactory）
 * 3. AsyncLocalStorage 传递「当前发起方 Agent」（withInitiator / withoutInitiator）
 */

/**
 * Agent service: live registry, factory delegation, and process-local
 * initiator scope. Concrete creation and driving belong to the loop.
 * @module @deepseek-ai/dsh-agent
 */
/**
 * Agent service: live registry, factory delegation, and process-local
 * initiator scope. Concrete creation and driving belong to the loop.
 *
 * @module @deepseek-ai/dsh-agent
 */

import { Context, FiberState, getTraceable, Service, symbols } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { AsyncLocalStorage } from 'node:async_hooks'
import { isPromise } from 'node:util/types'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import type { Scoped } from '@deepseek-ai/dsh-scope'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { TypertContext, TypertLookup } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent, AgentOptions } from './runtime-types.ts'

// 再导出类型与子模块，构成包公共 API
export * from './runtime-types.ts'
export * from './types.ts'
export * from './inbox.ts'
export * from './consumed-work.ts'
export * from './model-selection.ts'
export { agentCarrier, agentEvents, assembleContextFor, emitAgentEvent } from './dispatch.ts'
export type { AgentEventDispatch, AgentSubjectEvent } from './dispatch.ts'

/** Typert：wire 上的 agentId 解析为 live Agent / Agent.ctx */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertLookupMap {
    agent: TypertLookup<Agent, SessionId>
  }
  interface TypertContextMap {
    agent: TypertContext<SessionId>
  }
}

/** Context.agent：DX 用可选字段；Agent.ctx 用 own property 覆盖 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    agents: AgentRegistry
    agent?: Agent
  }
}

/** AgentSetupCommit：setup 可在发布前最后一瞬同步 commit/校验 */
export interface AgentSetupCommit {
  commit(): void
}

/** AgentSetup：创建未发布 Agent 作用域时的组合回调 */
export type AgentSetup = (
  agentCtx: Context,
) => AgentSetupCommit | Promise<AgentSetupCommit | void> | void

/**
 * CreateAgentOptions：registry.create 的参数——sessionId、seed、meta、setup 等
 */
export interface CreateAgentOptions {
  readonly sessionId: SessionId
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly seedLength?: number
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
  readonly seed?: readonly SessionEvent[]
  readonly agentOptions?: AgentOptions
  readonly signal?: AbortSignal
  readonly setup?: AgentSetup
}

/** ResumeAgentOptions：从持久化 session 恢复 */
export interface ResumeAgentOptions {
  readonly resumeSessionId: SessionId
  readonly agentOptions?: AgentOptions
  readonly signal?: AbortSignal
  readonly setup?: AgentSetup
}

/**
 * AgentHandle：create/resume 返回的「Agent + dispose 能力」
 * dispose 是 capability，只有持有者能 teardown
 */
export interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}

/**
 * AgentFactory：由 dsh-agent-loop 实现并 setFactory 注册
 */
export interface AgentFactory {
  createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>
  resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
}

const NO_FACTORY_MESSAGE = 'no agent factory registered (load an agent-loop plugin)'
const NO_INITIATOR_MESSAGE = 'no initiating agent is active'
const DISPOSED_INITIATOR_MESSAGE = 'agent initiator scope is disposed'

/** AgentEntry：注册表里一条 Agent 的可变元数据 */
interface AgentEntry {
  readonly id: SessionId
  readonly agent: Agent
  readonly owner: Agent | undefined // 运行时创建者，非持久 parentSession
  readonly carrier: Scoped<Agent>
  announced: boolean
  announcing: boolean
  detachRequested: boolean
}

/** InitiatorRun：一次 initiator 边界及其父链 */
interface InitiatorRun {
  active: boolean
  readonly parent: InitiatorRun | undefined
}

/** FactorySlot：避免 Cordis 过早 trace factory 字段 */
interface FactorySlot {
  readonly target: AgentFactory
}

/**
 * AgentRegistry：Cordis Service，名称为 'agents'
 */
export class AgentRegistry extends Service {
  private store = new Map<SessionId, AgentEntry>()
  private factory: FactorySlot | undefined
  private readonly initiators = new AsyncLocalStorage<Agent | undefined>()
  private readonly initiatorRuns = new AsyncLocalStorage<InitiatorRun>()
  private initiatorState: 'active' | 'closing' | 'disposed' = 'active'
  private activeInitiatorRuns = 0
  private initiatorDrain: PromiseWithResolvers<void> | undefined
  private initiatorDisposal: Promise<void> | undefined

  constructor(ctx: Context) {
    super(ctx, 'agents')
    // 注册 Typert lookup/context：agentId → Agent / ctx
    ctx.inject(['typert'], (typeCtx) => {
      typeCtx.typert.lookups.register('agent', {
        parameter: 'agent',
        wire: 'agentId',
        hostTypeSymbol: '@deepseek-ai/dsh-agent#Agent',
        wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
        resolve: sessionId => this.get(sessionId),
      })
      typeCtx.typert.contexts.registerHost('agent', {
        wire: 'agentId',
        wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
        resolve: sessionId => this.get(sessionId)?.ctx,
      })
    })
    // ctx.agent 默认 undefined，避免普通 ctx 读 agent 抛错
    ctx.accessor('agent', { get: () => undefined })
    // fiber UNLOADING 时若为本服务祖先链，关闭新 initiator 边界
    ctx.on('internal/status', (fiber) => {
      if (fiber.state === FiberState.UNLOADING && this.hasLifecycleAncestor(fiber)) {
        this.closeInitiators()
      }
    })
    ctx.effect(function* (this: AgentRegistry) {
      yield () => this.disposeInitiators()
      yield () => { this.closeInitiators() }
    }.bind(this), 'agents.initiatorLifecycle()')
  }

  /** currentInitiator：可选读当前继承的发起方 Agent */
  currentInitiator(): Agent | undefined {
    this.assertInitiatorsReadable()
    return this.initiators.getStore()
  }

  /** requireInitiator：必须有 initiator，否则抛错 */
  requireInitiator(): Agent {
    const agent = this.currentInitiator()
    if (agent === undefined) throw new Error(NO_INITIATOR_MESSAGE)
    return agent
  }

  /** withInitiator：在边界内把 agent 设为发起方，保留 operation 返回值 */
  withInitiator<T>(agent: Agent, operation: () => T): T {
    return this.runWithInitiator(agent, operation)
  }

  /** withoutInitiator：清除继承的发起方（定时器、队列泵等用） */
  withoutInitiator<T>(operation: () => T): T {
    return this.runWithInitiator(undefined, operation)
  }

  /**
   * setFactory：注册 AgentLoop 工厂；重复注册抛错；返回 effect disposer
   */
  setFactory(factory: AgentFactory): () => void {
    const dispose = this.ctx.effect(() => {
      if (this.factory !== undefined) throw new Error('an agent factory is already registered')
      const target = (factory as AgentFactory & { [symbols.original]?: AgentFactory })[symbols.original] ?? factory
      this.factory = { target }
      return () => { this.factory = undefined }
    }, 'agents.setFactory()')
    return dispose
  }

  private requireFactory(): FactorySlot {
    if (this.factory === undefined) throw new Error(NO_FACTORY_MESSAGE)
    return this.factory
  }

  /** create：委托 factory.createAgent，ownerCtx 为本 registry 的 ctx */
  async create(options: CreateAgentOptions): Promise<AgentHandle> {
    const ownerCtx = this.ctx
    const { target } = this.requireFactory()
    const receiver = getTraceable(ownerCtx, target)
    return Reflect.apply(target.createAgent, receiver, [ownerCtx, options])
  }

  /** resume：委托 factory.resume */
  async resume(options: ResumeAgentOptions): Promise<AgentHandle> {
    const ownerCtx = this.ctx
    const { target } = this.requireFactory()
    const receiver = getTraceable(ownerCtx, target)
    return Reflect.apply(target.resume, receiver, [ownerCtx, options])
  }

  /**
   * register：登记已构造 Agent，立即 announce，fiber dispose 时自动注销
   */
  register(agent: Agent): () => void {
    const dispose = this.ctx.effect(function* (this: AgentRegistry) {
      yield this.enter(agent, this.ctx.agent)
      this.announce(agent)
    }.bind(this), 'agents.register()')
    return dispose
  }

  /**
   * enter：插入未 announce 的 Agent（工厂用）；返回 detach 闭包
   */
  enter(agent: Agent, owner: Agent | undefined): () => void {
    const id = agent.id
    if (id !== agent.session.id) {
      throw new Error(`agent id "${id}" does not match session id "${agent.session.id}"`)
    }
    const carrier = scopeTarget(agent, agent)
    if (this.store.has(id)) throw new Error(`agent "${id}" is already registered`)
    const entry: AgentEntry = {
      id, agent, owner, carrier,
      announced: false, announcing: false, detachRequested: false,
    }
    this.store.set(id, entry)
    let entered = true
    const detach = (): void => {
      if (!entered) return
      entered = false
      // announce 同步派发期间延迟 detach，保证 created 监听器看到稳定条目
      if (entry.announcing) {
        entry.detachRequested = true
        return
      }
      this.detachEntered(entry)
    }
    return detach
  }

  /** detachEntered：从 store 删除；若已 announce 则 emit agent/disposed */
  private detachEntered(entry: AgentEntry): void {
    entry.detachRequested = false
    if (this.store.get(entry.id) !== entry) return
    this.store.delete(entry.id)
    if (!entry.announced) return
    this.emitDisposed(entry)
  }

  /** emitDisposed：手动 dispatch emit，contain 监听器错误 */
  private emitDisposed(entry: AgentEntry): void {
    const args: unknown[] = [entry.carrier, 'agent/disposed', { agent: entry.agent }]
    for (const callback of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned: unknown = callback(...args)
        void Promise.resolve(returned).catch((error: unknown) => {
          this.ctx.logger.warn(`agent "${entry.id}": agent/disposed listener rejected: ${String(error)}`)
        })
      } catch (error: unknown) {
        this.ctx.logger.warn(`agent "${entry.id}": agent/disposed listener threw: ${String(error)}`)
      }
    }
  }

  /** announce：对已 enter 的 Agent 发 agent/created */
  announce(agent: Agent): void {
    const entry = this.store.get(agent.id)
    if (entry === undefined || entry.agent !== agent) {
      throw new Error(`agent "${agent.id}" is not live in this registry`)
    }
    if (entry.announced || entry.announcing) {
      throw new Error(`agent "${entry.id}" was already announced`)
    }
    entry.announcing = true
    entry.announced = true
    const args: unknown[] = [entry.carrier, 'agent/created', { agent: entry.agent }]
    try {
      for (const callback of this.ctx.events.dispatch('emit', args)) {
        const returned: unknown = callback(...args)
        void Promise.resolve(returned).catch((error: unknown) => {
          this.ctx.logger.warn(`agent "${entry.id}": agent/created listener rejected: ${String(error)}`)
        })
      }
    } finally {
      entry.announcing = false
      if (entry.detachRequested) this.detachEntered(entry)
    }
  }

  get(id: SessionId): Agent | undefined {
    return this.store.get(id)?.agent
  }

  isOwnedBy(id: SessionId, owner: Agent): boolean {
    return this.store.get(id)?.owner === owner
  }

  list(): Agent[] {
    return [...this.store.values()].map(entry => entry.agent)
  }

  roots(): Agent[] {
    return [...this.store.values()]
      .filter(entry => entry.owner === undefined)
      .map(entry => entry.agent)
  }

  private closeInitiators(): void {
    if (this.initiatorState === 'active') this.initiatorState = 'closing'
  }

  private disposeInitiators(): Promise<void> {
    return (this.initiatorDisposal ??= (async () => {
      this.closeInitiators()
      this.releaseReentrantInitiatorRuns()
      if (this.activeInitiatorRuns !== 0) {
        this.initiatorDrain ??= Promise.withResolvers<void>()
        await this.initiatorDrain.promise
      }
      this.initiatorState = 'disposed'
      this.initiators.disable()
      this.initiatorRuns.disable()
    })())
  }

  /** runWithInitiator：建立 ALS 边界；Promise 在 settle 后 release */
  private runWithInitiator<T>(agent: Agent | undefined, operation: () => T): T {
    if (this.initiatorState !== 'active') throw new Error(DISPOSED_INITIATOR_MESSAGE)
    const run: InitiatorRun = { active: true, parent: this.initiatorRuns.getStore() }
    this.activeInitiatorRuns += 1
    let result: T
    try {
      result = this.initiatorRuns.run(run, () => this.initiators.run(agent, operation))
    } catch (error: unknown) {
      this.releaseInitiatorRun(run)
      throw error
    }
    if (isPromise(result)) {
      try {
        void Promise.prototype.then.call(
          result,
          () => { this.releaseInitiatorRun(run) },
          () => { this.releaseInitiatorRun(run) },
        )
      } catch {
        this.releaseInitiatorRun(run)
      }
    } else {
      this.releaseInitiatorRun(run)
    }
    return result
  }

  private hasLifecycleAncestor(candidate: Fiber): boolean {
    let fiber = this.ctx.fiber
    while (true) {
      if (fiber === candidate) return true
      const parent = fiber.parent.fiber
      if (parent === fiber) return false
      fiber = parent
    }
  }

  private assertInitiatorsReadable(): void {
    if (this.initiatorState === 'disposed') throw new Error(DISPOSED_INITIATOR_MESSAGE)
  }

  private releaseReentrantInitiatorRuns(): void {
    let run = this.initiatorRuns.getStore()
    while (run !== undefined) {
      this.releaseInitiatorRun(run)
      run = run.parent
    }
  }

  private releaseInitiatorRun(run: InitiatorRun): void {
    if (!run.active) return
    run.active = false
    this.activeInitiatorRuns -= 1
    if (this.activeInitiatorRuns !== 0) return
    this.initiatorDrain?.resolve()
    this.initiatorDrain = undefined
  }
}

export default AgentRegistry
