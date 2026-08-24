# 03 — 读与写 API

对应总览：[读路径](./00-总览.md#read) · [写路径](./00-总览.md#write)

服务类：`AgentDefaultModelConfig`，Cordis 键 **`ctx.agentDefaultModel`**。

## `currentSelection(): ModelSelection`

返回** detached 副本** `{ provider, model, reasoningEffort? }`，类型来自 [`dsh-agent/model-selection`](../../agent/src/model-selection.ts)。

行为要点：

| 点 | 说明 |
|----|------|
| 每次现读 | 走内部 `source()` 闭包，无 stale 缓存（[详解](#live-read)） |
| Settings 在 | `source` 指向 `scope.get()`（base + 用户层合并） |
| Settings 不在 | `source` 指向构造时的组合 `entry` |
| 不校验目录 | provider 路由可以服务未在 UI 公布的模型；真正发请求的消费方负责报错 |

<a id="live-read"></a>

### 「每次现读」是什么意思

**stale 缓存**：服务在启动时把默认模型**算好存进字段**，之后 `currentSelection()` 只返回那份旧值，即使用户已在 Web Models 页改了 `settings.yaml`，也要等重启进程才变。

**本包的做法**：类里**没有** `cachedSelection` 这类字段；只有一根「当前该怎么读」的函数指针 `source`：

```text
currentSelection()
  → selection(this.source())   // 每次调用都先执行 source()
  → 返回全新副本
```

`source` 不是固定数据，而是**闭包**，指向「此刻权威读路径」：

| 阶段 | `source` 实际等于 | 读到什么 |
|------|-------------------|----------|
| 刚构造、Settings 还没挂上 | `() => entry` | cordis 组合项 `{ provider, model }` |
| Settings 提供方已挂载 | `() => scope.get()` | base + `settings.yaml` 用户层**当场合并** |
| Settings 提供方卸载 | 又变回 `() => entry` | 回退组合项 |

Settings 文档热更新时，`installSettingsSection` 的 `scope.get()` 会反映新值；**下一次**任何人调 `currentSelection()` 就会读到新默认，**不需要**在本服务里再写 `onChange` 去改缓存（源码里 `onChange: () => {}` 是故意的）。

**小时间线**（Web 场景）：

```text
T0  进程启动，entry = deepseek-official / deepseek-v4-flash
    currentSelection() → v4-flash

T1  用户在 Models 页改成 deepseek-reasoner，saveSelection 写入 settings.yaml
    （服务内部仍无缓存字段）

T2  用户点「新建会话」，ApiProxy 再次 agentOptions() → currentSelection()
    → 这次 source() 走 scope.get() → deepseek-reasoner   ← 已是新值

若设计成「T0 缓存到 this.model」→ T2 仍会返回 v4-flash，直到重启  ← 这就是 stale
```

**和「返回值是副本」一起记**：`selection(...)` 每次 `return` 新对象，调用方改返回值不会影响服务内部；权威来源始终是下一次 `source()` 读到的 settings/entry。

典型调用时机：**create/resume Agent 之前**、ApiProxy 在空白会话 fallback 时——这些路径都会**再调一次** `currentSelection()`，而不是沿用创建进程时的旧快照。

## `saveSelection(next: ModelSelection): Promise<void>`

保存**完整**用户选择到 Settings 分节 `agent-default-model`。

| 条件 | 行为 |
|------|------|
| `ctx.settings` 存在 | `replace` 分节；`reasoningEffort` 有则写入字符串，无则省略字段以清除 |
| 无 Settings 提供方 | **no-op**；组合 config 仍为 `currentSelection()` 的权威来源 |

这是**进程级默认**，不是某个 session id 的字段。 per-session 切换在 ApiProxy 的 `selectionFor(agent)` 里，见 [05](./05-与单个Agent衔接.md)。

## 导出常量与类型

| 符号 | 用途 |
|------|------|
| `AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE` | Settings 分节名 |
| `AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA` | 分节 schema（含可选 effort） |
| `AgentDefaultModelSettings` | 存储形状 |
| `Config` | 插件组合 config 形状 |

内部 `selection(settings)` 把 stored 形状投影为 `ModelSelection`，并把 `reasoningEffort` 包成 `ReasoningEffortId`。

## 和 invariant 的关系

本包**没有**独立的运行时 event/data invariant：Settings 注册已在写入路径校验 schema，`currentSelection()` 之前坏值进不来。见 [`invariant.ts`](../src/invariant.ts) 与 [`invariant.源码解析.ts`](../src/invariant.源码解析.ts)。

## 下一步

谁调用这两个 API：[04-入口怎么消费.md](./04-入口怎么消费.md)
