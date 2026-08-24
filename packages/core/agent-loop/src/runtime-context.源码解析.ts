/**
 * 【源码解析】runtime-context.ts — 动态运行时上下文快照投影
 * 对应源码：./runtime-context.ts（本文件仅供学习，不参与编译）
 *
 * RuntimeContextProjection：
 * - 归属插件 SOURCE = '@deepseek-ai/dsh-system-prompt'
 * - 跟踪「上次已保留」的 runtime context 用户消息（seq + text）
 * - retained：
 *   - undefined：从未有过快照
 *   - null：曾有过但被压缩等替换表层清掉
 *   - { seq, text }：仍在 surface 上
 *
 * 构造：从后往前扫 session.events，在 surface 上找到自有 user/message 恢复 retained；
 * 并监听 session/event：新快照更新；替换事件引用 retained.seq 则清为 null。
 *
 * project(current, sections)：
 * - 空 current → 使用固定 CLEARED 文案（「早期快照不再适用」）
 * - 与 retained.text 相同 → 返回 undefined（不重复写入）
 * - 否则 createUserMessage，source.form = 'snapshot' + sections 归因
 *
 * 由 ReactLoopAgent.preStep 在 claim 之后调用，把候选消息并入本步批次。
 *
 * 读 ./runtime-context.ts 时重点看：surface 集合、isReplacementSurfaceEvent、CLEARED 常量。
 */
