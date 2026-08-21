/**
 * Demo 6 · echo 工具插件
 *
 * 注册一个名为 echo 的模型工具：
 *   - 模型面：name/description/parameters 自动进入系统提示词装配
 *   - 执行面：execute(args, exec) 返回 output.schema 声明的规范值
 *   - 渲染面：output.render 产出持久化展示内容
 *
 * 注册是 effect：插件卸载时工具自动消失。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'echo-tool'
export const inject = ['tools'] as string[]

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'echo',
    description: '把传入的文本原样返回。用于验证工具调用链路。',
    parameters: {
      text: { type: 'string', required: true, description: '要原样返回的文本' },
      repeat: { type: 'number', description: '重复次数，默认 1' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    // args 的类型由 parameters 推导：{ text: string; repeat?: number }
    async execute(args, exec) {
      console.log(`[echo-tool] 收到调用：args=${JSON.stringify(args)} callId=${exec.callId}`)
      const n = Math.max(1, Math.min(args.repeat ?? 1, 10))
      return args.text.repeat(n)
    },
  }))
  console.log('[echo-tool] 已注册 echo 工具')
}
