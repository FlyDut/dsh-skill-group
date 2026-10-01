# dsh-skill-group

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-2f81f7">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D22.19-339933">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 GUI 内技能管理器：浏览完整的 `ctx.skills` 目录、逐个开关技能、查看技能正文、修复发现（discovery）问题、从市场安装、新建技能。

> 宿主侧只通过官方 SDK 运行在 dsh 进程内；浏览器侧只通过官方 slot 渲染。不修改 dsh 源码。

## 这是一个分叉

本项目是 **[cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub)** 的分叉，改名为 `@flydut/dsh-skill-group`，版本号从 `0.0.1` 独立起算，不追踪上游发布——分叉的目的是改造插件本身，而不是为它攒补丁。

**为什么分叉：**

1. **分组应当是一等概念。** 分组要属于插件自身的模型、驱动插件的行为，而不是只活在面板的渲染层里。
2. **KISS。** 更少的概念、更少活动件、更小的表面。任何新增都要先过"能不能更简单"这一关。

你目前拿到的是上游的功能集，外加第一轮朝这个方向的改造：

- 界面与所有面向用户的文案统一为**技能分组**（英文语言下为 Skill Groups）；
- 死代码、无用依赖，以及一个没有任何客户端调用的 HTTP 端点都已清除；
- 客户端不再与宿主协议漂移，工作区选择（`cwd`）现在贯通每一个技能操作；
- 客户端的异步流程（轮询、忙碌态、错误提示）不再相互竞争，也不再静默失败。

## 快速开始

```bash
dsh plugin --profile web add @flydut/dsh-skill-group
# 重启 dsh web → 设置 → 技能分组 → 市场 → 扫描 → 导入
```

> **尚未发布到 npm。** 这个分叉还没有任何 npm 发布，所以上面那条命令要等发布之后才可用。从克隆运行：`pnpm install && pnpm build`。`lib/` 构建产物被 git 忽略，且客户端 bundle 的 id 必须等于包名（`@flydut/dsh-skill-group`）——id 过时会让启动报 *loaded without registering*。

要求 `Node ^22.19 || >=24`，dsh web `>=0.1.7-rc.1 <0.3`（本分叉针对 `0.2.0-rc.2` 开发）。

界面有两个入口——技能面板在 **设置 → 技能分组**，插件设置卡片在**插件管理器**里插件自己的页面（侧边栏 → 插件 → @flydut/dsh-skill-group）。这张卡片是在 dsh `0.1.6-alpha.2` 迁过去的：当时插件管理器取代了旧的「设置 → 插件」列表，本插件只注册到新位置。

## 功能

**设置 → 技能分组** —— 4 个标签页：**来源**（技能，平铺/分组 + 项目树）、**场景**（自定义标签分组）、**市场**（安装 + 更新）、**模式**（按 preset 的技能隔离）。

- **浏览** —— `ctx.skills` 注册表的每一个根：项目 / 用户 / 内置 + 第三方 provider。可按名称、描述、`displayName` 搜索；按来源与调用方式（模型 / 用户）筛选；按名称、加入时间、使用次数排序。来自不同来源的同名技能会显示重复徽标，而不是被悄悄隐藏。
- **开关** —— 单技能开关与分组三态开关，并带冲突对话框（全部关闭 / 保持开启）。禁用是重命名发现文件（永不删除）；被禁用的技能仍可查看，也能在详情页重新启用。只有 `~/.dsh/skills` 与 `~/.agents/skills` 可写，其余全部只读。
- **组织** —— 场景（标签）加上自动聚合的来源分组；在编辑模式下用 ↑ / ↓ 按钮排序，并持久化到 `~/.dsh/dsh-skill-hub.json`。编辑模式才显示删除/排序，读视图不被杂项干扰。
- **模式隔离** —— 把场景、来源分组或单个技能绑定到某个 **agent preset**（设置 → 技能分组 → 模式）。某个模式一旦开启隔离，只有勾选的技能对该模式的会话可见：模型目录与显式加载都会失效，而**其他所有模式不受影响**。不修改任何 preset 文件，也不移动任何技能文件；关闭后在下一轮对话恢复。
- **诊断与修复** —— provider 跳过的文件（缺 frontmatter、YAML 格式错误、名称不匹配、描述过短）会连同原因一起列出；可自动修复的（例如描述里未加引号的 `:`）有「修复」按钮一键处理。
- **新建技能** —— 新建对话框（名称、描述、Markdown 正文、目标根目录）写入 `~/.dsh/skills` 或 `~/.agents/skills`；frontmatter 由名称 + 描述生成，正文留空则回落到占位段落（模板见下方 `SKILL.md`）。
- **市场** —— 内置精选仓库，外加自定义 `owner/repo` 来源。任何包含 `SKILL.md` 的顶层目录都会被识别为根（无白名单）；仓库根目录自身的 `SKILL.md` 会被识别为以仓库名命名的单个技能（`.github/` 这类顶层点开头目录算仓库工具，不算技能内容）。异步导入，带字节级进度与取消。每个来源都固定一个版本——点 ref 徽标可在 release、分支、自定义 ref 之间切换。
- **跟踪更新** —— 导入的技能会记录仓库 + commit 快照。支持全部检查 / 全部更新，以及每个来源的徽标（已安装 / 可更新 / 上游已删除 / 有新版本）。同步会覆盖本地改动（有确认提示）；上游删除的技能会进入可恢复的回收站，并保留来源与场景归属。
- **统计** —— 从会话日志增量统计每个技能的调用次数与最近使用时间，并给出分组汇总；统计窗口与扫描间隔可在设置卡片里实时调整。
- **设置卡片** —— 在**插件管理器**里插件自己的页面（侧边栏 → 插件 → @flydut/dsh-skill-group）：总开关、向 agent 公告、调用圆点颜色、用量显示开关、统计窗口/间隔。

## 模式级技能隔离

dsh 的 agent preset 决定一次会话由哪些插件组成，而每个 preset 自带它自己的 `skill-filesystem` 用于本地发现。**分组**回答"技能如何组织"，**模式隔离**回答"哪些模式能看到哪些技能"。它与全局开关是正交的：

| 概念 | 作用范围 | 语义 |
| --- | --- | --- |
| 全局禁用 | 所有模式 | 重命名发现文件；技能在所有地方消失（可一键恢复） |
| 分组（场景 / 来源分组） | 仅面板 | 纯视图，从不改变可用性 |
| 模式隔离 | 单个 preset | 软遮蔽：文件不动，只对该模式的会话不可见 |

用法：设置 → 技能分组 → 模式 → 选一个模式 → 勾选分组/技能 → 保存。编辑器会实时预览该模式下会保留多少可见技能。

实现方式（不修改 dsh 源码，也绝不写你的 preset 文件）：

1. `ctx.skills` 是分层作用域（scope）注册表；agent preset 的 standing mount 拥有其中一层，而目录合并时**层优先于 rank**——所以宿主平面的遮蔽不可能压过 preset 自己的候选。
2. 插件用 `livePresetMounts()` 找到每个已挂载 preset 的 standing scope key，再用同一个 key 调 `createScope()`：注册落在**该 preset 的层**里，而生命周期仍由插件持有（卸载插件即解绑）。
3. 闸门对每个被隐藏的技能回答一个**同名遮蔽候选**：`rank: 0`（层内最低）、两个 invocation 标志都为 false、`get()` 恒为 `undefined`。于是 `dsh-tool-skill` 的 `<available_skills>` 目录与它的 `skill` 工具同时失效——模型既看不见也加载不到。
4. 策略变更时注册表的目录缓存会被失效，因此**下一轮对话**即生效，无需重启。

已知限制：

- preset 只有在**某个会话用过它之后**才会有 standing mount。在那之前它不受限（列表里标注为「未挂载」），首次使用后约五秒内自动挂载。
- 缺少 `@deepseek-ai/dsh-agent-preset-registry` / `dsh-scope`，或其 scope 语义变化时，整个能力会降级为只读预览并说明原因，插件其他部分不受影响。
- 它是软遮蔽：技能文件仍在磁盘上，其他模式照常使用。

## 为什么不直接用只读浏览器？

[dsh-skill-manager](https://www.npmjs.com/package/dsh-skill-manager) 能浏览，[dsh-skill-importer](https://github.com/saitamahang/dsh-skill-importer) / [dsh-find-skill](https://github.com/Moximxxx/dsh-find-skill) 能导入。**本插件是管理。**

| 能力 | 只读浏览器 | **dsh-skill-group** |
| --- | --- | --- |
| 目录 | 用户根，自行扫描 | `ctx.skills` 注册表，全部根 + 第三方 |
| 开关 | ❌ | ✅ 单技能 + 分组，永不删除 |
| 诊断 | ❌ | ✅ 原因 + 一键修复 |
| 市场 | ❌ | ✅ 内置 + 自定义，版本固定，全部更新 |
| 来源跟踪 | ❌ | ✅ 检查/同步/回收站与恢复 |
| 统计 | ❌ | ✅ 次数 + 最近使用 |

新建技能的格式（`SKILL.md`）：

```markdown
---
name: my-skill
description: One line when the agent should use this skill.
---
# my-skill
Body...
```

## 工作原理

```text
GitHub 仓库 ──扫描/导入──▶ ~/.dsh/skills
     ▲                          │
     └─检查/同步/删除── ctx.skills ◀─ provider
                                │ snapshot/get
                                ▼
                    /api/skill-hub/* ──▶ 面板（设置 → 技能分组）
```

宿主只使用 `ctx.skills.snapshot/get`、`ctx.webServer.register`、`ctx.systemPrompt.section`，以及模式隔离用的 `livePresetMounts` / `createScope`（两者都是官方导出，通过动态 `import()` 加载并在失败时降级）。路由仅限回环地址（`127.0.0.1`/`localhost`），JSON 协议。

### 模块分层

源码按四条职责链组织，数据只向下流动：

| 层 | 职责 | 模块 |
| --- | --- | --- |
| **发现 Discovery** | 有哪些技能（只读） | `src/skillfs/`、`src/provider.ts` |
| **策展 Curation** | 用户希望技能世界长什么样（纯数据 + 纯函数） | `src/store/`、`src/domain/`、`src/protocol/` |
| **执行 Enforcement** | 把策展变成运行时效果（所有副作用都在这里） | `src/enforcement/`，外加 `src/routes/catalog.ts` 里的开关重命名 |
| **呈现 Surface** | 让用户表达与看见 | `src/routes/`、`src/client/` |

两个"策展 → 执行"的概念刻意分开，不要合并：

- **禁用（硬）** 重命名发现文件，技能在*所有*模式下消失。
- **隔离（软）** 在某个 agent preset 的 standing scope 层里遮蔽技能，文件不动，其他模式不受影响。

任何带副作用的代码都属于 `src/enforcement/`；`src/domain/` 必须不含 IO，以便对它的判断做穷尽单元测试。

## HTTP API

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/api/skill-hub/catalog?cwd=` | GET | 技能 + 已禁用 + 诊断 + 重复项 |
| `/api/skill-hub/skill?name=&cwd=` | GET | 技能正文（已禁用的也能取） |
| `/api/skill-hub/skill/delete` | POST | 移入回收站（快照来源 + 场景） |
| `/api/skill-hub/toggle` | POST | `{name, enabled}` |
| `/api/skill-hub/toggle-batch` | POST | `{names, enabled}` |
| `/api/skill-hub/create` | POST | `{name, description?, content?, root?}` |
| `/api/skill-hub/diagnostic/fix` | POST | `{path}` 自动修 frontmatter |
| `/api/skill-hub/stats` | GET | 调用次数 |
| `/api/skill-hub/config` | GET/POST | 运行时配置（`null` 表示清除） |
| `/api/skill-hub/groups` | GET | 标签 + 来源分组 + 排序 |
| `/api/skill-hub/tag` 等 | POST | 新建/重命名、删除、设置成员、排序 |
| `/api/skill-hub/market` 等 | GET/POST | 列出/新增/删除/固定/检查/同步来源 |
| `/api/skill-hub/market/source/versions?repo=` | GET | 版本选择器用的 release + 分支 |
| `/api/skill-hub/repo?repo=` | GET | 发现（任意根） |
| `/api/skill-hub/repo/import` | POST | 异步任务 `{jobId, total, totalBytes}` |
| `/api/skill-hub/repo/import/progress?jobId=` | GET | 轮询任务 |
| `/api/skill-hub/repo/import/cancel` | POST | 取消任务 |
| `/api/skill-hub/sources` 等 | GET/POST | 列出/检查/同步/删除/恢复/清空回收站 |
| `/api/skill-hub/presets` | GET | 模式名册 + 每模式策略、计数、接线状态 |
| `/api/skill-hub/scope` | POST | 写入某个模式的策略（`reset: true` 即删除） |
| `/api/skill-hub/scope/preview?presetId=` | GET | 某个模式的展开明细 |

`/api/skill-hub/*` 下的未知路径会返回一个带路径名的 404（一个 `prefix` 兜底路由把它们留在插件自己的路由表内），而不是落到宿主的 SPA 兜底上——那会返回 401，看起来像鉴权问题。`GET/POST /api/skill-hub/config` 永不回显 GitHub token：token 是只写的，是否存在以 `githubTokenSet: boolean` 报告。

## 开发

```bash
pnpm typecheck     # tsc --noEmit
pnpm test          # 339 个用例，19 个套件
pnpm build         # tsc 声明 + tsdown → lib/index.js + lib/client.js
```

> 不要在同一个 `$DSH_HOME` + cwd 上跑两个 `dsh web` —— 会话日志没有锁（`seq gap` 会损坏）。用不同的 `DSH_HOME`。

## 故障排查

- `duplicate loader entry id: @flydut/dsh-skill-group` —— 删掉重复安装（只保留一种 `dsh plugin add` 方式）。
- 技能不见了 —— 看诊断区（frontmatter / 名称不匹配 / 描述过短）。
- 来源分组是空的 —— 它的技能被删了，或其禁用记录丢失（sidecar 被恢复或手工改过）。启动时会扫描磁盘上的 `.disabled` 文件做对账；没有任何可见成员的来源分组不再渲染。
- `/` 菜单里没有圆点 —— dsh 内部改了；目录仍可用。
- 找不到设置卡片 —— 它在插件管理器里（侧边栏 → 插件 → @flydut/dsh-skill-group），不在「设置」下。低于 `0.1.7-rc.1` 的 dsh 完全不受支持（0.1.7 替换了本插件所依赖的设置模型）。

## 社区

本分叉：[Issues](https://github.com/FlyDut/dsh-skill-group/issues) · [Discussions](https://github.com/FlyDut/dsh-skill-group/discussions)。

上游项目及其讨论：[cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub)。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
