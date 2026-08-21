# runtime-types.ts — Agent 公开接口与实时 `agent/*` 事件

本文件定义：

1. **插件面向的 `Agent` handle**（怎么发消息、怎么停、怎么等空闲）
2. **创建/取消相关选项类型**
3. **Cordis 实时事件表**（`agent/created`、`agent/pre-step` 等）

持久的 turn/step/token 流仍在 `dsh-session`；这里是**进程内协调词汇**，让 UI / 钩子 / 编排器不必依赖具体 `agent-loop` 包。

---

## 类型一览

| 名称 | 含义 |
|------|------|
| `AgentOptions` | 初始 provider / model / maxTokens |
| `CancelOptions` | `cancel` 是否保留 inbox |
| `AgentStatus` | `'idle' \| 'running'` |
| `PreStepDecision` | pre-step waterfall 的返回值 |
| `RequestErrorAction` | 请求失败恢复：`retry` 或默认终端失败 |
| `SessionStartSource` | 会话为何开始 |
| `Agent` | 公开 handle |
| `Events` 合并 | 全部 `agent/*` 实时事件 |

并 re-export：`AgentCancelCause`（来自 session）。

---

## `AgentOptions`

```ts
{
  provider?: string   // 路由到哪个已注册适配器
  model?: string      // 该适配器理解的模型 id
  maxTokens?: number  // 每次对话模型请求的输出上限（正数）
}
```

**例子：** `{ provider: 'deepseek', model: 'deepseek-chat', maxTokens: 4096 }`  
省略字段时由适配器 / 提供方默认值接管；显式选项优先。

---

## `CancelOptions` 与取消语义

```ts
{ keepInbox?: boolean }
```

| 调用 | 效果 |
|------|------|
| `agent.cancel(cause)` | 中止活跃活动，并**清空**待处理 inbox（持久取消） |
| `agent.cancel(cause, { keepInbox: true })` | 只中止，**保留**排队与 steering |

空闲时取消是空操作（不会「预武装」以后的工作）。同一活动上**第一个 cause 生效**。

---

## `AgentStatus`

- `idle`：没有活跃驱动器
- `running`：从「可取消的唤醒 / pre-step」开始，直到驱动器 drain、关闭或 checkpoint

注意：`running` ≠ 「某个 turn 一定还开着」——它可以覆盖 turn 收尾、持久化检查点、连续排队 turn。  
**没有**第三个状态叫 `disposed`：dispose 是从注册表移除，不是 status 枚举值。

---

## `PreStepDecision`

```ts
| { kind: 'reject' }
| { kind: 'enter'; messages: UserMessage[] }
```

`agent/pre-step` waterfall 用它决定：要不要进入拟议步骤，以及进入时用哪一批消息。

**例子：**

```ts
// 拒绝：本步不进模型（已 claim 的消息不会回到 inbox）
return { kind: 'reject' }

// 原样进入（常见：监听器调用 next()）
const decision = await next()

// 改写批次：多塞一条系统注入式上下文（仍须是 UserMessage）
return { kind: 'enter', messages: [...decision.messages, extra] }
```

领取已经从 inbox **删掉**候选；`reject` **不会**把它们还回去。

---

## `RequestErrorAction`

```ts
{ kind: 'retry' } | undefined
```

`agent/request-error` 里：拥有恢复权的监听器返回 `{ kind: 'retry' }` 且**不**调用 `next()`；调用 `next()` 则把决定交给下游；最终默认 `undefined` 表示失败是终端的。

---

## `SessionStartSource`

`'startup' | 'resume' | 'clear' | 'compact'`

- 新建：`startup`
- 从持久化恢复：`resume`
- `'clear'` / `'compact'`：预留，当前尚无发出方

---

## 接口 `Agent`（插件编程面）

### 只读字段

| 字段 | 说明 |
|------|------|
| `id` | 与 `session.id` 相同的 `SessionId` |
| `options` | 路由选项 |
| `session` | 活会话；日志是权威真相源 |
| `inbox` | 待处理工作的投影（见 `inbox.ts`） |
| `status` | `idle` / `running` |
| `ctx` | 仅属该 agent 的 Cordis 上下文；dispose 后撤销注册 |

### 方法（行为向例子）

#### `followup(message)`

排队 **next-turn** 普通输入并**唤醒**驱动器。一条 followup 通常独占自己那一轮的普通用户消息。

```ts
agent.followup({ id: 'm1', content: '解释这段报错', source: … })
```

#### `steer(message)`

排队 **next-step** steering 并会唤醒：

- 空闲 → 同步开一轮
- 运行中 → 在下一个 step 边界被消费

```ts
agent.steer({ id: 's1', content: '用中文回答', source: … })
```

#### `inject(message)`

排队 **next-step** 上下文，**不唤醒**。运行中的驱动器在之后某个 pre-step 领取；空闲时一直等到 `followup`/`steer` 唤醒。可能赶不上「已经 claim 完」的那次请求。

```ts
agent.inject({ id: 'i1', content: '仓库根目录是 /proj', source: … })
```

#### `send(message, target, wakeup)`

底层路由：指定 `next-turn` / `next-step`，以及是否唤醒。上面三个方法都建立在它之上的约定用法。

#### `cancel(cause, options?)` / `whenIdle()`

停当前活动（可选清空 inbox）；`whenIdle()` 等到整个 agent 完全停稳（含驱动器退役前又调度的替代工作），**不**绑定某条消息的完成。

#### `runMaintenance(task)`

在真正的 idle 相位跑一次**非 turn** 维护任务：公开 status 仍显示 `idle`，期间新的唤醒输入留在 inbox，任务结束后再被消费。若已有 turn 驱动或别的维护任务，同步抛错。

---

## 实时事件（`declare module '@deepseek-ai/cordis'`）

按 mode 分类更易记：

### emit（通知，不能 veto 生命周期进度）

| 事件 | 何时 |
|------|------|
| `agent/created` | setup 完成且会话+注册表都发布后 |
| `agent/disposed` | 离开注册表（Loop 在驱动器停稳后发） |
| `agent/status` | idle ⇄ running |
| `agent/inbox/inserted` | 一条消息进入 live inbox |
| `agent/inbox/claimed` | 在打开的 turn 内被领取（reject 后也不再 discarded） |
| `agent/inbox/discarded` | 从 live inbox 丢弃 |
| `agent/session-start` | 首轮前一次；可 `inject`，不可 veto |
| `agent/error` | step/turn 出错通知 |

### waterfall（必须 `next()` 才委托；不调用则短路）

| 事件 | 作用 |
|------|------|
| `agent/pre-step` | 拒绝或改写进入步骤的消息批次 |
| `agent/request` | 替换冻结的 LLM 调用配置（不能改消息） |
| `agent/request-error` | 拥有重试则返回 `{ kind: 'retry' }` |

### serial

| 事件 | 作用 |
|------|------|
| `agent/turn-stopping` | turn 本可结束时；监听器可再 `steer`，机器重读 inbox |

所有带 `this: Scoped<Agent>` 的事件都支持 **scope 过滤**：在 `agent.ctx` 上注册的监听器只收到该 agent。

---

## 和 `AssembleContext` 的合并

```ts
declare module '@deepseek-ai/dsh-system-prompt' {
  interface AssembleContext {
    agent?: Agent  // 有 agent 时，scope 必须指向同一 agent
  }
}
```

提示词组装可带上 agent，以便只收集该 agent 作用域内的段 / 工具。

---

## 端到端小故事

```text
1. UI: agent.followup("写个排序函数")
   → status: idle → running
   → inbox/inserted, 随后 claimed

2. 插件在 agent/pre-step:
   await next() → { kind: 'enter', messages }

3. 模型失败 → agent/request-error
   重试插件返回 { kind: 'retry' }（不调用 next）

4. 工具跑完，无新 steering → agent/turn-stopping
   无人再 steer → turn 关闭 → 最终 status: idle

5. 用户点停止 → cancel('user')
   → 清空剩余 inbox（discarded）并中止
```

更完整的注册表 / 工厂 API 见同目录 [`index.md`](./index.md)。
