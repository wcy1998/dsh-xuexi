/**
 * 【源码解析】model-selection.ts — 运行中切换模型/推理强度
 * 对应源码：./model-selection.ts（本文件仅供学习，不参与编译）
 *
 * 核心思路：prompt 组装时拍快照 `assembled`，同一步的 LLM 请求用同一快照，
 * 避免「组装用 A 模型、请求却走 B 模型」的分裂。
 */

/**
 * 模块说明：Agent 作用域内的模型选择逻辑，供 runtime 入口复用
 * @module @deepseek-ai/dsh-agent/model-selection
 */
/**
 * Agent-scoped model selection shared by runtime entry points.
 * @module @deepseek-ai/dsh-agent/model-selection
 */

import type { Context } from '@deepseek-ai/cordis'
// LlmCallConfig：一次模型调用的完整配置；ReasoningEffortId：推理强度档位
import type { LlmCallConfig, ReasoningEffortId } from '@deepseek-ai/dsh-llm'

/**
 * ModelSelection：为某个 live Agent 选定的 provider + model + 可选 reasoningEffort
 */
/** Complete provider, model, and optional reasoning effort selected for one live Agent. */
export interface ModelSelection {
  /** 已注册的 provider 路由名（如 deepseek） */
  /** Registered provider route. */
  provider: string
  /** 该 provider 下的模型 id */
  /** Provider-owned model id. */
  model: string
  /** 推理强度；省略则走 provider/模型默认 */
  /** Adapter-owned reasoning effort, or provider/default behavior when absent. */
  reasoningEffort?: ReasoningEffortId
}

/**
 * ModelSelectionRef：可变引用，挂在 Agent 入口上。
 * - current：下一步进入 prompt 组装时将采用的选型
 * - assembled：当前 step 进入组装瞬间拍下的快照
 */
/** Mutable model selection plus the value captured for the current step. */
export interface ModelSelectionRef {
  /** Model selected for the next step that enters prompt assembly. */
  current: ModelSelection | undefined
  /** Selection captured when the current step entered prompt assembly. */
  assembled: ModelSelection | undefined
}

/**
 * installModelSelection：在 agentCtx 上挂两个 waterfall 监听器，并返回统一 disposer。
 *
 * 流程：
 * 1. system-prompt/assemble：先 await next() 得到 assembled prompt，再写入 assembled 快照并覆盖 variables 里的 provider/model
 * 2. agent/request：用 assembled 覆盖请求里的 provider/model/reasoningEffort
 */
/**
 * Couple one mutable selection to Agent-scoped prompt assembly and request routing.
 * ...
 */
export function installModelSelection(agentCtx: Context, selection: ModelSelectionRef): () => void {
  // 监听器 1：prompt 组装 waterfall
  const disposeAssembly = agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    // 在调用内层链之前读取「当前选型」（下一步打算用的）
    const selected = selection.current
    // 先让内层（及其他插件）完成组装
    const assembled = await next()
    // 把本次 step 的选型定格为 assembled（后续 request 用这份）
    selection.assembled = selected
    // 若还没选模型，原样返回 assembled，不篡改 variables
    if (selected === undefined) return assembled
    // 合并 variables：在原有 variables 上覆盖 provider、model
    return {
      ...assembled,
      variables: {
        ...assembled.variables,
        provider: selected.provider,
        model: selected.model,
      },
    }
  })
  // 监听器 2：模型请求 waterfall
  const disposeRequest = agentCtx.on(
    'agent/request',
    async (_payload, next): Promise<LlmCallConfig> => {
      // 先走默认链得到「机器本来会用的」LlmCallConfig
      const resolved = await next()
      // 用 assembled 快照（不是 current！保证与 prompt 一致）
      const selected = selection.assembled
      if (selected === undefined) return resolved
      // 去掉继承来的 reasoningEffort，避免旧 effort 粘在新模型上
      const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved
      return {
        ...withoutInheritedEffort,
        provider: selected.provider,
        model: selected.model,
        // 仅当 assembled 显式带了 reasoningEffort 才写入；否则清空 effort
        ...selected.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selected.reasoningEffort },
      }
    },
  )
  // 返回函数：卸载时同时 dispose 两个监听器
  return () => {
    disposeAssembly()
    disposeRequest()
  }
}
