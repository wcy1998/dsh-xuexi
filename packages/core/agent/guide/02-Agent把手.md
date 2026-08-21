# 02 — Agent 把手（你每天会用的 API）

插件（UI、桥接层、编排器）通常拿着一个 `Agent`，而不是去碰循环内部。

## 身份证与状态

| 字段 | 含义 |
|------|------|
| `id` | 与 `session.id` 相同 |
| `session` | 会话；**日志是权威记录** |
| `inbox` | 还没被本轮吃掉的待处理消息（见下一篇） |
| `status` | `idle`（没在跑驱动器）或 `running` |
| `options` | 初始 provider / model / maxTokens |
| `ctx` | **只属于这个 Agent** 的 Cordis 上下文：在这里注册的工具、提示词段、监听器，dispose 时一并撤销 |

注意：`running` 不等于「某一轮 turn 一定还开着」。它可以覆盖收尾、落盘、连续排队的多轮。要等「彻底停稳」用 `whenIdle()`。

## 三种「塞消息」方式

想象 Agent 是一个厨师：

| 方法 | 进哪条队列 | 会不会喊醒厨师 | 典型用途 |
|------|------------|----------------|----------|
| `followup(msg)` | 下一轮主单 `next-turn` | 会 | 用户发一条新问题 |
| `steer(msg)` | 当前桌小条 `next-step` | 会 | 「改用中文」「别写太长」 |
| `inject(msg)` | 当前桌小条 `next-step` | **不会** | 静默塞背景信息，等下次被叫醒再带上 |

更底层还有 `send(message, target, wakeup)`，上面三个是约定好的常用包装。

### 小例子

```text
用户点发送「修这个 bug」
  → agent.followup(...)
  → status: idle → running
  → 循环领取消息，开始 turn

模型还在跑工具时，用户又说「先别改测试」
  → agent.steer(...)
  → 跑到下一个 step 边界时被吃进请求

某个插件想塞「仓库根目录是 /x」但不想单独开一轮
  → agent.inject(...)
  → 若 Agent 正 idle，这条会一直躺着，直到下次 followup/steer
```

`followup` **不**返回「这轮做完了」的 Promise。消息 id 只标识 inbox 里插入 / 领取 / 丢弃；输出与 `turn/end` 要去会话事件里看。

## 停与等

```text
agent.cancel(cause)
  → 中止当前活动
  → 默认顺便清空还没跑的 inbox（持久取消）

agent.cancel(cause, { keepInbox: true })
  → 只中止，排队的消息留着以后跑

agent.whenIdle()
  → 等到整个 Agent 完全停稳
  → 不绑定「某一条消息」的完成
```

空闲时再 `cancel` 是空操作（不会预先「武装」以后的运行）。

## 维护任务：`runMaintenance`

在真正的 idle 阶段跑一段**不是一轮对话**的异步活（例如整理缓存）。公开 `status` 仍显示 `idle`；期间新来的唤醒消息先待在 inbox，等维护结束后再处理。若已经在跑 turn 或已有维护任务，会同步抛错。

## 作用域编程：`agent.ctx`

```text
在 agent.ctx 上：
  - 注册只给这个 Agent 用的工具
  - 挂只听这个 Agent 的事件监听器
  - 改只影响它的提示词段 / 变量

Agent dispose 后，这些注册全部撤销。
```

全局 `ctx` 上挂的东西大家都能看见；`agent.ctx` 上挂的东西是「这间房专用」。

## 下一步

弄清消息在进模型前怎么排队：[03-Inbox收件箱.md](./03-Inbox收件箱.md)
