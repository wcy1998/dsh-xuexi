# consumed-work.ts — 日志如何「交代」已消费的工作

只看 `turn/start`～`turn/end` **不够**：有的 turn 没进过模型 step，结尾却长得像「正常空跑」；有的工作在 turn 还没开之前就被 cancel 掉了，**根本没有**对应的 `turn/end`。

`foldConsumedWork(events)` 单遍扫描会话（或后缀）事件，回答：

1. **最近一次「为已消费工作作出交代」的 `turn/end` 是哪条？**
2. **在那之后，是否还有「已接受却未跑就被取消」的 inbox 工作？**（`droppedUnrun`）

任何人对 agent 发起取消（自己 teardown、祖先 interrupt、插件卸载），读出来都一样——只依赖日志，不依赖取消瞬间采样活状态。

---

## 返回值 `ConsumedWork`

```ts
{
  end?: SessionEvent<'turn/end'>  // 最新一次「交代过工作」的 turn/end
  droppedUnrun: boolean           // 该 turn 之后是否还有未跑就被丢掉的输入
}
```

---

## 扫描时记住什么？

| 状态 | 含义 |
|------|------|
| `open` | 当前打开的 turn 号 |
| `stepped` | 进过 `step/start` 的 turn 集合 |
| `claimed` | 在打开的 turn 内发生过「非 cancel 的 inbox 删除」（即 claim）的 turn |
| `end` | 最新一次合格的 `turn/end` |
| `droppedUnrun` | 是否存在「canceled 且插入为空」的删除 |

---

## 关键规则（直觉版）

### 什么时候一个 `turn/end` 算「交代了工作」？

满足任一：

1. 该 turn **进过模型 step**（`step/start`），或  
2. 该 turn **claim 过 inbox**，且结束原因不是「claim 被改空后正常 completed」

`accountsForClaim(reason)`：

| `reason.kind` | 是否交代 claim 过的输入 |
|---------------|-------------------------|
| `completed` | **否**（改写后空批次正常结束，不算「工作结果」） |
| `blocked` | 是（pre-step reject，领取物被丢弃） |
| `aborted` / `interrupted` / `error` | 是 |
| 其它（含 merge-extensible 未知） | 是（不能当成功） |

合格的 `turn/end` 会：

- 更新 `end`
- **清零** `droppedUnrun`（该 turn 结束前丢掉的东西，由这次 ending 自己说明）

### 什么叫 `droppedUnrun`？

看到 `agent/inbox/spliced` 且：

- 有 `removedCount`
- `outcome === 'canceled'`
- `inserted.length === 0`（纯删；替换不算「丢掉未跑」——工作还在，只是换了身份）

则 `droppedUnrun = true`。

非 cancel 的删除（典型是 **claim**）且当前有 `open` turn → 把该 turn 记入 `claimed`。

---

## 易懂例子

### 例 1：正常跑完一轮

```text
turn/start(1)
agent/inbox/spliced  ← claim（无 canceled）
step/start(1)
…
turn/end(1, completed)

→ end = 该 turn/end
→ droppedUnrun = false
```

### 例 2：claim 后 pre-step 拒绝（blocked）

```text
turn/start(1)
claim …
turn/end(1, blocked)   // 没有 step/start

→ claimed 且 accountsForClaim(blocked)=true
→ end = 该 turn/end
```

「输入被领走过但没进模型」仍有一份交代。

### 例 3：claim 被改空后 completed（无 step）

```text
turn/start(1)
claim …
# pre-step 把 messages 改成 []
turn/end(1, completed)  // 无 step

→ accountsForClaim(completed)=false
→ 不更新 end（这次 turn 不描述工作）
```

### 例 4：取消时 inbox 里还有没开跑的消息

```text
turn/end(1, …)           // 上一轮已交代，droppedUnrun 被清零
agent/inbox/spliced      // clear：canceled + inserted=[]
→ droppedUnrun = true
→ end 仍是 turn 1 的 end（若它曾合格）
```

含义：「上次交代之后，又有工作在未开 turn 前被取消了。」

### 例 5：替换消息不算 droppedUnrun

```text
spliced: removedCount=1, outcome=canceled, inserted=[新消息]
→ 不置 droppedUnrun（工作仍 pending，只是换了 id/内容）
```

---

## 和生活类比

厨房订单系统：

- `turn/end` = 某一桌的结账单  
- 进过 step = 真的做过菜  
- claim 后 blocked/aborted = 「接了单但没做成」，结账单仍要说明这单的下场  
- claim 后改空再 completed = 「假开桌」，不算一笔工作  
- `droppedUnrun` = 结账之后，柜台上还有单子被撕掉、从未下厨  

`foldConsumedWork` = 会计把监控日志折成：「最后一笔说得清的账」+「账后有没有被撕掉的单」。

---

## API

```ts
foldConsumedWork(events: readonly SessionEvent[]): ConsumedWork
```

可传入完整日志，或「你拥有的后缀」（例如某次 run 自己写入的那段）。

---

## 和其它文件

| 文件 | 关系 |
|------|------|
| `types.ts` / `inbox.ts` | 提供 spliced 的 `removedCount` / `outcome` |
| `runtime-types.ts` | 实时 claimed/discarded 不替代本折叠；本函数只读持久事件 |
| README | 产品层也描述了同一语义 |
