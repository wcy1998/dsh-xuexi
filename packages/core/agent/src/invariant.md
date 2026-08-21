# invariant.ts — Agent 生命周期运行时不变量

本文件是包的 **可选诊断伴侣插件**（`@deepseek-ai/dsh-agent/invariant`），**不会**被根 Agent 服务隐式加载。  
需要时由应用显式挂上 `invariants` 服务后再加载本插件。

职责：向 `ctx.invariants` 注册本包检查——目前专查 **`agent/status` 不得发「空转」**。

---

## Cordis 插件导出

| 导出 | 值 / 含义 |
|------|-----------|
| `name` | `'agent-invariant'` |
| `inject` | `['invariants']` — 依赖不变量服务 |
| `apply` | 注册安装器，返回 disposer 的 Promise |

符合「函数插件」形态：具名 `name`/`inject`/`apply`，**无** default export（避免被 Loader 丢掉命名空间）。

---

## 检查逻辑

```ts
WeakMap<Agent, AgentStatus> 记录每个 agent 上次 status

监听 agent/status（global: true）:
  若 previous === 本次 status
    → fail(`agent/status repeated ${status} (no-op transition)`)
  否则更新 map
```

### 合法

```text
idle → running → idle → running
```

### 非法（诊断失败）

```text
running → running   // 重复同值，说明某处多发了无意义通知
idle → idle
```

用 `WeakMap`：agent 被回收后条目可消失，不泄漏。

---

## `apply` 在做什么？

```ts
ctx.invariants.register('@deepseek-ai/dsh-agent', install)
```

包名与 npm 包一致，方便在诊断报告里定位「是哪个包的不变量挂了」。

---

## 易懂例子

假设循环 bug：turn 里每次 tool 回调都再 emit 一次 `status: 'running'`，尽管已经是 running。

- 没开 invariant：可能只表现为多余日志，难查  
- 开了本插件：第一次重复立刻 `fail(...)`，测试 / 诊断环境早失败  

---

## 和其它文件

| 文件 | 关系 |
|------|------|
| `runtime-types.ts` | 定义 `AgentStatus` 与 `agent/status` 事件 |
| `index.ts` | 注册表不加载本文件；诊断与产品路径分离 |

仓库约定：每个包都应有 `./invariant` 入口；无检查时要写清 `No runtime invariant:` 理由。本包有真实关系检查（status 转换），故实现为上面的监听器。
