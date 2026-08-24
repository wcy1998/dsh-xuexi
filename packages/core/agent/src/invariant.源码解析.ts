/**
 * 【源码解析】invariant.ts — Agent 生命周期不变量伴侣插件
 * 对应源码：./invariant.ts（本文件仅供学习，不参与编译）
 *
 * 在运行时检查：agent/status 不能重复上报相同状态（无意义的状态重复转换）。
 */

/** 包级说明：Agent 生命周期不变量的 Cordis 伴侣插件 */
/** Package-owned agent lifecycle invariants. @module @deepseek-ai/dsh-agent/invariant */

// Cordis 上下文类型
import type { Context } from '@deepseek-ai/cordis'
// 不变量安装器签名：注册时传入 fail 回调，违反 invariant 时调用
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
// Agent 句柄与状态枚举
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'

// 本包在 invariant 注册表中的唯一名字
const PACKAGE_NAME = '@deepseek-ai/dsh-agent'

/** Cordis 插件导出名，Loader 用此字符串识别插件 */
/** Cordis companion plugin name. */
export const name = 'agent-invariant'
/** 必须先有 invariants 服务，本插件才能 register */
/** Services required before the companion can register. */
export const inject = ['invariants']

/**
 * install：真正的不变量逻辑。
 * 对每个 Agent 用 WeakMap 记住「上一次 status」，新 status 相同则 fail。
 */
/** Install the agent contribution into its child registration fiber. */
const install: InvariantInstaller = (ctx, fail) => {
  // WeakMap：Agent 对象被回收时条目自动消失，不泄漏内存
  const lastStatus = new WeakMap<Agent, AgentStatus>()
  // 全局监听 agent/status（所有 Agent 的状态变化）
  ctx.on('agent/status', ({ agent, status }) => {
    // 取出该 Agent 上一次记录的状态
    const previous = lastStatus.get(agent)
    // 若与本次相同，说明发了「idle→idle」这类无操作转换，违反 invariant
    if (previous === status) {
      fail(`agent/status repeated ${status} (no-op transition)`)
    }
    // 更新缓存为本次状态
    lastStatus.set(agent, status)
  }, { global: true }) // global：不限于某个 fiber，全应用可见
}

/**
 * apply：Cordis 插件入口，把 install 注册到 invariant 服务。
 * @returns 注册成功后的 disposer（卸载时撤销）
 */
/**
 * Register the agent invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  // Promise.resolve 保持与其他 invariant 伴侣一致的异步 apply 签名
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
