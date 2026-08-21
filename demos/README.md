# DeepSeek Harness 教学 Demo

本目录包含 8 个由浅入深的可运行 Demo，全部基于真实的 DeepSeek Harness 包（版本锁定 `0.1.0-rc.6`，Cordis `4.0.1`），并已在本仓库验证通过。

## 环境要求

- Node.js ≥ 20.19（推荐 22+）
- 无需 API Key：Demo 4 起使用 Mock 适配器，不发任何网络请求

## 安装

```sh
cd demos
npm install
```

## Demo 一览

| Demo | 目录 | 运行方式 | 学什么 |
|---|---|---|---|
| 1 | `01-first-plugin/` | `npm run demo:1` | 插件三形态、服务、inject、可逆 effect |
| 2 | `02-events/` | `npm run demo:2` | emit / waterfall / parallel / serial + 两个经典 bug |
| 3 | `03-compose/` | `npm run demo:3` | 依赖驱动加载、isolate、级联卸载 |
| 4 | `04-llm-mock/` | `npm run demo:4` | 注册 Mock LLM 适配器、StreamChunk 协议 |
| 5 | `05-headless-mock/` | 见下 | 无 API Key 跑通真实 dsh Agent 全链路 |
| 6 | `06-tool-echo/` | 见下 | 注册工具 + 完整工具循环 |
| 7 | `07-hooks/` | 见下 | 五个扩展点：拦截请求与工具 |
| 8 | `08-profile/` | 见下 | 组装自己的 Profile |

## Demo 5–8 的运行方式（headless overlay）

这些 Demo 通过 `--patch` 覆盖层把本地插件挂进真实的 `dsh --profile headless` 进程。
`DSH_HOME` 指向每个 Demo 自己的 `.dsh-home`，保证会话/设置互不污染。

```sh
cd 05-headless-mock
DSH_HOME="$PWD/.dsh-home" npx dsh --profile headless --patch mock.patch.yml "你好，介绍一下你自己"
# 看完会话日志：
node read-session.mjs
```

```sh
cd ../06-tool-echo
DSH_HOME="$PWD/.dsh-home" npx dsh --profile headless --patch tool.patch.yml "请 echo 一句话验证工具链路"
```

```sh
cd ../07-hooks
DSH_HOME="$PWD/.dsh-home" npx dsh --profile headless --patch hooks.patch.yml "请 echo 一句话验证工具链路"
# 体验拒绝路径：
DSH_DEMO_DENY_ECHO=1 DSH_HOME="$PWD/.dsh-home" npx dsh --profile headless --patch hooks.patch.yml "请 echo 一句话验证工具链路"
```

```sh
cd ../08-profile
DSH_HOME="$PWD/.dsh-home" npx dsh --profile demo8 "你好，自定义 profile"
# 观察组合后的配置树：
DSH_HOME="$PWD/.dsh-home" npx dsh --profile demo8 --dump-config | tail -12
```

## 为什么 patch 里是 `../../../plugins/xxx.ts`

Loader 的 baseUrl 是 **profile 目录**（`$DSH_HOME/profiles/headless/`）。相对路径从那里解析：

```text
$DSH_HOME/profiles/headless/        ← baseUrl
../../../plugins/mock-adapter.ts    = <demo 目录>/plugins/mock-adapter.ts
```

各 Demo 目录自带的 `.dsh-home` 已在 `.gitignore` 中排除。

## 与教程的关系

每个 Demo 的完整讲解见教程站点（docs/ 目录）：

- `docs/demos/`：Demo 路线图与准备
- `docs/guide/02-cordis-core.md`：Demo 1–3 对应 Cordis 五概念
- `docs/guide/04-llm-seam.md`：Demo 4 对应 LLM 接缝
- `docs/guide/05-agent-loop.md` / `06-tools.md`：Demo 5–7 对应 Agent 循环与工具流水线
- `docs/guide/08-composition.md`：Demo 8 对应组合机制
