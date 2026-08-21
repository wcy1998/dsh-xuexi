# inbox.ts — 待处理消息队列的增量投影

`Inbox` 是 Agent 拥有的**内存投影**：从会话日志里的 `agent/inbox/spliced` 事件还原 / 持续更新两条列表，并通过 `InboxNotifications` 发出实时通知。

权威真相在 **session 日志**；`Inbox` 是方便读写的视图。

---

## 核心概念

### 两条列表

```ts
type InboxState = {
  'next-turn': UserMessage[]  // 等待各自独占一轮的普通输入
  'next-step': UserMessage[]  // 等待下一个步骤边界的 steering / inject
}
```

### 构造时重放

```ts
new Inbox(session, notifications)
```

从 `session.header.seedLength ?? 0` 之后的事件开始，只应用 `agent/inbox/spliced`。某条坏事件会抛：

`invalid persisted inbox splice at session seq N`

---

## `InboxNotifications`

突变成功后调用的实时钩子（通常接到 `agent/inbox/*` emit）：

| 方法 | 含义 |
|------|------|
| `inserted(message)` | 新消息进入队列 |
| `discarded(message)` | 被取消/替换掉的旧消息 |
| `claimed(message, turn)` | 在某 turn 内被循环领取 |

---

## 公开只读属性

| 属性 | 含义 |
|------|------|
| `nextTurn` | 待处理 next-turn 列表（只读视图） |
| `nextStep` | 待处理 next-step 列表 |
| `hasPending` | 任一列表非空 |

---

## 公开变更 API

### `append` / `prepend`

往某条列表尾或头加一条；`MessageId` 在两条列表合起来必须唯一，否则抛 `message "…" is already pending`。

```ts
inbox.append('next-turn', msgA)
inbox.prepend('next-step', urgentSteer)
```

### `replace(messageId, newMessage)`

按 id 跨两条列表定位；成功则删旧插新，并通知 discarded(旧) + inserted(新)。找不到返回 `false`。

```ts
// 用户编辑了还没发出的草稿
inbox.replace(oldId, { ...old, id: newId, content: '改写后的内容' })
```

### `remove(messageId)` / `clear()`

`remove`：删一条并记为取消。  
`clear`：先清空 `next-step`，再清空 `next-turn`（顺序固定）。

### `splice(target, start, deleteCount, inserted)`

标准数组 splice 语义 + 落盘 + 对删除项发 discarded（若有删除）。

负数 `start` 按数组惯例从末尾算；非法坐标在 `validate` 里抛 `invalid inbox splice`。

### `claim(target, turn)` — 给循环用（`@internal`）

步骤边界领取一整批：

1. 清空并取出**全部** `next-step`
2. 若 `target === 'next-turn'`，再取 `next-turn` 的**第一条**
3. 对每条发 `claimed(message, turn)`
4. 持久 splice 是**纯删除**（不带 `outcome: 'canceled'`）

```ts
// 新一轮第一步：既要 steering，也要一条 followup
const batch = inbox.claim('next-turn', turn)
// batch = [...所有 next-step, 至多一条 next-turn]

// 同一轮后续步骤：通常只吃 next-step
const more = inbox.claim('next-step', turn)
```

插件一般不要直接 `claim`；应使用 `agent.followup` / `steer` / `inject`。

---

## 内部流程：`mutate` → 先日志后投影

```text
1. 规范化 start / deleteCount（trunc、夹紧）
2. 空操作（不删不插）→ 直接返回 []
3. 若 discardRemoved 且确实删了 → outcome: 'canceled'
4. validate（坐标合法 + MessageId 全局唯一）
5. session.append('agent/inbox/spliced', splice)   ← 先落盘
6. 内存 splice
7. discarded / inserted 通知
8. 返回被删消息
```

**例子：append**

```text
列表: []
append(M1)
→ 事件 { target, start: 0, inserted: [M1] }  （无 removedCount）
→ 通知 inserted(M1)
→ 列表: [M1]
```

**例子：remove（取消）**

```text
列表: [M1, M2]
remove(M1)
→ 事件 { start: 0, removedCount: 1, inserted: [], outcome: 'canceled' }
→ 通知 discarded(M1)
→ 列表: [M2]
```

**例子：claim（不算取消）**

```text
next-step: [S1], next-turn: [U1]
claim('next-turn', 3)
→ 两次纯删除 splice（无 outcome）
→ 通知 claimed(S1, 3), claimed(U1, 3)
→ 两列表变空
```

---

## `validate` 在防什么？

1. `start` / `removedCount` 必须是安全整数，且不越界  
2. splice 之后，`next-turn` ∪ `next-step` 里 **MessageId 不重复**

因此你不能把同一 id 既放在 turn 队列又放在 step 队列。

---

## 和生活类比

把 inbox 想成餐厅的**两列订单架**：

- `next-turn`：每位客人一张主单，按顺序开桌  
- `next-step`：当前桌上客人又追加的「少盐 / 快点」小条  

`claim` = 服务员把「这桌要处理的小条 +（若需要）下一张主单」一次性取走。  
`clear` / `remove` = 客人取消，订单撕掉（canceled）。  
日志 = 监控录像：事后能完整重放架子上曾经有什么。

---

## 和其它文件

| 文件 | 关系 |
|------|------|
| `types.ts` | 定义 spliced 事件形状 |
| `runtime-types.ts` | Agent.inbox 字段类型；实时事件名 |
| `consumed-work.ts` | 读 spliced 的 removedCount/outcome 做「工作交代」 |
| `index.ts` | 注册表不管 inbox 细节；循环实现持有 Inbox |
