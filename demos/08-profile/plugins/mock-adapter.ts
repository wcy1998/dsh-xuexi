/**
 * Demo 5 · Mock 适配器插件（供 dsh --profile headless 使用）
 *
 * 一个遵守 StreamChunk 协议义务的"假模型"：不发任何网络请求，
 * 让读者在没有 API Key 的情况下跑通 dsh 的真实 Agent 全链路。
 *
 * 能力：
 *   - 普通对话：引用用户输入生成固定风格的回复
 *   - 当请求里带有名为 echo 的工具且用户消息包含 "echo" 时，
 *     第一步发出对 echo 的工具调用，第二步基于工具结果作答（Demo 6/7 用）
 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk, ContentBlock } from '@deepseek-ai/dsh-llm'

export const name = 'mock-adapter'
export const inject = ['llm'] as string[]

/** 把统一词汇表的消息内容拍平成可读文本（演示用） */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join(' ')
  }
  return ''
}

function lastUserText(messages: GenerateOptions['messages']): string {
  // 注意：模型看到的 user 消息不止你的任务本身——
  // dsh 的插件（skills、plan-mode 等）会通过 agent.inject() 注入上下文，
  // 它们以 user-role 消息的形式排在任务之后。
  // 这里取【第一条】user 消息（真正的任务）；把 find 改成 findLast 就能看到注入内容。
  const user = messages.find((m) => m.role === 'user')
  return user ? textOf(user.content) : ''
}

function hasToolResult(messages: GenerateOptions['messages']): boolean {
  return messages.some((m) =>
    m.role === 'user' && Array.isArray(m.content)
    && m.content.some((b) => b.type === 'tool-result'))
}

class MockAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const tools = options.tools ?? []
    const echo = tools.find((t) => t.name === 'echo')
    const userText = lastUserText(options.messages)

    // 决策：该走工具循环吗？
    const shouldCallEcho = Boolean(echo) && !hasToolResult(options.messages) && userText.includes('echo')

    let text: string
    if (shouldCallEcho) {
      text = '我来调用 echo 工具验证一下。'
    } else if (hasToolResult(options.messages)) {
      const resultMsg = options.messages.find((m) =>
        m.role === 'user' && Array.isArray(m.content)
        && m.content.some((b) => b.type === 'tool-result'))!
      const resultText = (resultMsg.content as ContentBlock[])
        .filter((b) => b.type === 'tool-result')
        .flatMap((b) => (b as { content: ContentBlock[] }).content)
        .map((b) => (b.type === 'text' ? (b as { text: string }).text : `[${b.type}]`))
        .join('')
      text = `echo 工具返回了：「${resultText}」。任务完成。`
    } else {
      text = `（MockAdapter，无需网络与 API Key）收到你的消息："${userText}"。` +
        `当前 provider=${options.provider}，model=${options.model}。`
    }

    try {
      // 块 0：文本（逐字流式）
      yield { type: 'block-start', index: 0, blockType: 'text' }
      for (const piece of chunk3(text)) {
        options.signal?.throwIfAborted()
        yield { type: 'text-delta', index: 0, text: piece }
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }

      // 块 1：工具调用（参数保持原始 JSON 字符串）
      if (shouldCallEcho) {
        const args = JSON.stringify({ text: '来自 MockAdapter 的问候' })
        yield { type: 'block-start', index: 1, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 1, id: 'call-echo-1', name: 'echo', argumentsDelta: args }
        yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-echo-1', name: 'echo', arguments: args } }
      }

      // 协议义务：usage 必须在 finish 之前
      yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } }
      yield { type: 'finish', reason: shouldCallEcho ? { kind: 'tool-calls' } : { kind: 'stop' } }
    } catch (err) {
      if (options.signal?.aborted) {
        yield { type: 'finish', reason: { kind: 'aborted', failure: { message: 'aborted', code: 'ABORTED' } } }
        return
      }
      throw err
    }
  }
}

/** 每 3 个字符切一刀，模拟流式增量 */
function chunk3(text: string): string[] {
  return text.match(/[\s\S]{1,3}/g) ?? [text]
}

export function apply(ctx: Context) {
  // 注册是 effect：插件卸载时自动撤销，HMR 安全
  ctx.llm.registerAdapter(['mock'], new MockAdapter())
}
