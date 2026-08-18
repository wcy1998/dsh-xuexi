# DeepSeek Harness 项目结构导读

本文档面向初次接触本仓库的开发者，说明每个顶层目录的职责，以及 `packages/` 下各功能分组的用途。更深入的架构设计见 [architecture.md](../../architecture.md)；日常开发流程见 [development.md](../../development.md)。

## 一句话概括

DeepSeek Harness（`dsh`）是一个**一切皆插件**的 AI Agent 运行时：基于 [Cordis](https://github.com/cordiverse/cordis) 框架，通过 `cordis.yml` 配置文件把模型适配器、工具、会话日志、Agent 循环等能力组装成可运行的产品（Web UI、无头 CLI、ACP 自动化等）。

```text
用户命令 (dsh web / dsh --profile headless)
    ↓
apps/cli 启动器 → boot 层加载 Profile + Bundle 补丁
    ↓
Cordis 插件树（packages/* 中的数百个 npm 包）
    ↓
Agent 循环：会话日志 → 组装 Prompt → 调用 LLM → 执行工具 → 写回日志
```

## 顶层目录

| 目录 | 作用 | 学习优先级 |
|---|---|---|
| [`packages/`](../../../packages/) | **核心代码**：所有 `@deepseek-ai/dsh-*` npm 包，按功能分组 | ⭐⭐⭐ 必读 |
| [`apps/`](../../../apps/) | **可执行入口**：`dsh` CLI 启动器、Web 应用及其 E2E 测试 | ⭐⭐⭐ |
| [`docs/`](../../) | **官方文档**：架构、子系统参考、教程、Cookbook、用户指南 | ⭐⭐⭐ |
| [`examples/`](../../../examples/) | **可运行示例**：各种 `cordis.yml` 组合与快照测试 | ⭐⭐ |
| [`vendor/`](../../../vendor/) | **内嵌框架**：Cordis 及其基础库的源码副本（可审计、可打补丁） | ⭐⭐ |
| [`scripts/`](../../../scripts/) | **仓库门禁与生成器**：测试、lint、文档同步、模块图生成等 | ⭐ |
| [`python/`](../../../python/) | **Python SDK**：通过 JSON-RPC 子进程驱动 Harness | ⭐ |
| [`native/`](../../../native/) | **原生组件**：Landlock 沙箱启动器（`@deepseek-ai/node-addon-landlock-run`） | ⭐ |
| [`website/`](../../../website/) | **文档网站**：VitePress 配置，将 `docs/` 中选定页面投影为网站 | ⭐ |
| [`.agents/`](../../../.agents/) | **Agent 工作流**：Skills、Agent Notes（设计决策记录） | ⭐ |
| [`.github/`](../../../.github/) | **CI/CD**：GitHub Actions 工作流、Issue/PR 模板 | — |
| [`patches/`](../../../patches/) | **pnpm 补丁**：对第三方依赖（如 `node-pty`）的本地修复 | — |
| [`assets/`](../../../assets/) | 静态资源（当前为空或极少使用） | — |
| [`scratch-plugin/`](../../../scratch-plugin/) | 临时插件实验沙箱 | — |
| [`.claude/`](../../../.claude/) | Claude/Cursor 编辑器配置 | — |

根目录重要文件：

| 文件 | 作用 |
|---|---|
| [`AGENTS.md`](../../../AGENTS.md) / [`CLAUDE.md`](../../../CLAUDE.md) | AI Agent 与贡献者的全局规则（二者内容相同） |
| [`package.json`](../../../package.json) | Monorepo 根配置、`pnpm` 脚本入口 |
| [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml) | 工作区成员声明 |
| [`tsconfig.json`](../../../tsconfig.json) | TypeScript 解决方案根（引用 Host/Client 两个聚合） |
| [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) | 贡献指南 |

## `apps/` — 产品入口

| 子目录 | 包名 | 作用 |
|---|---|---|
| [`apps/cli/`](../../../apps/cli/) | `@deepseek-ai/dsh` | **`dsh` 命令本体**：解析 `--profile`、`web`、`headless` 等参数，加载对应 Profile 并启动 Cordis 插件树 |
| [`apps/web/`](../../../apps/web/) | Web 应用 | 浏览器端 UI 及其大量 E2E/快照测试（测试在 `apps/web/tests/`） |

`dsh web` 实际等价于 `dsh --profile web`，Profile 由 [`packages/bundle/`](../../../packages/bundle/) 中的 bundle 层叠而成。

## `vendor/` — 内嵌 Cordis 框架

本仓库**不通过 npm 安装 Cordis**，而是把源码 vendoring 到 `vendor/`，重命名为 `@deepseek-ai/*` 作用域。

| 子目录 | npm 包 | 职责 |
|---|---|---|
| `cordis/` | `@deepseek-ai/cordis` | Cordis 核心：Context、Fiber、Service、事件系统 |
| `loader/` | `@deepseek-ai/cordis-plugin-loader` | 从 `cordis.yml` 加载插件树 |
| `include/` | `@deepseek-ai/cordis-plugin-include` | 配置文件包含与补丁（`cordis.patch.yml`） |
| `group/` | `@deepseek-ai/cordis-plugin-group` | 插件分组管理 |
| `hmr/` | `@deepseek-ai/cordis-plugin-hmr` | 热重载（开发时配置文件变更自动刷新） |
| `timer/` | `@deepseek-ai/cordis-plugin-timer` | 定时器插件 |
| `logger-console/` | `@deepseek-ai/cordis-plugin-logger-console` | 控制台日志 |
| `cosmokit/` | `@deepseek-ai/cosmokit` | 工具函数库 |
| `schemastery/` | `@deepseek-ai/schemastery` | 配置 Schema 验证 |

**注意**：`vendor/*/src/` 不要随意修改；本地改动必须记录在 `vendor/README.md` 的 "Local modifications" 中。

## `packages/` — 功能包总览

所有产品逻辑以 npm 包形式存在于 `packages/<group>/<pkg>/`，命名规则 `@deepseek-ai/dsh-<pkg>`。每个 **group** 有一个 `README.md` 说明该组内各包的 `ctx` 键映射。

### 核心骨架（先学这些）

| 分组 | 职责 | 关键 ctx 键 |
|---|---|---|
| [`core/`](../../../packages/core/) | 产品 API 脊柱：会话、Prompt、工具、Agent 接口、Agent 循环 | `ctx.sessions`, `ctx.tools`, `ctx.agents`, `ctx.agentLoop` |
| [`boot/`](../../../packages/boot/) | 应用启动胶水：Profile 组合、命令行解析 | — |
| [`bundle/`](../../../packages/bundle/) | 可安装的 Profile 补丁层（`dsh-base`, `dsh-web-app`, `dsh-headless`） | — |
| [`llm/`](../../../packages/llm/) | LLM 能力：消息/流式词汇表 + DeepSeek 等 Provider 适配器 | `ctx.llm` |
| [`session/`](../../../packages/session/) | 持久化会话数据：JSONL/SQLite 后端、标题生成、遥测 | — |

### 能力接缝（Capability Seams）

**能力接缝**指一项可替换的运行时能力，由三种角色拼成完整能力，而不是某一个包或某一个工具。模型看到的 `bash`、`read` 等工具只是最外层的 **Consumer**；真正执行命令、读写文件的是挂在 `ctx` 上的 **Service Provider**。换 Provider 就能换运行环境（本机、沙箱、E2B 云沙箱），而工具定义和 Service Definition 的接口可以保持不变。

可以把三层想成「插座标准 → 不同插头 → 电器」：

```text
模型调用 bash 工具
    ↓  Consumer：把能力翻译成工具 schema + 结果格式
ctx.shell（Service Definition：约定 run/resolve 等接口）
    ↓  Provider：真正起进程、收集 stdout
本机 bash / 沙箱 bash / 远程执行器
```

更完整的教程见 [能力的三种角色设计](../develop/practice/index.zh.md)；设计细节见 [capability-seams.md](../../capability-seams.md)。

#### 三层分别做什么

| 角色 | 典型包 | 职责 | 挂载到 `ctx` |
|---|---|---|---|
| **Service Definition** | `dsh-shell`、`dsh-fs` | 定义服务名、请求/结果类型、抽象方法；不含具体 IO | `ctx.shell`、`ctx.fs` |
| **Service Provider** | `dsh-bash-local`、`dsh-fs-sandbox` | 实现 Definition；每个运行环境只装一个 Provider | 注册为同名服务 |
| **Consumer** | `dsh-tool-bash`、`dsh-tool-fs` | 把能力暴露给模型（工具、命令等）；依赖 Definition，不依赖 Provider | 通常 `inject: ['shell']` |

Provider 与 Consumer **互不依赖**：`tool-bash` 只调用 `ctx.shell.run()`，不知道背后是 `bash-local` 还是 `bash-sandbox`。

#### 示例 1：Bash 执行（`packages/shell/`）

**① Service Definition**（[`packages/shell/shell/`](../../../packages/shell/shell/)）声明 `ctx.shell` 和统一接口：

```ts ignore-check
export abstract class ShellExecutor extends Service {
  constructor(ctx: Context) { super(ctx, 'shell') }
  abstract resolve(request: ShellExecRequest): ShellExecSpec
  abstract run(spec: ShellExecSpec): Promise<ShellRunResult>
  abstract start(spec: ShellExecSpec): ShellProcess
}
```

**② Service Provider**（[`packages/shell/bash-local/`](../../../packages/shell/bash-local/)）继承并注册实现：

```ts ignore-check
class BashLocal extends ShellExecutor {
  async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    // 通过 ctx.subprocess 在本机起 bash -c ...
  }
}
export function apply(ctx: Context) { ctx.plugin(BashLocal) }
```

**③ Consumer**（[`packages/shell/tool-bash/`](../../../packages/shell/tool-bash/)）注册模型工具，执行时只走 Definition：

```ts ignore-check
export const inject = ['tools', 'shell']

async execute(args, exec) {
  const result = await ctx.shell.run(ctx.shell.resolve({
    command: args.command,
    signal: exec.signal,
  }))
  return { kind: 'foreground', ...canonicalBashResult(result) }
}
```

#### 示例 2：文件系统（`packages/fs/`）

同一模式：`dsh-fs`（Definition，`ctx.fs.readText` / `resolve`）→ `dsh-fs-local` 或 `dsh-fs-sandbox`（Provider）→ `dsh-tool-fs`（Consumer，暴露 `read` / `write` / `edit`）。Consumer 里典型调用：

```ts ignore-check
const target = await ctx.fs.resolve(args.path, resolveOptions)
const text = await ctx.fs.readText(target, exec.signal)
```

`fs-observation-policy` 这类策略插件挂在 `fs/*` 事件上，与 Provider 正交组合，不必改工具代码。

#### 在 `cordis.yml` 里换 Provider

默认 Profile（[`packages/bundle/base/cordis.patch.yml`](../../../packages/bundle/base/cordis.patch.yml)）用沙箱 Provider；测试或最小示例常换成本地实现。只需改 Provider 那一行，Definition 和 Consumer 不变：

```yaml
# 本机执行（开发/测试常见）
- id: bash-local
  name: '@deepseek-ai/dsh-bash-local'

# 换成沙箱执行（产品默认）：注释上一行，启用下一行
# - id: bash-sandbox
#   name: '@deepseek-ai/dsh-bash-sandbox'

# 工具层始终不变
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
```

文件系统同理：`dsh-fs-local` 与 `dsh-fs-sandbox` 二选一挂在 `ctx.fs` 后，再加载 `dsh-tool-fs`。E2B 远程环境则成组替换 `bash` + `fs` 的 Provider（见 [`examples/headless-agent/tests/fixtures/e2b/`](../../../examples/headless-agent/tests/fixtures/e2b/)），避免「命令在云端、文件在本机」两个世界分裂。

#### 能力分组一览

| 分组 | 能力 | Definition → Provider → Consumer |
|---|---|---|
| [`fs/`](../../../packages/fs/) | 文件系统读写、策略 | `dsh-fs` → `dsh-fs-local` / `dsh-fs-sandbox` → `dsh-tool-fs` |
| [`shell/`](../../../packages/shell/) | Bash 命令执行 | `dsh-shell` → `dsh-bash-local` / `dsh-bash-sandbox` → `dsh-tool-bash` |
| [`terminal/`](../../../packages/terminal/) | 持久 PTY 终端 | `dsh-terminal` → `dsh-terminal-bash` → `dsh-tool-terminal` |
| [`subprocess/`](../../../packages/subprocess/) | 子进程树管理 | `dsh-subprocess` → `dsh-subprocess-local`；被 shell/terminal Provider 使用 |
| [`sandbox/`](../../../packages/sandbox/) | 进程沙箱（bwrap/Landlock/Seatbelt） | 策略与执行边界；与 shell/fs Provider 组合 |
| [`web/`](../../../packages/web/) | 网络搜索与抓取 | `dsh-web` → 搜索/抓取 Provider → `dsh-tool-web` |
| [`lsp/`](../../../packages/lsp/) | 语言服务器协议 | `dsh-lsp` → `dsh-lsp-stdio` → LSP 相关 Consumer |
| [`skill/`](../../../packages/skill/) | Skill 目录加载 | `dsh-skill` → `dsh-skill-filesystem` → `dsh-tool-skill` |
| [`subagent/`](../../../packages/subagent/) | 子 Agent 委托 | `dsh-subagent` → 多种后端 Provider → `dsh-tool-subagent` |
| [`workflow/`](../../../packages/workflow/) | 工作流引擎 | `dsh-workflow` → worker Provider → `workflow` / `ralph` 工具 |
| [`jobs/`](../../../packages/jobs/) | 后台任务 | `dsh-jobs`；`tool-bash` 等 Consumer 用其托管长任务 |
| [`code-runtime/`](../../../packages/code-runtime/) | Code Mode 代码执行 | Worker 线程中运行代码，工具经 `ctx.tools` 回调 |
| [`compaction/`](../../../packages/compaction/) | 上下文压缩 | `dsh-compaction` → `dsh-compaction-basic` → `/compact` 命令 |
| [`context/`](../../../packages/context/) | 请求上下文注入 | 工作区说明、时间等注入 Prompt |
| [`e2b/`](../../../packages/e2b/) | E2B 云沙箱（POC） | 成组替换 shell/fs/subprocess 的远程 Provider |

### Agent 协作与交互

| 分组 | 职责 |
|---|---|
| [`interaction/`](../../../packages/interaction/) | 人工协作：审批、权限、斜杠命令、`ask_user` 工具 |
| [`plan/`](../../../packages/plan/) | Plan 模式（只读规划状态） |
| [`todo/`](../../../packages/todo/) | `todo_write` 工具 |
| [`goal/`](../../../packages/goal/) | 会话内目标持久化 |
| [`schedule/`](../../../packages/schedule/) | 定时跟进 |
| [`feedback/`](../../../packages/feedback/) | 人工反馈收集 |
| [`preset/`](../../../packages/preset/) | 按 `cordis.yml` 预设组合 Agent |

### 数据与存储

| 分组 | 职责 |
|---|---|
| [`session-query/`](../../../packages/session-query/) | 会话检索：全文搜索、血缘、语义过滤 |
| [`storage/`](../../../packages/storage/) | 非会话 KV 存储 |
| [`attachment/`](../../../packages/attachment/) | 附件身份与内容寻址存储 |
| [`spill/`](../../../packages/spill/) | 工具结果溢出策略 |
| [`workspace/`](../../../packages/workspace/) | 工作区实体 |
| [`settings/`](../../../packages/settings/) | 用户设置（文件 Provider） |
| [`credentials/`](../../../packages/credentials/) | 凭据引用（env / `.env` Provider） |
| [`identity/`](../../../packages/identity/) | 匿名用户身份 |

### Web GUI 分层

| 分组 | 职责 |
|---|---|
| [`host/`](../../../packages/host/) | **服务端**：API 网关、HTTP 路由、目录选择器 |
| [`client/`](../../../packages/client/) | **浏览器端**：React Shell、RPC 协议、`ui-*` 插件（消息、设置、主题等） |
| [`api/`](../../../packages/api/) | 远程 BFF 组装与 Typert RPC 网关 |

### 扩展与集成

| 分组 | 职责 |
|---|---|
| [`extensions/`](../../../packages/extensions/) | Agent 运行时自修改：检查/挂载自己的插件 |
| [`hooks/`](../../../packages/hooks/) | Claude Code / Codex Hook 桥接 |
| [`acp/`](../../../packages/acp/) | Agent Client Protocol 自动化服务器 |
| [`sdk/`](../../../packages/sdk/) | 进程外 JSON-RPC SDK（TypeScript 客户端 + 服务端） |
| [`typert/`](../../../packages/typert/) | 类型图生成与运行时注册表 |

### 基础设施

| 分组 | 职责 |
|---|---|
| [`guard/`](../../../packages/guard/) | 循环卫生：重复调用提醒、工具超时 |
| [`util/`](../../../packages/util/) | 零依赖工具（`Branded` 类型、路径、超时等） |
| [`test-support/`](../../../packages/test-support/) | 测试基础设施（testkit、回放、Loader 冒烟） |
| [`examples/`](../../../packages/examples/) | 演示 bundle（agent-spine-demo 等） |

## `docs/` — 文档体系

| 子目录/文件 | 内容类型 | 适合何时阅读 |
|---|---|---|
| [`architecture.md`](../../architecture.md) | 架构总览：Profile/Bundle、核心包、事件、Turn 流程 | 改 `packages/` 之前 |
| [`cordis-primer.md`](../../cordis-primer.md) | Cordis 入门 | 不懂插件模型时 |
| [`cordis-tutorial/`](../../cordis-tutorial/) | Cordis 分步教程（01–07） | 动手写第一个插件 |
| [`subsystems/`](../../subsystems/) | 子系统类型定义与 API 参考 | 查具体接口时 |
| [`cookbook/`](../../cookbook/) | 操作指南（加包、加工具、加 LLM 适配器等） | 做具体开发任务时 |
| [`user/guide/`](./) | 用户向指南（Web UI、Provider、Python SDK） | 使用产品时 |
| [`user/develop/`](../../user/develop/) | 开发者向框架教程 | 写插件/扩展时 |
| [`postmortem/`](../../postmortem/) | 事故复盘 | 理解历史坑点时 |
| 生成的目录：`tool-catalog.md`、`config-catalog.md`、`module-graph.md` | 从源码自动生成的参考表 | 查工具列表/配置项/依赖图时 |

## `examples/` — 可运行组合

每个子目录是一个独立的 Agent 配置（`cordis.yml`），用于演示和测试：

| 示例 | 用途 |
|---|---|
| [`acp-agent/`](../../../examples/acp-agent/) | ACP 协议 Agent，覆盖最多快照场景 |
| [`headless-agent/`](../../../examples/headless-agent/) | 无头模式 Agent |
| [`jsonrpc-agent/`](../../../examples/jsonrpc-agent/) | JSON-RPC SDK 驱动 |
| [`web-schedule/`](../../../examples/web-schedule/) | Web 定时任务演示 |
| [`mcp-memory/`](../../../examples/mcp-memory/) | MCP 记忆插件示例 |

示例只保留 `cordis.yml` 接线与测试；可复用逻辑应提取到 `packages/`。

## `python/` — Python SDK

| 子目录 | PyPI 包 | 作用 |
|---|---|---|
| `python/sdk/` | `deepseek-harness-sdk` | 高层 Turns API + 低层 JSON-RPC 客户端 |
| `python/sdk-runtime/` | `deepseek-harness-runtime-bin` | 捆绑的运行时二进制与默认配置 |

## `native/` — 原生代码

| 子目录 | 作用 |
|---|---|
| [`native/landlock-run/`](../../../native/landlock-run/) | Linux Landlock 自限制启动器，供 `sandbox` 能力在 Linux 上隔离子进程 |

## `.agents/` — Agent 工作区

| 子目录 | 作用 |
|---|---|
| [`.agents/skills/`](../../../.agents/skills/) | 可复用工作流 Skill（文档标准、预推送检查、PR 合并等） |
| [`.agents/notes/`](../../../.agents/notes/) | Agent Notes：设计决策记录（`implemented/` 已落地、`proposed/` 提案中、`archived/` 已归档） |

## 核心概念速查

### Profile 与 Bundle

- **Profile**：`$DSH_HOME/profiles/<name>/` 下的命名组合，列出要堆叠的 bundle 和用户补丁。
- **Bundle**：可安装的 Cordis 配置补丁层。`dsh-base` 是所有 Profile 的第一层；`dsh-web-app` 加浏览器应用；`dsh-headless` 加一次性运行器。

查看实际启动的插件树：

```sh
dsh --profile web --dump-config
```

### 事件三分法

1. **Session 事件**：写入持久化日志（`user/message`、`tool/call`、`assistant/chunk` 等）
2. **Agent 事件**（`agent/*`）：观察/拦截运行中的 Agent
3. **Capability 事件**（`fs/*`、`tools/*` 等）：给能力接缝挂策略

### Turn 流程（简化）

```text
turn/start → 认领输入 → 组装 Prompt + 工具 Schema
  → agent/pre-step → step/start → 调用 LLM → 执行工具 → step/end
  → （需要继续则下一步）→ turn/end
```

**Model-visible ⟺ logged**：任何进入模型请求的内容都必须能从会话日志重建。

## 推荐学习路径

### 第 1 步：跑起来

```sh
pnpm install && pnpm run build
pnpm dsh web    # 需要 DEEPSEEK_API_KEY
```

### 第 2 步：理解架构

1. 读 [`docs/architecture.md`](../../architecture.md)
2. 读 [`docs/cordis-primer.md`](../../cordis-primer.md)
3. 运行 `dsh --profile web --dump-config` 看插件树

### 第 3 步：跟踪一次 Turn

从 [`packages/core/agent-loop/`](../../../packages/core/agent-loop/) 入手，对照 [`docs/agent-lifecycle.md`](../../agent-lifecycle.md) 的序列图。

### 第 4 步：读一个完整能力

以文件系统为例：`packages/fs/fs/`（Service Definition）→ `packages/fs/fs-local/`（Provider）→ `packages/fs/tool-read/`（Consumer/工具）。

### 第 5 步：动手改

按 [`docs/cookbook/adding-a-tool.md`](../../cookbook/adding-a-tool.md) 或 [`docs/cordis-tutorial/`](../../cordis-tutorial/) 添加一个简单插件。

### 第 6 步：看测试

- 单元测试：各包 `tests/` 目录，`pnpm run test`
- 快照测试：`pnpm run test:snapshot`（无需 API Key）
- E2E：`examples/*/tests/` 和 `apps/web/tests/`

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装依赖 |
| `pnpm run build` | 编译 TypeScript + 打包 |
| `pnpm run test` | 单元测试 |
| `pnpm run typecheck` | 类型检查 |
| `pnpm run lint` | 代码风格检查 |
| `pnpm dsh web` | 启动 Web UI |
| `pnpm dsh --profile headless "任务"` | 无头运行一次任务 |
| `pnpm run doc-sync` | 文档门禁检查 |
| `pnpm run website:build` | 构建文档网站 |

## 进一步阅读

- [packages/README.md](../../../packages/README.md) — 完整的包分组表
- [docs/capability-seams.md](../../capability-seams.md) — 能力接缝设计
- [docs/module-graph.md](../../module-graph.md) — 包依赖图（自动生成）
- [AGENTS.md](../../../AGENTS.md) — 贡献者规则与约定
