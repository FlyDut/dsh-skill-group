# 上游同步台账（upstream sync ledger）

本仓库是 [cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub) 的分叉
（`upstream` remote）。分叉保留了上游没有的功能（最主要是**模式级技能隔离**），
因此**不整分支 merge 上游**，而是按「只移植当前插件真正需要的改动」逐条审阅、手工移植。

这个文件是下次跟进上游时的唯一入口：记录**审到哪了**、**每条上游提交的裁决**、
**为什么**，以及**本地独有、不能被上游的删除动作带走的东西**。

---

## 下次从上游更新：从这里开始

```bash
git fetch upstream --tags

# ① 上次审阅过的上游水位线（tag 指向上游提交本身，不是本地提交）
git log --oneline upstream-baseline/v0.3.15..upstream/main

# ② 想连改动内容一起总览
git log --stat upstream-baseline/v0.3.15..upstream/main

# ③ 本地这一侧：本次同步包含哪些提交
git log --oneline fc14e89..sync/v0.3.15
```

> **不要**用 `git merge upstream/main`，也不要 `cherry-pick` 上游提交。
> 上游 v0.3.15 删掉了 `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `scripts/smoke-load.mjs`
> （改用 npm），并重排了 `package-lock.json`；merge 会把这些删除和重排一起带进来。
> 一律**按文件手工移植逻辑改动**。

审完一轮后，把新水位记到下面的「当前水位」并打新 tag（见文末「标记约定」）。

---

## 当前水位

| 项 | 值 |
| --- | --- |
| **已审阅到的上游提交** | `39de3eb`（= tag `v0.3.15`，annotated tag 对象 `c3ebb6a`） |
| **上次同步前的分叉点** | `c6e9e5c`（上次 merge `9325f28` 带入的上游提交） |
| 本次同步的上游增量 | `c6e9e5c..39de3eb`，共 **13** 个提交 |
| 本地同步里程碑 | tag `sync/v0.3.15` |
| 本机实际运行的 DSH | **0.1.6-alpha.2**（见下「版本口径」） |
| 本次同步的移植提交 | `d200fdc` `1522fed` `c72bc4f` `8b91c14` `4b6b84a` `38fe33f` `b3923c4` |
| 本台账文件 | 由 tag `sync/v0.3.15` 所指的提交引入（随后仅为文档/标记提交） |

---

## 本次同步（上游 v0.3.15）的完整裁决

上游 `c6e9e5c..39de3eb` 共 13 个提交，逐条如下。**下次审阅时以本表为参照**。

### ✅ 完整采纳（3 条）

| 上游提交 | 上游标题 | 本地落地提交 | 说明 |
| --- | --- | --- | --- |
| `b594b19` | fix(security): config 路由不再回显 GitHub token | `1522fed` | 与 settings 模型无关，纯安全修复 |
| `7dc704f` | feat(repo): 支持 SKILL.md 直接位于仓库根的技能（issue #10） | `8b91c14` | 版本无关的功能修复，含迁移保真 |
| `4ba3e88` | fix(repo): 显式声明 accept-encoding: identity | `d200fdc` | 修「启动环境带代理时 GitHub 全挂」 |

### ⚠️ 部分采纳（3 条）

| 上游提交 | 采纳的部分 | 未采纳的部分与理由 | 本地落地提交 |
| --- | --- | --- | --- |
| `578c81d` | 未知 `/api/skill-hub/*` 路径回明确 404（`RouteSpec.kind` + prefix 兜底路由） | **市场路径重命名** `market/check` → `market/source/check`：属纯命名重构而非缺陷，需同时改客户端常量/宿主 handler/弃用别名/文档，回归面大于收益；本地有 4 个市场源在用 | `c72bc4f` |
| `ecec073` | 「配置写入后显式重跑 `sync()`」的加固（`updateConfig` 里 `replace` 之后调 `sync()`） | `settings.mutate` / volatile 引用读值 / 删 `settingsScope.watch` 的**主体重写**：那是 0.1.7 模型，本地 `ctx.settings.register()` + `settingsScope.watch()` 在 0.1.6 下正常工作 | `4b6b84a` |
| `e5acca9` | `update.ts` 改走 `apiHeaders()`（补上漏掉的 identity）；`[skill-hub]` → `[dsh-skill-hub]` 日志前缀 | **10 处静态清理**（未使用 import/变量）：与本地已重构的 `routes/*` 分域结构漂移，机械照搬易误删；仅当某文件因其他改动已在本批次触碰时才顺带修 | `d200fdc` |

### ❌ 不采纳（7 条）

| 上游提交 | 上游标题 | 不采纳理由 |
| --- | --- | --- |
| `e598837` | feat!: 迁移到 dsh 0.1.7-alpha.1 的 settings 模型，改用官方自动生成的配置页 | **0.1.7 专属**。本地 `ctx.settings.register()` / `settingsScope.watch()` 在 0.1.6 下正常；采纳即插件无法激活 |
| `500ce76` | fix(client): 恢复插件配置卡片——dsh 0.1.7 并没有自动生成的配置页 | 本地 `SkillHubSettingsCard.tsx` / `settings-card.tsx` / `settings-form.ts` **从未删除**，配置卡片一直存在，无需动作 |
| `717202a` | docs(client): 注释里的 settings-scope 措辞改为 configForms | 本地说的是 `settingsScope`，与实现一致；照改反而变成错误注释 |
| `7fdd1ee` | docs: 修正配置入口的错误说法，并按当前 UI 重截 promo 图 | 前提是 0.1.7 的配置页说法；promo 三张图是 0.1.7 + 上游 UI 的重截，与本地 0.1.6 界面不符 |
| `840002e` | chore: 移除已无用的 plain schemastery 依赖 | 本地 `src/index.ts` 仍 `import z from 'schemastery'`（`Config` 与 `HubSettingsSchema` 用它），**依赖仍被使用** |
| `8b213bb` | fix: settings 改为可选依赖，配置改从 volatile 引用读（issue #11） | **0.1.7 专属**：依赖 0.1.7 的 `Config` / volatile 语义与 `ctx.get('settings')` 软依赖模型 |
| `39de3eb` | release: v0.3.15 | 版本号与兼容口径提升到 0.1.7-alpha.1；本机运行时是 0.1.6-alpha.2，采纳会导致 `dshVersions` 与实际环境不符 |

---

## 版本口径：为什么停在 0.1.6-alpha.2

上游 `39de3eb` 明确声明：**仅兼容 dsh `>=0.1.7-alpha.1 <0.2`；0.1.6-alpha.2 用户停留在 v0.3.14**。

本机实际运行的是 **0.1.6-alpha.2**：

- 运行中的进程：`…/@deepseek-ai/dsh/lib/bin.js web`
- `~/.dsh/profiles/node_modules/@deepseek-ai/dsh` → 0.1.6-alpha.2 树
- 仓库内 `node_modules/@deepseek-ai/dsh-host-webserver` 解析到 0.1.6-alpha.2

因此本分叉继续停留在 0.1.6 口径，`package.json` 的
`dshWorkshop.compatibility.dshVersions` 保持 `["0.1.6-alpha.2"]`。

**等本机升级到 0.1.7 之后**，下面这批「不采纳」需要重新评估（它们是一个整体迁移）：

> `e598837` → `500ce76` → `717202a` → `ecec073` → `840002e` → `8b213bb` → `39de3eb`

届时注意：`ecec073` 的「显式 sync」加固本地已采纳，迁移后仍应保留。

---

## 本地独有、上游没有的东西（不要被上游的删除动作带走）

| 内容 | 文件 |
| --- | --- |
| **模式级技能隔离**（按 agent preset 控制技能可见性） | `src/enforcement/*`、`src/domain/scope-*`、`src/routes/scopes.ts`、`src/client/panel/ScopesView.tsx`、`src/client/panel/hooks/useScopeFlow.ts`、`src/client/locales/scopes.ts`、`src/protocol/scopes.ts` |
| 中文界面命名「**Skill 管理**」 | `src/client/locales/*` |
| **pnpm 工具链**（上游已改回 npm 并删除） | `pnpm-lock.yaml`、`pnpm-workspace.yaml`（`allowBuilds: esbuild`）、`scripts/smoke-load.mjs` |
| 脱敏后的 config 响应消费方 | `src/client/panel/hooks/useMetaFlow.ts`（只读颜色与显示开关，不读 token） |

核对方法（应输出为空）：

```bash
git diff --name-only <上次同步里程碑tag> HEAD -- \
  src/enforcement src/domain src/routes/scopes.ts \
  src/client/panel/ScopesView.tsx src/client/panel/hooks/useScopeFlow.ts \
  src/client/locales/scopes.ts src/protocol/scopes.ts
```

---

## 建议的同步流程

1. `git fetch upstream --tags`，用 `upstream-baseline/<版本>..upstream/main` 列出增量。
2. 对**每个**提交问三件事：
   - 是否依赖 **0.1.7 专属 API**（`settings.mutate`、`ctx.configForms`、`.volatile()`、`describe().value`）？→ 不采纳
   - 是否触碰**本地独有功能**（上表文件）？→ 手工移植接缝，绝不整块替换
   - 是否只是**文档/依赖清理**？→ 通常不采纳（本地结构与上游已漂移）
3. 手工移植，按主题分批提交；每批 `pnpm typecheck && pnpm test && node scripts/smoke-load.mjs`。
4. 涉及客户端（`src/client/`）时必须 `pnpm build` 重建 `lib/client.js`。
5. 更新本文件的「当前水位」与裁决表，打新 tag，给新提交挂 `git notes`。

## 标记约定

每次同步结束后：

```bash
# ① 上游水位线：指向【上游提交】，供下次 git log <tag>..upstream/main
git tag -a upstream-baseline/vX.Y.Z <上游提交sha> -m "已审阅到上游 vX.Y.Z"

# ② 本地里程碑：指向【本地 HEAD】
git tag -a sync/vX.Y.Z HEAD -m "完成对上游 vX.Y.Z 的选择性同步"

# ③ 给每个移植提交挂来源元数据（不改写提交 SHA）
git notes add -m "Upstream-Commit: <上游sha>
Upstream-Title: <上游标题>
Upstream-Baseline: upstream-baseline/vX.Y.Z
Disposition: adopted | partial | rejected-portion" <本地提交sha>
```

查看 notes：`git log --notes --oneline`（或 `git notes show <sha>`）。
若将来推送，notes 需单独推：`git push origin refs/notes/commits`。

**提交信息约定**：移植类提交在正文末尾写明来源，格式为

```
来源：上游 <sha>（<上游标题>）；<采纳/部分采纳说明>
```

已用 `git notes` 补齐本次同步**全部**提交的来源（含仅本地文档/台账的提交，标为 `local-only`），
见 `git log --notes fc14e89..sync/v0.3.15`。
