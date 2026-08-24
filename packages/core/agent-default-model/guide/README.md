# dsh-agent-default-model 导读（易懂版）

这份导读把包根目录 [README.zh.md](../README.zh.md) 里偏合同语气的内容，拆成按主题阅读的说明。
官方 README 仍是权威合同；这里只负责**讲清楚在干什么**。

**先看图，再下钻。** [00-总览.md](./00-总览.md) 用关系图和时序把「进程级默认模型」怎么产生、怎么被入口消费串起来；后面每章只讲地图上的一块。

本包很小（两个源文件），但它是 **headless / Web / ApiProxy** 共用的默认模型来源，和 [`dsh-agent` 的 `installModelSelection`](../agent/src/model-selection.ts) 衔接后才会真正进到请求里。读 Agent 生命周期可先扫 [`../agent/guide/`](../agent/guide/README.md)。

## 建议阅读顺序

| 顺序 | 文档 | 你将搞懂什么 |
|------|------|----------------|
| 0 | [00-总览.md](./00-总览.md) | 两层默认值、读/写、入口消费、与单个 Agent 的优先级 |
| 1 | [01-这是什么.md](./01-这是什么.md) | 包定位：进程级默认 vs 会话级选型 |
| 2 | [02-两层默认值.md](./02-两层默认值.md) | `cordis.yml` 组合项 vs `settings.yaml` 用户层 |
| 3 | [03-读与写API.md](./03-读与写API.md) | `currentSelection` / `saveSelection` 语义 |
| 4 | [04-入口怎么消费.md](./04-入口怎么消费.md) | headless、ApiProxy 怎么读同一服务 |
| 5 | [05-与单个Agent衔接.md](./05-与单个Agent衔接.md) | 创建时 seed、`installModelSelection`、日志优先级 |
| 6 | [06-模型体验与限制.md](./06-模型体验与限制.md) | KV cache、已知坑 |

卡住某一章时，用总览对位置：

| 问题 | 总览里的图 |
|------|------------|
| 这个包在整棵树上占哪？ | [对象关系](./00-总览.md#objects) |
| 部署默认和用户改模型怎么叠？ | [两层来源](./00-总览.md#layers) |
| `currentSelection` 每次读什么？ | [读路径](./00-总览.md#read) · [现读详解](./03-读与写API.md#live-read) |
| 用户换模型写到哪里？ | [写路径](./00-总览.md#write) |
| headless / Web / ApiProxy 分别是什么？ | [入口说明](./04-入口怎么消费.md#entrypoints) |
| 已有会话还会跟着默认变吗？ | [优先级](./00-总览.md#precedence) |
| 「进程共享」是不是所有会话共用？ | [进程 vs 会话](./00-总览.md#process-vs-session) |

源码逐文件说明在 [`../src/`](../src/) 下的 `*.源码解析.ts`。
