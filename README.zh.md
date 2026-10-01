# dsh-skill-group

[English](README.md) | [中文版](README.zh.md)

<p align="center">
  <a href="https://www.npmjs.com/package/@flydut/dsh-skill-group"><img alt="npm version" src="https://img.shields.io/npm/v/@flydut/dsh-skill-group?color=2f81f7&label=npm"></a>
  <img alt="downloads" src="https://img.shields.io/npm/dm/@flydut/dsh-skill-group">
  <img alt="license" src="https://img.shields.io/npm/l/@flydut/dsh-skill-group">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D22.19-339933">
</p>

<p align="center">
  <img src="promo/real-skill-hub.png" alt="dsh-skill-group 面板" width="640">
</p>

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的图形化技能管理 — 在 Web GUI 里浏览 `ctx.skills` 全量目录，开关技能、查看正文、修复发现问题、从市场安装、一键新建。

> 宿主只用官方 SDK，浏览器通过官方槽位渲染，不改 dsh 源码。

## 快速开始

```bash
dsh plugin --profile web add @flydut/dsh-skill-group
# 重启 dsh web → 设置 → 技能分组 → 市场 → 扫描 → 导入
```

要求 `Node ^22.19 || >=24` + dsh web `>=0.1.7-rc.1 <0.2`。

两个界面 —— 管理面板在 **设置 → 技能分组**；本插件的设置卡片在 **插件管理页** 的插件自有页面上（侧边栏「插件」→ @flydut/dsh-skill-group）。该卡片于 dsh `0.1.6-alpha.2` 迁到此处 —— 插件管理页取代了旧的「设置 → 插件」列表，本插件只注册到新位置。

## 功能

**设置 → 技能分组** — 4 个 tab：**来源**（技能，平铺/分组+项目树）、**场景**（自定义分组）、**市场**（安装与更新）、**模式**（按 preset 隔离技能）。

- **浏览** — `ctx.skills` 注册表全量：项目/用户/内置+第三方。按名称、描述、`displayName` 搜索；按来源、按调用方式（模型/用户）筛选；按名称/添加时间/调用次数排序。不同来源的同名技能挂重名徽标，不再静默隐藏。
- **开关** — 单技能开关 + 整组三态开关，跨组冲突弹窗（全部关闭/保留开启）。禁用只重命名发现文件（不删除）；禁用的技能仍可查看正文、可一键重新启用。仅 `~/.dsh/skills` 与 `~/.agents/skills` 可写，其余只读。
- **整理** — 场景（tag）+ 自动聚合的来源集合，顺序在编辑模式下用 ↑ ↓ 按钮调整并持久化到 `~/.dsh/dsh-skill-hub.json`。编辑模式收敛删除/排序控件，阅读视图保持干净。
- **模式隔离** — 把场景分组、来源集合或单个技能绑到某个 **agent preset（模式）** 上（设置 →「技能分组」→「模式」）。该模式启用隔离后，只有勾选的技能对它的会话可见：模型目录与显式调用同时失效，**其他模式完全不受影响**。不修改任何 preset 文件，也不动技能文件；关掉即刻恢复（下一个回合生效）。
- **诊断与修复** — provider 跳过的文件给出原因（缺 frontmatter、YAML 非法、名称不一致、描述过短）；可自动修复的（如描述里未加引号的 `:`）一键 Fix 落盘。
- **新建** — 弹窗向导：技能名 + 描述 + **正文**（Markdown）+ 目标目录，写入 `~/.dsh/skills` 或 `~/.agents/skills`；frontmatter 按技能名与描述自动生成，正文留空则写入占位段（`SKILL.md` 模板见下）。
- **市场** — 内置精选仓库 + 自定义 `owner/repo`。任何含 `SKILL.md` 的顶层目录都可扫描（无白名单）；`SKILL.md` 直接位于仓库根时，整仓算作一个技能、以仓库名命名（顶层点号目录如 `.github/` 属仓库基建，不算技能内容）。异步导入，字节级进度+取消。每个源钉一个版本 —— 点 ref 徽标可在发布版/分支/手输之间切换。
- **跟踪更新** — 导入的技能记录 repo+commit 快照。检查全部/一键全更；每源徽章（已装/可更新/上游已删/新版本）。同步覆盖本地修改（先确认）；上游删除跟进移入回收站，恢复保留来源与场景归属。
- **统计** — 会话日志的调用次数+最近使用，分组头汇总；窗口与扫描间隔在设置卡片实时可调。
- **设置卡片** — 位于 **插件管理页** 的插件自有页面（侧边栏「插件」→ @flydut/dsh-skill-group）：总开关、向 Agent 公告、调用圆点颜色、用量显示开关、统计窗口/间隔。

## 模式级技能隔离

DSH 的 agent preset（模式）决定一个会话装载哪些插件，技能目录由每个 preset 自己的
`skill-filesystem` 提供。**分组**回答"技能怎么归类"，**模式隔离**回答"哪些模式能看到
哪些技能"——两者互补，且与全局禁用正交：

| 概念 | 作用域 | 语义 |
| --- | --- | --- |
| 全局禁用 | 所有模式 | 重命名发现文件，技能从目录彻底消失（可一键恢复） |
| 分组（场景 / 来源集合） | 仅面板 | 纯视图，不改变可用性 |
| 模式隔离 | 某个 preset | 软屏蔽：文件不动，只有该模式的会话看不到 |

用法：设置 →「技能分组」→「模式」→ 选一个模式 → 勾选分组/技能 → 保存。面板右侧实时
预览"该模式下模型可见 N 个、隐藏 M 个"。

实现（不改 dsh 源码，也不写你的 preset 文件）：

1. `ctx.skills` 是按作用域分层的注册表；agent preset 的 standing mount 独占一层，
   且分层合并时**层优先于 rank**——所以宿主层的遮蔽永远压不过 preset 层。
2. 中枢用 `livePresetMounts()` 找到每个已挂载 preset 的 standing scope key，
   再用同一个 key 调 `createScope()`：注册因此落进**那个 preset 的层**，而生命
   周期仍归中枢所有（插件卸载即撤销）。
3. 闸门对"不该看到的技能"返回**同名遮蔽候选**：`rank: 0`（同层最小）、
   `modelInvocable`/`userInvocable` 双 false、`get()` 恒 `undefined`。
   `dsh-tool-skill` 的 `<available_skills>` 目录与 `skill` 工具因此同时失效——
   模型既看不到，也调不到。
4. 策略变更时通知注册表丢弃目录缓存，会话的**下一个回合**生效，无需重启。

已知边界：

- 一个 preset 只有在**被某个会话用过**之后才有 standing mount。在那之前它按"不隔离"
  运行（模式列表会标出「未挂载」），首次使用后约 5 秒内自动接上。
- 部署里缺少 `@deepseek-ai/dsh-agent-preset-registry` / `dsh-scope`，或它们的作用域语义变化时，
  整个能力降级为"只读预览"并给出原因，插件的其余功能**完全不受影响**。
- 模式隔离是软屏蔽：技能文件仍在磁盘上，其他模式的会话照常使用。

## 为什么还需要一个管理器？

[dsh-skill-manager](https://www.npmjs.com/package/dsh-skill-manager) 只读浏览，[dsh-skill-importer](https://github.com/saitamahang/dsh-skill-importer) / [dsh-find-skill](https://github.com/Moximxxx/dsh-find-skill) 只做导入。**本插件负责管理。**

| 能力 | 只读浏览器 | **dsh-skill-group** |
| --- | --- | --- |
| 目录 | 自扫盘、仅用户根 | `ctx.skills` 全量+第三方 |
| 开关 | ❌ | ✅ 单技能+整组，从不删除 |
| 诊断 | ❌ | ✅ 原因+一键修复 |
| 市场 | ❌ | ✅ 内置+自定义，版本钉选，一键全更 |
| 来源跟踪 | ❌ | ✅ 检查/同步/回收站可恢复 |
| 统计 | ❌ | ✅ 次数+最近使用 |

`SKILL.md` 模板：

```markdown
---
name: my-skill
description: 一句话说明何时使用。
---
# my-skill
正文...
```

## 工作原理

```text
GitHub 仓库 ──扫描/导入──▶ ~/.dsh/skills
     ▲                        │
     └─检查/同步/删除── ctx.skills ◀─ provider
                              │ snapshot/get
                              ▼
                  /api/skill-hub/* ──▶ 面板（设置 → 技能分组）
```

宿主仅用 `ctx.skills.snapshot/get`、`ctx.webServer.register`、`ctx.systemPrompt.section`，
以及模式隔离所需的 `livePresetMounts` / `createScope`（官方导出，均以动态 import 载入、
失败即降级）。路由仅回环（`127.0.0.1`/`localhost`），JSON。

## HTTP API

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/api/skill-hub/catalog?cwd=` | GET | 技能+禁用+诊断+重名 |
| `/api/skill-hub/skill?name=&cwd=` | GET | 技能正文（禁用的也可） |
| `/api/skill-hub/skill/delete` | POST | 移入回收站（快照来源+场景） |
| `/api/skill-hub/toggle` | POST | `{name, enabled}` |
| `/api/skill-hub/toggle-batch` | POST | `{names, enabled}` |
| `/api/skill-hub/create` | POST | `{name, description?, content?, root?}` |
| `/api/skill-hub/diagnostic/fix` | POST | `{path}` 自动修 frontmatter |
| `/api/skill-hub/stats` | GET | 调用次数 |
| `/api/skill-hub/config` | GET/POST | 运行时配置（`null` 清除） |
| `/api/skill-hub/groups` | GET | tags+集合+排序 |
| `/api/skill-hub/tag` 等 | POST | 新建/重命名、删除、设成员、排序 |
| `/api/skill-hub/market` 等 | GET/POST | 市场源 列表/添加/删除/钉 ref/检查/同步 |
| `/api/skill-hub/market/source/versions?repo=` | GET | 版本选择器的 releases+branches |
| `/api/skill-hub/repo?repo=` | GET | 发现（任意根） |
| `/api/skill-hub/repo/import` | POST | 异步任务 `{jobId, total, totalBytes}` |
| `/api/skill-hub/repo/import/progress?jobId=` | GET | 轮询进度 |
| `/api/skill-hub/repo/import/cancel` | POST | 取消任务 |
| `/api/skill-hub/sources` 等 | GET/POST | 来源 列表/检查/同步/删除/恢复/清空回收站 |
| `/api/skill-hub/presets` | GET | 模式名单 + 每条的策略、计数与接线状态 |
| `/api/skill-hub/scope` | POST | 写入某模式的策略（`reset: true` 删除） |
| `/api/skill-hub/scope/preview?presetId=` | GET | 该模式的可见性展开明细 |

`/api/skill-hub/*` 下的未知路径回写明路径的 404（一条 `prefix` 兜底路由把它们留在插件的命名路由表里），而不会落到宿主 SPA fallback 变成 401、被误读成鉴权问题。`GET/POST /api/skill-hub/config` 不再回显 GitHub token：令牌只写不读，是否已配置通过 `githubTokenSet: boolean` 告知。

## 开发

```bash
pnpm typecheck     # tsc --noEmit
pnpm test          # 336 tests, 19 suites
pnpm build         # tsc 声明 + tsdown → lib/index.js + lib/client.js
```

> 同一 `$DSH_HOME` + cwd 下勿开两个 `dsh web` — 无会话日志锁，会 `seq gap` 损坏。换 `DSH_HOME` 或先关旧实例。

## 故障排查

- `duplicate loader entry id: skill-hub` — 删掉重复安装（只留一种 `dsh plugin add`）。
- 技能不出现 — 看诊断区（缺 frontmatter / 名称不一致 / 描述过短）。
- 来源组空壳 — 组内技能已被删除、或禁用记录丢失（状态文件被恢复/手改）。启动时自动对账磁盘上的 `.disabled` 文件补记录；无可见成员的来源组不再渲染。
- `/` 菜单圆点消失 — dsh 内部触发源变更，目录功能不受影响。
- 找不到设置卡片 — 它在插件管理页（侧边栏「插件」→ @flydut/dsh-skill-group），不在「设置」里；低于 `0.1.7-rc.1` 的 dsh 完全不受支持（0.1.7 换掉了本插件所依赖的 settings 模型）。

## 社区

[Issues](https://github.com/FlyDut/dsh-skill-group/issues) · [讨论区](https://github.com/FlyDut/dsh-skill-group/discussions) · [官方展示](https://github.com/deepseek-ai/deepseek-harness/discussions/3161) · [市场收录 PR](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1746) · [Discord](https://discord.gg/Ycq5dCaS4)

## License

MIT — [LICENSE](LICENSE).
