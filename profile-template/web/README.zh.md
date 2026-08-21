# web profile 模板说明

本目录是 `dsh --profile web`（别名 `dsh web`）首次启动时，写入 `$DSH_HOME/profiles/web` 的模板快照。它本身不是可执行包；真正跑起来的是本机 home 下那份拷贝，再叠加 dsh 安装里的两个组合包（bundle）。

默认 home：`$DSH_HOME`，未设置时为 `~/.dsh`（Windows 上多为 `C:\Users\<你>\.dsh`）。

## 目录里有什么

| 文件 | 作用 |
|---|---|
| `package.json` | profile 清单：声明 `dsh.profile.bundles` 与树外插件 `dependencies` |
| `cordis.yml` | 空根配置（`[]`）。Loader 需要真实文件锚定 `baseUrl`；启动时会被改写回空列表，**不要编辑** |
| `cordis.patch.yml` | 本 profile 的用户 patch 层；改配置写这里 |
| `pnpm-workspace.yaml` | 给 `dsh plugin` 用的 pnpm 设置（`nodeLinker: hoisted`），便于树外插件解析到安装目录共享的依赖 |

## 组合包列表（核心）

`package.json` 里写死了两层，顺序即叠加顺序：

```json
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app"
    ]
  }
}
```

1. **`@deepseek-ai/dsh-base`** — 共享核心：模型适配、agent / agent-loop、工具、会话持久化、沙盒与审批、settings / credentials、遥测等。每个 profile 通常都以它为第一层。详见 [`packages/bundle/base`](../../packages/bundle/base/README.zh.md)。
2. **`@deepseek-ai/dsh-web-app`** — 浏览器表层：在 base 之上设 coding persona、挂 Web 宿主（webserver、API、workspace、投影缓存、存储等）、前端静态资源与 `web-runtime`，并提供 `--host` / `--port` / `--no-open` 等应用参数。详见 [`packages/bundle/web-app`](../../packages/bundle/web-app/README.zh.md)。

两个包都从 **dsh 安装目录**解析，不从本目录的 `node_modules` 解析；本目录的 `dependencies` 目前为空，留给你用 `dsh plugin --profile web add …` 装的树外组合包。

## 配置如何叠起来

生效配置从空根 `[]` 开始，按顺序应用（后者覆盖同 id 行的整份 `config`，不做深度合并）：

```
空根 cordis.yml
  → dsh-base 的 cordis.patch.yml
  → dsh-web-app 的 cordis.patch.yml
  → 本 profile 的 cordis.patch.yml      （本目录这份，当前为 []）
  → $DSH_HOME/cordis.patch.yml         （整机共享，优先于逐 profile）
  → 命令行 --patch <path>（可重复）
  → 启动器附加项（如 agent-presets 的 shipped root、DSH_TELEMETRY_DISABLED）
```

示意：

```text
[]  ──base──►  核心插件行  ──web-app──►  Web 覆盖 + 插入  ──用户/home/--patch──►  最终树
```

- 本模板的 `cordis.patch.yml` 是空数组：没有用户覆盖，跑的就是 base + web-app 的默认组合。
- 要改行为：编辑本机 `$DSH_HOME/profiles/web/cordis.patch.yml`，或加 `--patch`，不要改 `cordis.yml`。

## 和本机实例的关系

| | 本目录 `profile-template/web` | `$DSH_HOME/profiles/web` |
|---|---|---|
| 角色 | 仓库内模板 / 学习对照 | 真实启动目录 |
| 如何出现 | 随仓库存在 | `dsh web` 或 `dsh --profile web` 首次使用时由 `initProfile` 写出 |
| 编辑 | 改模板只影响仓库内容 | 改这里才影响本机 `dsh web` |

初始化写入的内容与本目录一致（`package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml`）；`cordis.yml` 在每次 `prepareProfile` 时被强制写成空根。

## 常用命令

```sh
# 启动（首次会初始化 ~/.dsh/profiles/web）
dsh web
dsh --profile web

# 只看组合后的配置树，不启动服务
dsh --profile web --dump-config
dsh --profile web --dump-default-config   # 只有 bundle 层，不含用户 patch

# 往该 profile 安装树外组合包（在 profile 目录里转发给 pnpm）
dsh plugin --profile web add <package>
```

更完整的层优先级、flag 与关闭行为见 [`apps/cli/reference/README.zh.md`](../../apps/cli/reference/README.zh.md)；组合包与 profile 概念见 [打包并安装插件](../../docs/user/develop/basic/publish.zh.md)。
