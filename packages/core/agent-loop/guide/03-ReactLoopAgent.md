# 03 — ReactLoopAgent（包内驱动器）

对应总览：[对象关系](./00-总览.md#objects) · [一轮 turn](./00-总览.md#turn)

`ReactLoopAgent` 实现 `Agent` 接口，**仅包内可见**。生命周期方通过 `ctx.agents` 拿到把手，不要点名构造它。

## 身份证与状态机

| 字段 | 含义 |
|------|------|
| `id` | 与 `session.id` 相同 |
| `session` | 日志权威 |
| `inbox` | `dsh-agent` 的 Inbox 投影 |
| `ctx` / `scope` | Agent 作用域世界；teardown 时撤销 |
| `status` | `idle` 或 `running`（`maintenance` 对外仍显示 idle） |

内部 `phase`：

```text
idle { lastTurn }
  → wakeDriver → running { abort, turn, step, wakeRequested }
  → kick 结束 → idle

idle → runMaintenance → maintenance { abort, lastTurn, wakeRequested }
  → 结束 → idle；若 wakeRequested 且 inbox 有活再 wake
```

`running` 覆盖收尾、连续排队多轮；要等彻底停稳用 `whenIdle()`（跟 `activityDone` 链直到稳定）。

## send / followup / steer / inject

统一原语：`send(message, target, wakeup)`。

| 方法 | target | wakeup |
|------|--------|--------|
| `followup` | `next-turn` | 是 |
| `steer` | `next-step` | 是 |
| `inject` | `next-step` | 否 |

特殊：若在**已 abort 的活动**里再发唤醒消息，会改投 `next-turn` 并锁存，避免把新活塞进已死的 turn。详见 [07](./07-取消与维护.md)。

## 唤醒：`wakeDriver`

```text
若已非 idle：
  maintenance 或 abort 后的唤醒 → wakeRequested = true（disposed 不锁存）
  活着的 running → 驱动器自己 claim，不另起
若 idle：
  phase → running
  withInitiator(this, () => kick())
```

`kick`：`while (await turn()) {}` —— 一轮返回 true 表示 inbox 还有活、继续下一轮。

## 与发起方作用域

整个驱动器生命周期在 `ctx.agents.withInitiator(agent, ...)` 内。工具深处 `requireInitiator()` 拿到的就是这个 Agent。规则见 [`dsh-agent` 06](../../agent/guide/06-发起方作用域.md)。

## 下一步

一轮对话内部：[04-一轮对话.md](./04-一轮对话.md)
