/**
 * 【源码解析】tool-calls.ts — 一步内工具调用调度
 * 对应源码：./tool-calls.ts（本文件仅供学习，不参与编译）
 *
 * executeToolCalls(ctx, turn, step, toolCalls, signal, acceptContext)：
 *
 * 1. requireInitiator() 取当前 Agent / session
 * 2. 每个 ToolCallBlock → PlannedCall（解析 JSON arguments）
 * 3. 按 tools 的 executionMode 分组：
 *    - exclusive：屏障，一组一个，跑完再下一组
 *    - parallel-safe：有界滚动池（默认 maxParallelToolCalls=10）
 * 4. 启动前重新 classify（模式可变）
 * 5. 流水线：pre-execute → execute → post-execute → 记 tool/call、tool/result
 * 6. 分发可重叠；策略与结果提交仍按模型顺序
 * 7. acceptContext：已提交结果上下文交给驱动器，进入下一步 inbox
 * 8. concludesTurn 汇总到返回值 { concluded }
 *
 * Abort：
 * - 停新分发，排空已启动
 * - 未启动：合成 tool/call + ABORTED_BEFORE_DISPATCH 结果（回放合法）
 * - 已启动的结果仍走正常 post，上下文可交给 acceptContext
 *
 * 调度器内部故障（TOOL_RUNTIME_SCHEDULER）：
 * - 停新分发、排空已启动
 * - 不虚构 tool/result，向上抛到 turn 错误边界
 *
 * 读 ./tool-calls.ts 时重点看：滚动池 replenish、Slot 按序 finalize、合成 abort 结果对。
 */
