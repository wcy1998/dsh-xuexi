/**
 * Demo 4 · 注册一个 Mock LLM 适配器
 *
 * 跑法：npm run demo:4
 *
 * 不依赖网络与 API Key：把一个"假的"模型提供方注册进 ctx.llm，
 * 然后用统一词汇表（GenerateOptions / StreamChunk）完成一次完整调用。
 * 这是「模型提供方也是一个插件」的最小可运行证明。
 */
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

// ── 1. Mock 适配器：遵守 StreamChunk 协议义务 ──────────────────────
class MockAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 协议义务①：块按首次出现顺序分配 index
    // 协议义务②：usage 必须在 finish 之前
    // 协议义务③：遵守 options.signal（这里用 try/finally 演示取消）
    const lastUser = [...options.messages].reverse().find((m) => m.role === 'user')
    const text = `我是 MockAdapter。你刚才说："${extractText(lastUser)}"。` +
      `（provider=${options.provider}, model=${options.model}, ` +
      `工具数=${options.tools?.length ?? 0}）`

    try {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      // 模拟逐字流式输出
      for (const piece of text.match(/[\s\S]{1,3}/g) ?? []) {
        await new Promise((r) => setTimeout(r, 30))
        options.signal?.throwIfAborted()
        yield { type: 'text-delta', index: 0, text: piece }
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'usage', usage: { inputTokens: 42, outputTokens: 13 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } catch (err) {
      if (options.signal?.aborted) {
        // 协议义务④：取消 → finish { kind: 'aborted' }
        yield { type: 'finish', reason: { kind: 'aborted', failure: { message: 'aborted', code: 'ABORTED' } } }
        return
      }
      throw err
    }
  }
}

function extractText(message: unknown): string {
  if (!message) return '(空)'
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: 'text'; text: string } =>
        typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text')
      .map((b) => b.text).join(' ')
  }
  return JSON.stringify(content)
}

// ── 2. 组装：LlmRuntime 本身也是一个 Service ───────────────────────
const root = new Context()
await root.plugin(LlmRuntime)          // 类插件：super(ctx, 'llm') 注册为 ctx.llm
console.log('LlmRuntime 已挂载，ctx.llm 可用')

// ── 3. 注册适配器（effect：插件卸载时自动撤销）─────────────────────
const disposeAdapter = root.llm.registerAdapter(['mock'], new MockAdapter())
console.log('MockAdapter 已注册到提供方路由 "mock"')

// 查询注册表
console.log('已注册提供方：', root.llm.listProviders().map((p) => `${p.id}(${p.name})`).join(', '))

// ── 4. 发起一次完整调用（统一词汇表）───────────────────────────────
const request: GenerateOptions = {
  provider: 'mock',
  model: 'mock-1',
  messages: [
    { role: 'user', content: [{ type: 'text', text: '你好，介绍一下你自己' }] },
  ],
  system: '你是一个测试助手',
  tools: [{ name: 'echo', description: '原样返回', parameters: { type: 'object', properties: {} } }],
}

console.log('\n== 流式调用开始 ==')
const assembler = new BlockAssembler()
for await (const chunk of root.llm.stream(request)) {
  const desc = describe(chunk)
  console.log(`  chunk: ${desc}`)
  assembler.push(chunk)
}

console.log('\n== 组装结果 ==')
const message = assembler.message()
console.log('  文本：', message?.content.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join(''))
console.log('  usage：', JSON.stringify(assembler.usage))
console.log('  finish：', JSON.stringify(assembler.finish))

// ── 5. 演示取消 ────────────────────────────────────────────────────
console.log('\n== 取消演示：300ms 后中止调用 ==')
const ac = new AbortController()
setTimeout(() => ac.abort(), 300)
try {
  for await (const chunk of root.llm.stream({ ...request, signal: ac.signal })) {
    console.log('  chunk:', describe(chunk))
  }
} catch (err) {
  console.log('  调用被取消（异常路径）：', (err as Error).message)
}

// ── 6. 注销适配器（热重载安全）─────────────────────────────────────
disposeAdapter()
console.log('\n适配器已注销，提供方列表：', root.llm.listProviders().length === 0 ? '(空)' : root.llm.listProviders().map((p) => p.id).join(', '))
await root.fiber.dispose()

function describe(chunk: StreamChunk): string {
  switch (chunk.type) {
    case 'block-start': return `block-start #${chunk.index} (${chunk.blockType})`
    case 'text-delta': return `text-delta #${chunk.index} "${chunk.text}"`
    case 'block-end': return `block-end #${chunk.index}`
    case 'usage': return `usage ${JSON.stringify(chunk.usage)}`
    case 'finish': return `finish ${chunk.reason.kind}`
    default: return chunk.type
  }
}
