# 05 — 与单个 Agent 衔接

对应总览：[优先级](./00-总览.md#precedence)

本包只到 **`ModelSelection` 副本**；真正进 prompt / LLM 请求要靠 [`installModelSelection`](../../agent/src/model-selection.ts) 和会话日志。

## 创建时：seed + 安装

入口读完 `currentSelection()` 后通常做两件事：

```text
agentOptions: { provider, model }     → Agent 初始 options / 请求 header 种子
setup: installModelSelection(ref)     → 每 step 组装与 request waterfall 覆盖
ref.current = 刚读到的完整 selection（含 reasoningEffort）
```

`installModelSelection` 在两个 waterfall 上工作（详见 [`model-selection.源码解析.ts`](../../agent/src/model-selection.源码解析.ts)）：

| 事件 | 做什么 |
|------|--------|
| `system-prompt/assemble` | 拍快照 `assembled = current`；variables 写 provider/model |
| `agent/request` | 用 `assembled` 覆盖请求的 provider/model/effort |

同一步组装与请求共用一份快照，避免「组装用 A、请求走 B」。

## ApiProxy：`selectionFor(agent)` 三级优先级

Web 网关**不是**创建时读一次就固定。每次读 `selection.current`：

```text
1. 本进程用户刚设的 picked（例如 RPC 切模型）
2. else session.requestHeader()?.config（日志里最新请求）
3. else defaults.defaultModelSelection()  → 本包的 currentSelection()
```

因此：

| 场景 | 用的模型 |
|------|----------|
| 全新空白会话 | 进程默认（可能含 Settings 用户层） |
| 已有对话、日志里记过请求 | 日志里的 provider/model/effort |
| 用户在 UI 切了当前会话模型 | `picked`，并 try `saveDefaultModelSelection` |

**改默认不影响**已有日志选型的会话前缀；只影响之后 fallback 到默认的路径（新会话、空白会话、无 header 时）。

## headless：更简单

无 RPC 切模型、无多会话 UI：`ref.current` 初始化为 create 时那一次 `currentSelection()`，全程不变（除非未来扩展）。

## 和 `Agent.options` 的关系

`agentOptions` 里的 provider/model 是 Agent 构造时的**声明**；运行中切换走 `selection.current` + waterfall。两者在 headless 单次运行里通常一致。

## 下一步

模型体验与限制：[06-模型体验与限制.md](./06-模型体验与限制.md)
