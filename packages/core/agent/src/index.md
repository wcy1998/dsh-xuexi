# index.ts — AgentRegistry：注册表、工厂与发起方作用域

本文件是包的**主入口**：默认导出服务类 `AgentRegistry`（挂在 `ctx.agents`），并 re-export 其它模块的公开 API。

具体「怎么创建会话 / 怎么跑循环」在 `dsh-agent-loop`；本文件只提供：

1. **活 Agent 登记簿**（get / list / roots / 所有权）
2. **创建工厂槽位**（`setFactory` → `create` / `resume`）
3. **进程内发起方作用域**（`withInitiator` / `currentInitiator`…）
4. **有序发布原语**（`enter` → `announce`，供异步工厂使用）

---

## 模块顶部在导出什么？

```ts
export * from './runtime-types.ts'   // Agent 接口、事件类型
export * from './types.ts'           // InboxTarget、spliced
export * from './inbox.ts'
export * from './consumed-work.ts'
export * from './model-selection.ts'
export { agentCarrier, agentEvents, assembleContextFor, emitAgentEvent } from './dispatch.ts'
```

另外通过 declaration merging：

- `ctx.agents` / 可选的 `ctx.agent`
- Typert：`agent` lookup / host context（按 `SessionId` 解析活 Agent）

---

## 创建相关类型

### `AgentSetup` / `AgentSetupCommit`

未发布阶段组合作用域世界的回调：

```ts
setup?: (agentCtx) => void | AgentSetupCommit | Promise<…>
```

- 在**插入/宣布** session 与 agent **之前** await  
- 可返回 `{ commit() }`：所有 await 结束后、**发布前一瞬间**再同步校验；`commit` 抛错则整单回滚  
- **只组合，不驱动**：trusted 同进程代码；真正 `followup` 等应在 `create` resolve 之后

### `CreateAgentOptions`

| 字段 | 含义 |
|------|------|
| `sessionId` | agent 与 session 共用的 id |
| `meta?` | cwd、父会话谱系、seedLength、origin、delegationDepth、agentPreset… |
| `seed?` | fork 用的完整前缀历史（从 seq 0 连续、无未闭合 turn） |
| `agentOptions?` | 初始模型路由等 |
| `signal?` | **仅创建阶段**取消；返回 handle 前会 detach |
| `setup?` | 未发布组合 |

### `ResumeAgentOptions`

用 `resumeSessionId` 加载持久会话，同样可有 `agentOptions` / `signal` / `setup`。

### `AgentHandle`

```ts
{ agent: Agent; dispose(): Promise<void> }
```

`dispose` 是**消费方能力**：停循环 → 等退出 → 注销 → 删存储会话 → 撤销作用域。  
`get(id)` 只返回裸 `Agent`，没有 disposer。

### `AgentFactory`

由 loop 插件实现并 `setFactory`：

- `createAgent(ownerCtx, options)`
- `resume(ownerCtx, options)`

注册表把调用方的 `this.ctx` 作为 `ownerCtx` 传下去，所有权跟**调用方 fiber**，不跟工厂注册处瞎猜。

---

## 类 `AgentRegistry`（`ctx.agents`）

### 内部状态（理解用）

| 字段 | 作用 |
|------|------|
| `store` | `SessionId → AgentEntry` |
| `factory` | 装在 `FactorySlot` 里，避免 Cordis 过早 trace |
| `initiators` | `AsyncLocalStorage<Agent \| undefined>` |
| `initiatorRuns` | 跟踪边界嵌套，供 teardown drain |
| `initiatorState` | `active` → `closing` → `disposed` |

`AgentEntry` 额外记：`owner`（运行时创建方）、`carrier`、`announced` / `announcing` / `detachRequested`。

---

## 查询 API

```ts
ctx.agents.get(id)           // 活 Agent 或 undefined
ctx.agents.list()            // 注册顺序的新数组
ctx.agents.roots()           // owner === undefined 的顶层
ctx.agents.isOwnedBy(id, parent)  // 是否由该 parent 的作用域创建
```

**运行时 owner ≠ 持久会话 parentSession。**  
例如：从磁盘 resume 的 fork，谱系上有父会话，但若创建时没有 owning agent 上下文，仍可能是 `roots()` 之一。

**例子：**

```ts
const child = await parent.ctx.agents.create({ sessionId: 'c1', … })
ctx.agents.isOwnedBy('c1', parent) // true（若 create 经 parent.ctx）
```

---

## 注册与有序生命周期

### 普通插件：`register(agent)`

内部：`enter` + `announce`，挂在 effect 上；fiber dispose 时成对 `agent/disposed`。

### 异步工厂：`enter` →（别的事）→ `announce`

```text
1. enter(agent, owner)
   - 强制 agent.id === session.id
   - id 冲突则抛（权威互斥：多人可准备，一人能发布）
   - 不发 created
   - 返回 detach 闭包

2. … 其它发布步骤（session.enter 等）…

3. announce(agent)
   - 恰好一次 agent/created
   - 同步监听器抛错 → 否决发布（回滚路径）
   - 返回的 Promise 拒绝只打日志，不否决
   - 若监听器在 dispatch 中请求 detach → 推迟到本次 announce 结束
```

**例子：创建监听器里想立刻拆掉**

```ts
ctx.on('agent/created', ({ agent }) => {
  if (bad(agent)) detach()  // 不会令后续监听器看不到条目；结束后再删并 disposed
})
```

`detachEntered` 用**条目对象身份**判断：陈旧 detach 删不掉后来同 id 的新生命周期。

未 announce 就 detach：只从 store 删掉，**不**发 `disposed`（外面从未见过 created）。

---

## 工厂：`setFactory` / `create` / `resume`

```ts
setFactory(factory)  // 第二个工厂抛错；dispose 清空槽
await ctx.agents.create(options)
await ctx.agents.resume(options)
```

未注册工厂：`no agent factory registered (load an agent-loop plugin)`。

`create`/`resume` 用 `getTraceable` + `Reflect.apply`，让 Service 实现的工厂绑到**调用方**上下文。

---

## 发起方作用域（进程内因果归因）

驱动器跑在「谁发起的」边界里，子驱动器与父互不污染：

| API | 用途 |
|-----|------|
| `currentInitiator()` | 可选读取；没有则 `undefined` |
| `requireInitiator()` | 没有则抛 `no initiating agent is active` |
| `withInitiator(agent, op)` | 带确切 Agent 跑 op（保留同步值或 Promise） |
| `withoutInitiator(op)` | 清掉继承，避免定时器/队列泵「误继承」第一个 Agent |

**重要限制：**

- 只在**本进程**有效；worker / HTTP / 持久队列要显式传身份  
- 「ALS 里有 Agent」≠ 还活着 ≠ 已授权  
- teardown：`closing` 拒新边界 → drain 返回的 Promise → `disposed` 并 `disable` ALS  
- 若某边界链正在 unload **拥有自己的** fiber，该嵌套链从 drain 释放，避免「等自己卸完」死锁

**例子：**

```ts
await ctx.agents.withInitiator(agent, async () => {
  // 深层 helper
  const who = ctx.agents.requireInitiator() // 还是这个 agent
  await doToolWork()
})

ctx.agents.withoutInitiator(() => {
  setInterval(pumpSharedQueue, 1000) // 不要继承当时碰巧在跑的 agent
})
```

父创建子时：setup 里 `currentInitiator()` 常是**父**（因果），而 `agentCtx.agent` 是**子**（身份）。

---

## 构造时副作用

1. 向 Typert 注册 `agent` lookup / host context  
2. `ctx.accessor('agent', { get: () => undefined })` — 普通上下文读 `ctx.agent` 不炸；`Agent.ctx` 用自有属性覆盖  
3. 监听 `internal/status`：lifecycle 祖先 UNLOADING → `closeInitiators`  
4. effect：卸载时 `disposeInitiators` + `closeInitiators`

---

## 端到端：一次 create 在概念上的顺序

```text
UI/ACP: ctx.agents.create({ sessionId, setup })
  → AgentFactory.createAgent(ownerCtx, …)
      建 session / agentCtx（未发布）
      await setup(agentCtx)          // 可挂工具、监听器
      setupCommit?.commit()
      session.enter + agents.enter
      agents.announce → agent/created
      agent/session-start
      启动循环
  → 返回 AgentHandle

之后: handle.agent.followup(…)
卸载: handle.dispose() 或 owner fiber 卸掉
```

---

## 和兄弟文件怎么分工

```text
index.ts           登记簿 + 工厂委托 + 发起方 ALS
runtime-types.ts   Agent 方法与 agent/* 事件合同
types.ts           持久 inbox spliced
inbox.ts           队列投影实现
dispatch.ts        熔合 scope+subject 分发
model-selection.ts 运行中改模型
consumed-work.ts   从日志折叠「工作交代」
invariant.ts       可选 status 空转检查
```

更偏产品叙述的总览见包根目录 `README.zh.md`。
