# types.ts — 持久会话事件里的 Inbox 词汇

本文件只放**类型**（无运行时代码），职责很窄：声明「agent 待处理消息队列」在**持久会话日志**里怎么写。

它通过 TypeScript **declaration merging**，往 `@deepseek-ai/dsh-session/types` 的 `SessionEventMap` 里追加一条事件：`agent/inbox/spliced`。

---

## 导出 / 声明一览

| 名称 | 种类 | 作用 |
|------|------|------|
| `InboxTarget` | 类型 | 两条待处理列表之一：`'next-turn'` 或 `'next-step'` |
| `SessionEventMap['agent/inbox/spliced']` | 模块合并 | 一次「规范化」的 inbox 变更如何落盘 |

---

## `InboxTarget`

```ts
export type InboxTarget = 'next-turn' | 'next-step'
```

每个 Agent 有**两条**有序待处理消息列表：

| 目标 | 像什么 | 典型谁放进去 |
|------|--------|----------------|
| `next-turn` | 「下一轮再处理」的普通用户输入 | `followup()` / `send(..., 'next-turn', true)` |
| `next-step` | 「当前轮次里、下一个模型步骤前」的输入 | `steer()`、`inject()` |

**例子：** 用户说「继续写第二段」→ 进 `next-turn`。  
模型还在跑工具时，UI 又塞了一句「别写太长」→ 进 `next-step`（steering）。

---

## 事件：`agent/inbox/spliced`

载荷字段：

```ts
{
  target: InboxTarget      // 改的是哪条列表
  start: number            // 从哪个下标开始 splice
  removedCount?: number    // 删了几条；为 0 时可省略
  inserted: UserMessage[]  // 插入的消息（可为空数组）
  outcome?: 'canceled'     // 若删掉的内容是「取消未跑」，标上 canceled
}
```

### 为什么叫 spliced？

和数组的 `splice(start, deleteCount, ...items)` 一样：一次变更可以**删 + 插**。所有 inbox 增删改（append / remove / claim / clear…）最终都会归一成这种坐标，写进会话日志，之后才能**重放**还原 inbox。

### 重要时序

> Live dispatch 在投影变更**之前**。

意思是：发出/追加这条会话事件时，内存里的 inbox **还没改**；同步观察者还能从「旧列表 + 坐标」反推出被删掉的消息。

**例子：**

```text
当前 next-turn = [A, B, C]
发生：从下标 1 删 1 条，插入 [X]
→ 事件：{ target: 'next-turn', start: 1, removedCount: 1, inserted: [X] }
→ 同步观察者仍可读到旧列表，知道被删的是 B
→ 然后投影变成 [A, X, C]
```

### `outcome: 'canceled'`

只有「删除了待处理消息，且这些消息被视为取消（未跑）」时才带。  
`claim`（循环领取进步骤）是纯删除，但**不是** cancel，因此**不会**带 `outcome: 'canceled'`。

**例子：**

| 操作 | 典型事件 | outcome |
|------|----------|---------|
| `append` 一条消息 | 插入，无删除 | 无 |
| `remove` / `clear` / 默认 `cancel()` | 删除且未进模型 | `'canceled'` |
| `claim`（进步骤） | 删除，交给本轮 | 无（不算取消） |
| `replace` | 删旧插新 | 对旧消息是 discarded 通知；splice 侧看实现 |

---

## 和其它文件的关系

```text
types.ts          ← 只定义「日志里长什么样」
inbox.ts          ← 读写投影，真正调用 session.append('agent/inbox/spliced', …)
runtime-types.ts  ← 实时 agent/* 通知（inserted / claimed / discarded）
consumed-work.ts  ← 读 spliced 的 removedCount / outcome，判断「工作有没有被交代」
```

持久事实走 `agent/inbox/spliced`；实时 UI/插件通知走 `agent/inbox/inserted|claimed|discarded`。两者互补，不是重复日志。

---

## 迷你场景

```text
1. followup("帮我修 bug")
   → spliced: next-turn 末尾插入 M1

2. 循环 claim('next-turn', turn=1)
   → spliced: next-turn 删掉 M1（无 outcome）
   → 实时：agent/inbox/claimed { message: M1, turn: 1 }

3. 用户点停止，cancel()
   → 若还有未领取消息：spliced + outcome: 'canceled'
   → 实时：agent/inbox/discarded
```
