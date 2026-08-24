# dsh-agent-loop 导读（易懂版）

这份导读把包根目录 [README.zh.md](../README.zh.md) 里偏合同语气的内容，拆成按主题阅读的说明。
官方 README 仍是权威合同；这里只负责**讲清楚在干什么**。

**先看图，再下钻。** [00-总览.md](./00-总览.md) 用关系图和时序把「循环驱动器」怎么创建 Agent、怎么跑 turn/step、怎么调模型与工具串起来；后面每章只讲地图上的一块。

本包是 harness 里**唯一包含具体循环逻辑**的包。对外接口、注册表、inbox 词汇在 [`dsh-agent`](../../agent/guide/README.md)；本包实现 `Agent` 并开车。更细的官方轮次图：[架构 · 轮次流程](../../../../docs/architecture.zh.md#turn-flow)、[时序图](../../../../docs/agent-lifecycle.zh.md)。

## 建议阅读顺序

| 顺序 | 文档 | 你将搞懂什么 |
|------|------|----------------|
| 0 | [00-总览.md](./00-总览.md) | 对象怎么连、创建发布、一轮 turn、工具调度 |
| 1 | [01-这是什么.md](./01-这是什么.md) | 与 `dsh-agent` 的分工：接口 vs 具体驱动器 |
| 2 | [02-AgentLoop服务.md](./02-AgentLoop服务.md) | `ctx.agentLoop`、工厂、配置创建、teardown |
| 3 | [03-ReactLoopAgent.md](./03-ReactLoopAgent.md) | 包内驱动器：phase、send、唤醒 |
| 4 | [04-一轮对话.md](./04-一轮对话.md) | turn / step / pre-step / turn-stopping |
| 5 | [05-模型请求.md](./05-模型请求.md) | 组装、header、prepareCall、流式 assistant |
| 6 | [06-工具调度.md](./06-工具调度.md) | 独占屏障、并行池、abort 合成结果 |
| 7 | [07-取消与维护.md](./07-取消与维护.md) | cancel、wake 锁存、runMaintenance |
| 8 | [08-模型体验与限制.md](./08-模型体验与限制.md) | 模型看到什么、已知坑 |

卡住某一章时，用总览对位置：

| 问题 | 总览里的图 |
|------|------------|
| 这个包和 `dsh-agent` 谁管什么？ | [对象关系](./00-总览.md#objects) |
| create 之后什么时候能发消息？ | [创建到发布](./00-总览.md#publish) |
| 用户点发送之后循环干什么？ | [一轮 turn](./00-总览.md#turn) |
| 工具为什么有时串行有时并行？ | [工具调度](./00-总览.md#tools) |
| cancel 之后排队消息怎么办？ | [取消](./00-总览.md#cancel) |

源码逐文件说明在 [`../src/`](../src/) 下的 `*.源码解析.ts`。
