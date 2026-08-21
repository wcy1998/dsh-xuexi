# model-selection.ts — Agent 作用域内的模型选择

把「当前选哪个 provider/model/推理强度」接到两条 Cordis waterfall 上：

1. `system-prompt/assemble` — 快照选择，并写入提示词变量  
2. `agent/request` — 把**组装时快照**应用到本步 LLM 请求配置  

这样：**同一步**里「提示词里的模型名」和「真正发请求的路由」一致；中途改选择只影响**之后的步骤**，不会出现「提示词写 A、请求打到 B」。

---

## 类型

### `ModelSelection`

```ts
{
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId  // 省略 → 用适配器/提供方默认
}
```

### `ModelSelectionRef`

```ts
{
  current: ModelSelection | undefined   // 下一步进入组装前可读的「最新选择」
  assembled: ModelSelection | undefined // 当前步组装时拍下的快照
}
```

调用方（通常是循环 / UI 入口）拥有这份可变引用；本函数只挂监听器。

---

## `installModelSelection(agentCtx, selection)`

在 **该 Agent 的 scoped context** 上注册两个监听器，返回联合 disposer。

### 组装阶段

```text
读 selection.current
→ await next() 得到组装结果
→ selection.assembled = 刚才读到的 current（快照）
→ 若有 selected：合并 variables.provider / variables.model
→ 返回（可能改过 variables 的）组装结果
```

**例子：** UI 把 `selection.current` 设为 DeepSeek Chat；组装时提示词变量出现 `provider`/`model`，供模板使用。

### 请求阶段

```text
await next() 得到默认 LlmCallConfig
→ 读 selection.assembled（不是 current！）
→ 若无快照：原样返回
→ 否则：去掉继承的 reasoningEffort，写入 provider/model
→ 仅当快照带了 reasoningEffort 才写回；否则保持「无 effort」= 默认行为
```

**为什么清掉继承的 effort？**  
换模型后，旧模型的推理强度不应悄悄留在请求上；没选 effort 就明确回到适配器默认。

---

## 并发切换例子

```text
时刻 T0: current = { provider: 'p1', model: 'm1' }
时刻 T1: 步骤 5 开始组装 → assembled 快照为 m1
时刻 T2: 用户把 current 改成 m2
时刻 T3: 步骤 5 发 agent/request → 仍用 assembled=m1
时刻 T4: 步骤 6 组装 → 快照变成 m2，请求也走 m2
```

同一步的 assemble 与 request **共享同一次快照**，不会半步切模型。

---

## 使用草图

```ts
const selection: ModelSelectionRef = {
  current: { provider: 'deepseek', model: 'deepseek-chat' },
  assembled: undefined,
}

const dispose = installModelSelection(agent.ctx, selection)

// UI 切换
selection.current = {
  provider: 'deepseek',
  model: 'deepseek-reasoner',
  reasoningEffort: 'high',
}

// agent dispose / 卸插件时
dispose()
```

---

## 和生活类比

点菜时先**拍照确认菜单版本**（assemble），上菜按照片做（request）。  
你在厨房做菜中途改菜单，只影响下一桌，不会让正在做的那道菜一半按旧菜单一半按新菜单。

---

## 和其它文件

| 文件 | 关系 |
|------|------|
| `runtime-types.ts` | `AgentOptions` 是创建时的初始路由；运行中可变选择由本模块承接 |
| `dispatch.ts` | `assembleContextFor` 提供组装上下文；本模块改的是 assemble/request waterfall 结果 |
| `index.ts` | 不直接调用；由具体循环 / 入口在 setup 时安装 |
