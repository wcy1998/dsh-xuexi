/**
 * 【源码解析】constants.ts — 循环调度默认常量
 * 对应源码：./constants.ts（本文件仅供学习，不参与编译）
 *
 * DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10
 * - 每个 agent 每步并行安全工具调用的默认滚动池上限
 * - 配置 / Settings 可覆盖；1 表示串行
 */

/**
 * Shared agent-loop scheduler defaults.
 * @module dsh-agent-loop/constants
 */

/** Default maximum in-flight parallel-safe calls per agent step. */
export const DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10
