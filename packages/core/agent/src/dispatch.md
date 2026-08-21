# dispatch.ts — 带 Agent 作用域的事件分发与提示词组装

本文件解决一个容易踩坑的问题：

> 事件要按 **某个 Agent 的 scope** 过滤，同时 payload 里又必须带上 **同一个** `agent` 主体。  
> 若手写两次（一次 `this` carrier，一次 payload.agent），两者可能对不上。

`agentEvents` 把这两件事**熔成一次分发**：自动注入 `agent`，并用稳定的 scope carrier 作为 `thisArg`。

---

## 导出一览

| 名称 | 作用 |
|------|------|
| `AgentSubjectEvent` | 「主体是 Agent」的事件名联合类型 |
| `AgentEventDispatch` | `emit` / `serial` / `waterfall` 三个方法 |
| `agentCarrier(agent)` | 构造 `Scoped<Agent>` 路由载体 |
| `agentEvents(ctx, agent, carrier?)` | 熔合分发器 |
| `emitAgentEvent(...)` | 一次性 emit，不保留分发器 |
| `assembleContextFor(agent, signal?)` | 组装提示词上下文（agent + scope 一起设） |

---

## 什么叫「Agent 主体事件」？

类型层面要求同时满足：

1. handler 的 `this` 是 `Scoped<Agent>`
2. 第一个参数是带 `{ agent: Agent }` 的 payload

这样不会把「碰巧 payload 里有个叫 agent 的字段」的无关事件收进来。

`runtime-types.ts` 里声明的 `agent/created`、`agent/pre-step` 等都符合。

---

## `agentCarrier`

```ts
agentCarrier(agent) === scopeTarget(agent, agent)
```

载体是**无状态路由对象**：key 与 subject 都是该 agent。  
循环驱动器会在 Agent 构造时建一次，热路径反复复用，避免每次分发重新分配。

---

## `agentEvents` 三个方法

调用方**不要**自己传 `agent` 字段；分发器注入：

```ts
const events = agentEvents(ctx, agent, carrier)

// emit：通知；单个监听器抛错/拒绝对其它监听器隔离
events.emit('agent/status', { status: 'running' })
// 实际 payload = { agent, status: 'running' }

// serial：按序等待（如 turn-stopping）
await events.serial('agent/turn-stopping', { turn: 1, signal })

// waterfall：环绕中间件；rest 通常是 next 回调
await events.waterfall('agent/pre-step', { messages, turn, step, signal }, next)
```

### 为什么 emit 要自己跑一遍 callbacks？

普通 Cordis `emit` 用 `Array.map`：一个同步 throw 会饿死后面的监听器，返回的 Promise 也被丢掉。  
Agent 通知约定是**非否决**：每个监听器独立 try/catch，Promise rejection 打 warn 日志。

### payload 合并顺序

```ts
{ ...payload, agent }  // agent 在后，调用方无法覆盖主体
```

---

## `emitAgentEvent`

```ts
emitAgentEvent(ctx, agent, 'agent/inbox/inserted', { message })
```

等价于临时 `agentEvents(ctx, agent).emit(...)`，适合偶发通知。

---

## `assembleContextFor`

```ts
assembleContextFor(agent)
// → { agent, scope: agent }

assembleContextFor(agent, signal)
// → { agent, scope: agent, signal }
```

把 `agent` 与 `scope` **绑在一起**交给 `system-prompt` 组装，避免只设一个导致作用域贡献被静默漏掉。

**例子：** Agent A 注册了私有工具 `foo`；组装时若忘了 `scope: A`，模型可能看不到 `foo`。

---

## 易懂类比

把 Agent 想成**会议室**：

- `carrier` = 门禁卡（只让订了这间房的监听器进）
- `payload.agent` = 会议纪要抬头上的「会议室编号」
- `agentEvents` = 前台：刷卡开门的同时，自动在纪要上盖上正确房号，避免「进了 A 房却写成 B 房」

---

## 小例子：插件只听某一个 Agent

```ts
// 在 agent.ctx 上注册 → 自动 scope 过滤
agent.ctx.on('agent/status', ({ agent: a, status }) => {
  console.log(a.id, '→', status)
})

// 驱动器侧（循环内部）
const dispatch = agentEvents(appCtx, agent, carrier)
dispatch.emit('agent/status', { status: 'running' })
// 只有该 agent 作用域（及全局）监听器收到；payload.agent 一定是这个 agent
```

---

## 和其它文件

| 文件 | 关系 |
|------|------|
| `runtime-types.ts` | 声明事件签名与 mode |
| `index.ts` | 注册表 `announce`/`disposed` 用同类「含失败隔离」的 emit 手法 |
| `model-selection.ts` | 在 `agent.ctx` 上挂 `agent/request` waterfall（走作用域，不必经本文件） |
