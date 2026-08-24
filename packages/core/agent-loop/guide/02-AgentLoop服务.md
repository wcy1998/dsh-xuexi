# 02 — AgentLoop 服务

对应总览：[对象关系](./00-总览.md#objects) · [创建到发布](./00-总览.md#publish)

Cordis 键：**`ctx.agentLoop`**。构造时 `ctx.agents.setFactory(this)`，因此 UI / ACP 只依赖 `ctx.agents.create` / `resume`，不必 import 本包。

## 两条创建路径

| 路径 | API | Setup | Handle | 谁拥有 teardown |
|------|-----|-------|--------|-----------------|
| 配置 / 同步 | `ctx.agentLoop.create(id, options?, meta?)` | 不跑 | 丢弃 | 循环 fiber |
| 编程式 | `ctx.agents.create` / `resume` | 可 await setup | 返回 `AgentHandle` | Handle 持有者 + 工厂共同拥有 |

编程式路径：`AgentFactory.createAgent(ownerCtx, options)` / `resume(ownerCtx, options)` —— 调用方传所有权；工厂保留对 `sessions`/`llm`/`tools`/`systemPrompt` 的依赖上下文。

## 发布顺序（概念）

```text
准备会话 + ReactLoopAgent（未发布）
  → await setup(agentCtx)     // 只组合
  → 可选 setupCommit.commit()
  → sessions.enter → agents.enter
  → announce session → announce agent
  → agent/session-start
  → 驱动器可唤醒
  → 返回 Handle（编程式）
```

要点与 [`dsh-agent` 05](../../agent/guide/05-创建与恢复.md) 一致：同 id 最终 `enter` 裁决；失败者回滚私有世界；创建 `signal` 只覆盖未发布阶段。

## 配置 `agents[]`

```text
maxParallelToolCalls?: number   // 默认 10；1 = 串行；也是 Settings 段全部内容
agents: [{
  id: string                    // 稳定 label
  provider? / model? / maxTokens?
  resumeSessionId?              // 与 sessionId 互斥；加载已有持久会话
  cwd?                          // 仅全新会话
}]
```

- 省略稳定 `sessionId` 时，通常每次启动生成 `${label}-session-<uuid>`（新会话）。
- 配置 agent **没有**逐 agent persona / setup；用部署 persona。编程式 `create` 才能在 setup 里组合作用域世界。
- `agents` **不进** Settings 段（启动时消费一次）；`maxParallelToolCalls` 可经 Settings 热更新影响下一组工具调用。

启动器可用 `configuredAgentIdentities` 在 Loader 前固定 identity（见源码 `CONFIGURED_AGENT_IDENTITIES_KEY`）。

## Teardown 顺序

```text
停驱动器并排空 → 撤销 scope → detach agent → detach 会话
```

调用方卸载、`handle.dispose()`、提供方卸载汇合到同一记忆化停稳边界。工厂 `FactoryOwnership` 跟踪 live dispose 与进行中的 create/resume。

## 下一步

包内驱动器长什么样：[03-ReactLoopAgent.md](./03-ReactLoopAgent.md)
