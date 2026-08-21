import { LlmAdapter } from "@deepseek-ai/dsh-llm";
export const name = "mock-adapter";
export const inject = ["llm"];
function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
  }
  return "";
}
function lastUserText(messages) {
  const user = messages.find((m) => m.role === "user");
  return user ? textOf(user.content) : "";
}
function hasToolResult(messages) {
  return messages.some((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool-result"));
}
class MockAdapter extends LlmAdapter {
  async *stream(options) {
    const tools = options.tools ?? [];
    const echo = tools.find((t) => t.name === "echo");
    const userText = lastUserText(options.messages);
    const shouldCallEcho = Boolean(echo) && !hasToolResult(options.messages) && userText.includes("echo");
    let text;
    if (shouldCallEcho) text = "我来调用 echo 工具验证一下。";
    else if (hasToolResult(options.messages)) {
      const resultMsg = options.messages.find((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool-result"));
      const resultText = resultMsg.content.filter((b) => b.type === "tool-result").flatMap((b) => b.content).map((b) => (b.type === "text" ? b.text : `[${b.type}]`)).join("");
      text = `echo 工具返回了：「${resultText}」。任务完成。`;
    } else {
      text = `（MockAdapter，无需网络与 API Key）收到你的消息："${userText}"。当前 provider=${options.provider}，model=${options.model}。`;
    }
    try {
      yield { type: "block-start", index: 0, blockType: "text" };
      for (const piece of (text.match(/[\s\S]{1,3}/g) ?? [text])) {
        options.signal?.throwIfAborted();
        yield { type: "text-delta", index: 0, text: piece };
      }
      yield { type: "block-end", index: 0, block: { type: "text", text } };
      if (shouldCallEcho) {
        const args = JSON.stringify({ text: "来自 MockAdapter 的问候" });
        yield { type: "block-start", index: 1, blockType: "tool-call" };
        yield { type: "tool-call-delta", index: 1, id: "call-echo-1", name: "echo", argumentsDelta: args };
        yield { type: "block-end", index: 1, block: { type: "tool-call", id: "call-echo-1", name: "echo", arguments: args } };
      }
      yield { type: "usage", usage: { inputTokens: 100, outputTokens: 20 } };
      yield { type: "finish", reason: shouldCallEcho ? { kind: "tool-calls" } : { kind: "stop" } };
    } catch (err) {
      if (options.signal?.aborted) {
        yield { type: "finish", reason: { kind: "aborted", failure: { message: "aborted", code: "ABORTED" } } };
        return;
      }
      throw err;
    }
  }
}
export function apply(ctx) {
  ctx.llm.registerAdapter(["mock"], new MockAdapter());
}
