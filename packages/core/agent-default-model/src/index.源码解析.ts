/**
 * 【源码解析】index.ts — 进程级默认 Agent 模型选择
 * 对应源码：./index.ts（本文件仅供学习，不参与编译）
 *
 * AgentDefaultModelConfig（ctx.agentDefaultModel）职责：
 * 1. 持有 cordis 组合 config 作为 Settings 分节的 base
 * 2. 通过 installSettingsSection 在用户 settings.yaml 存在时读上层
 * 3. currentSelection / saveSelection 供 headless、ApiProxy 等入口统一消费
 */

/**
 * Default model selection for an Agent without a session-specific selection.
 * @module @deepseek-ai/dsh-agent-default-model
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Cordis Context 注入：全局默认模型服务 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Default model selection for Agents created without an explicit model. */
    agentDefaultModel: AgentDefaultModelConfig
  }
}

/** Settings 分节名，对应 settings.yaml 里的 agent-default-model 键 */
export const AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE = settingsNamespace('agent-default-model')

/** 持久化 / 合并后的设置形状（比插件 Config 多 optional reasoningEffort） */
export interface AgentDefaultModelSettings {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Settings 注册用的 schema；reasoningEffort 可选字符串 */
export const AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA: z<AgentDefaultModelSettings> = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string(),
})

/** 插件 cordis.yml config：只有 provider + model，故意不含 reasoningEffort */
export interface Config {
  provider: string
  model: string
}

/**
 * 把内部存储投影为 dsh-agent 的 ModelSelection。
 * effort 有值时包成 ReasoningEffortId branded 类型。
 */
function selection(settings: AgentDefaultModelSettings): ModelSelection {
  return {
    provider: settings.provider,
    model: settings.model,
    ...settings.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(settings.reasoningEffort) },
  }
}

/**
 * AgentDefaultModelConfig：进程级默认模型服务。
 *
 * source 闭包是当前权威读路径：
 * - 无 settings：() => 组合 entry
 * - 有 settings：() => scope.get()（base + 用户层）
 */
export class AgentDefaultModelConfig extends Service {
  static Config: z<Config> = z.object({
    provider: z.string().required(),
    model: z.string().required(),
  })

  /** 可变：指向「当前该怎么读」的 thunk */
  private source: () => AgentDefaultModelSettings

  constructor(ctx: Context, config: Config) {
    super(ctx, 'agentDefaultModel')
    // 组合项副本，也是 settings 卸载后的回退
    const entry: AgentDefaultModelSettings = { provider: config.provider, model: config.model }
    this.source = () => entry
    installSettingsSection(ctx, AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA, entry, {
      // settings 挂上/卸载时切换 source；onChange 空实现因为无注册级缓存
      setSource: (current) => { this.source = current },
      onChange: () => {},
    })
  }

  /** 读当前默认；返回 detached 副本，每次调用现读 source() */
  currentSelection(): ModelSelection {
    return selection(this.source())
  }

  /**
   * 写用户默认到 settings 分节。
   * 无 ctx.settings 时 optional chaining 使整个调用 no-op。
   */
  async saveSelection(next: ModelSelection): Promise<void> {
    await this.ctx.get('settings')?.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, {
      provider: next.provider,
      model: next.model,
      ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
    })
  }
}

export default AgentDefaultModelConfig
