# 03 — Inbox 收件箱

每个 Agent 有一个 `inbox`：两份**待处理**消息列表的投影。  
真相写在会话日志的 `agent/inbox/spliced` 里；内存列表是方便读写的视图。

## 两列订单架

| 列表 | 像什么 | 谁往里放 |
|------|--------|----------|
| `next-turn` | 下一桌的主单 | `followup` / `send(..., 'next-turn', …)` |
| `next-step` | 当前桌追加的小条 | `steer`、`inject` |

只读查看：`inbox.nextTurn`、`inbox.nextStep`、`inbox.hasPending`。

## 常见变更（概念）

| 操作 | 效果 |
|------|------|
| 入队 | 插入一条；整表（两列合计）`MessageId` 必须唯一 |
| `replace` / `remove` | 按 id 跨两列查找；删除算**取消** |
| `clear` | 先清空 next-step，再清空 next-turn |
| `claim`（循环内部） | 步骤边界**领取**一批：全部 next-step，若需要再加一条 next-turn |

插件日常用 `agent.followup` / `steer` / `inject`，一般不要自己 `claim`。

## 领取 vs 取消

```text
claim（领取）
  → 消息离开 inbox，交给某一 turn
  → 实时通知：agent/inbox/claimed
  → 日志里是删除，但不标「canceled」

remove / clear / 默认 cancel()
  → 消息被丢掉、未跑
  → 实时通知：agent/inbox/discarded
  → 日志带 outcome: 'canceled'
```

若 `pre-step` **拒绝**进入步骤：已经 claim 走的消息**不会**退回 inbox，也不会再发 discarded；这一轮通常以 `blocked` 等方式结束。

## 实时通知 vs 持久日志

| 通道 | 事件 | 用途 |
|------|------|------|
| 实时 | `inserted` / `claimed` / `discarded` | UI、插件立刻反应（一条消息一份载荷） |
| 持久 | `agent/inbox/spliced` | 重放、对账、投影重建 |

## 「工作最终怎样了？」

只看 `turn/end` 不够（有的空转 turn、有的没开 turn 就被取消）。  
用 `foldConsumedWork(会话事件)` 从日志折叠出：

1. 最近一次**真正交代过已消费工作**的 `turn/end`
2. 那之后是否还有**接受了却从未跑就被取消**的输入（`droppedUnrun`）

无论谁触发的取消，读日志结果一样。细节与例子见 [`../src/consumed-work.md`](../src/consumed-work.md)。

## 下一步

Agent 如何被登记进进程：[04-注册表.md](./04-注册表.md)
