/**
 * 【源码解析】invariant.ts — 本包 intentionally empty 的 invariant 配套
 * 对应源码：./invariant.ts（本文件仅供学习，不参与编译）
 *
 * 为何空：可变默认模型经 Settings schema 校验后才可被 currentSelection() 观察到，
 * 没有独立的 event/data 关系需要 runtime invariant 再查一遍。
 */

/**
 * Package-owned invariant companion for the default Agent model selection.
 * @module @deepseek-ai/dsh-agent-default-model/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-agent-default-model'

/** Cordis 配套插件名 */
export const name = 'agent-default-model-invariant'
/** 依赖 invariants 服务后再 register */
export const inject = ['invariants']

/** 空 installer：显式声明「本包无运行时 invariant」 */
const install: InvariantInstaller = () => {}

/**
 * apply：向 ctx.invariants 注册空贡献。
 * 满足 packages 必须提供 ./invariant 的仓库约定。
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
