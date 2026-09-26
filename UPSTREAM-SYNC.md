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
git log --oneline upstream-baseline/v0.3.16..upstream/main

# ② 想连改动内容一起总览
git log --stat upstream-baseline/v0.3.16..upstream/main

# ③ 本地这一侧：本次同步包含哪些提交（起点见「当前水位」的本地同步起点）
git log --oneline 8882900..sync/v0.4.0
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
| **已审阅到的上游提交** | `643d143`（= tag `v0.3.16`） |
| 上次审阅的水位 | `39de3eb`（= tag `v0.3.15`） |
| 本次同步的上游增量 | `39de3eb..643d143`，共 **2** 个提交 |
| 本地同步起点（分叉点） | `8882900`（上一轮收尾提交） |
| 本地同步里程碑 | tag `sync/v0.4.0` |
| 本机实际运行的 DSH | **0.1.7-rc.1**（见下「本机环境口径」） |
| 本插件声明兼容 | `dshWorkshop.compatibility.dshVersions = ["0.1.7-rc.1"]` |
| 本次同步的移植提交 | `06e13e1`（依赖）`27653c2`（settings）`ac145a3`（scope） |
| 本次同步的本地提交 | `2e0d5c6`（smoke）`b2c5a8e`（docs） |
| 本台账文件 | 由 tag `sync/v0.3.15` 所指提交引入；`sync/v0.4.0` 时整篇改写到 0.1.7 口径 |

---

## 本次同步（上游 v0.3.16）的裁决

上游 `39de3eb..643d143` 只有 2 个提交，且**都不含源码改动**——都是 0.1.7 线的跟版本与发布。

### ⚠️ 部分采纳（1 条）

| 上游提交 | 上游标题 | 处置 | 本地落地 |
| --- | --- | --- | --- |
| `36b5144` | chore: 适配 dsh 0.1.7-rc.1——devDeps 基线升级、dshVersions 追加、补删 plain schemastery | 采纳 devDeps 升 `0.1.7-rc.1` 与 `dshVersions` 追加的口径；**不直接删** schemastery，而是换成 `@deepseek-ai/schemastery`（scoped fork，`.volatile()` 只有它有）并放进 peerDependencies 复用 dsh 实例。本地把 devDeps 钉成精确 `0.1.7-rc.1` 而不是 `^`，避免解析到 rc.2 却只声明 rc.1 | `06e13e1` |

### ❌ 不采纳（1 条）

| 上游提交 | 上游标题 | 不采纳理由 |
| --- | --- | --- |
| `643d143` | release: v0.3.16 | 纯版本号发布。本地按自己的发布线走 **`0.4.0`**（破坏性兼容口径变更），不跟随上游号 |

### 📌 本轮真正的动作：0.1.7 settings 模型迁移

这轮上游增量本身没有逻辑可移植，但它宣告 0.1.7 线在继续前进。而**本机环境早已越过上一轮台账记录的口径**：

> 台账上一版记录「本机运行 0.1.6-alpha.2」，并据此把 7 条 0.1.7 提交判为「不采纳」，
> 写着「等本机升级到 0.1.7 之后重新评估」。**该前提已经失效**：本机 `dsh --version` 已是
> `0.1.7-rc.1`，而插件仍停在 0.1.6 口径，依赖 0.1.7 里**整个消失**的
> `ctx.settings.register()` / `ctx.settingsScope`——一旦挂载就会在 settings 处运行时失败。

所以本轮把原先那批「0.1.7 专属、不采纳」整体重新评估，落地为一个迁移：

| 上游提交 | 本轮处置 | 本地落地 |
| --- | --- | --- |
| `e598837` | **部分采纳**：换用 0.1.7 的传输模型（volatile `Config`、`settings.describe/mutate`、`ctx.configForms`）；**不采纳**「删掉自建配置卡片、交给官方自动生成页」——上游 `500ce76` 自己已回退该做法（0.1.7 并没有自动生成的配置页） | `27653c2` |
| `8b213bb` | **采纳**：settings 改为可选依赖（`inject` 去掉 settings，改 `ctx.get('settings')` 软取），配置从 volatile 引用读 | `27653c2` |
| `840002e` | **采纳**：plain schemastery 依赖被 scoped fork 取代 | `06e13e1` |
| `ecec073` | 「配置写入后显式重跑 `sync()`」本地上一轮已采纳，迁移后继续保留（`settings.mutate` 不重跑 `apply`，写完显式 `sync()`） | `27653c2` |
| `500ce76` | **无动作**：本地 `SkillHubSettingsCard.tsx` / `settings-card.tsx` / `settings-form.ts` 从未删除 | — |
| `717202a` | **不采纳**：其注释说的是 0.1.7 的 configForms 措辞；本地注释已按实现改述 | — |
| `7fdd1ee` | **不采纳**：promo 三张图是 0.1.7 + 上游 UI 的重截，与本地界面不符 | — |
| `39de3eb` | **不采纳**：上游 v0.3.15 的版本号与兼容口径；本地按自己的 `0.1.7-rc.1` 口径声明 | `06e13e1` |
| `36b5144` / `643d143` | 本轮增量，见上表 | `06e13e1` |

---

## 0.1.7 迁移的契约对照表（下次再碰 settings 时的速查）

| 0.1.6-alpha.2（旧口径） | 0.1.7-rc.1（现行口径） |
| --- | --- |
| `ctx.settings.register(ns, schema, { base })` → `SettingsScope` | **没有 `register()`**：Loader 入口的 `Config` 就是命名空间，`ctx.settings` 是 `SettingsForms` |
| `settingsScope.get()` 读生效值 | 读插件自己的 volatile 引用（`config[field].get()`）；settings 写入**就地**更新它们，**不重跑 `apply()`** |
| `settingsScope.watch()` 监听提交 | 无 watcher：`settings.mutate` 后由调用方显式 `sync()`；Loader 侧的配置编辑会重载入口、重跑 `apply()` |
| `settingsScope.replace(user)` 整层重写 | `settings.mutate(entryId, SettingsPathOp[])`：`unset` 表达「清除覆盖」，原子、无读-改-写竞态 |
| 命名空间 = 包名 `dsh-skill-hub` | 命名空间 = **Loader 入口 id** `skill-hub`（契约常量 `HUB_ENTRY_ID`） |
| 浏览器：`ctx.settingsScope.bind({ namespace })` | 浏览器：`ctx.configForms.get(HUB_ENTRY_ID)`，类型 `ConfigForm<T>`，`set/unset` 返回 `Promise<boolean>` |
| `import z from 'schemastery'` | `import z from '@deepseek-ai/schemastery'`：`.volatile()` 只有 scoped fork 有，混用会让模块顶层抛错，而 dsh 只打印一行 `failed to import` |
| preset 侧包 `@deepseek-ai/dsh-agent-presets`（无 0.1.7 版本） | `@deepseek-ai/dsh-agent-preset-registry`：`livePresetMounts` 签名与 `PresetMount.presetId/key` 不变，服务名仍是 `ctx.agentPresets` |

迁移后验收：`pnpm typecheck && pnpm test && pnpm build && pnpm smoke` 全绿，测试 **334 通过 / 19 套件**。

> 未验证项：本次**没有**把插件重新挂载到 `~/.dsh/profiles/web`，所以真实 GUI 下的面板/卡片/slash 圆点行为未经端到端验证。

---

## 历史裁决：上游 v0.3.15（`c6e9e5c..39de3eb`，13 个提交）

**下次审阅时以本表为参照**（其中「0.1.7 专属」那批已在本次迁移中重新评估，结果见上一节）。

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
| `ecec073` | 「配置写入后显式重跑 `sync()`」的加固 | `settings.mutate` / volatile 引用读值 / 删 `settingsScope.watch` 的**主体重写**：当时是 0.1.7 模型，本地未迁移（本次已迁移，见上） | `4b6b84a` |
| `e5acca9` | `update.ts` 改走 `apiHeaders()`（补上漏掉的 identity）；`[skill-hub]` → `[dsh-skill-hub]` 日志前缀 | **10 处静态清理**（未使用 import/变量）：与本地已重构的 `routes/*` 分域结构漂移，机械照搬易误删 | `d200fdc` |

### ❌ 不采纳（7 条）

| 上游提交 | 上游标题 | 不采纳理由 |
| --- | --- | --- |
| `e598837` | feat!: 迁移到 dsh 0.1.7-alpha.1 的 settings 模型，改用官方自动生成的配置页 | 当时是**0.1.7 专属**（本地仍是 0.1.6）。**本次已部分采纳**，见上一节 |
| `500ce76` | fix(client): 恢复插件配置卡片——dsh 0.1.7 并没有自动生成的配置页 | 本地卡片从未删除，无需动作 |
| `717202a` | docs(client): 注释里的 settings-scope 措辞改为 configForms | 当时本地说的是 `settingsScope`，与实现一致；照改反而变成错误注释 |
| `7fdd1ee` | docs: 修正配置入口的错误说法，并按当前 UI 重截 promo 图 | 前提是 0.1.7 的配置页说法；promo 三张图是 0.1.7 + 上游 UI 的重截 |
| `840002e` | chore: 移除已无用的 plain schemastery 依赖 | 当时本地仍 `import z from 'schemastery'`。**本次已采纳**（换成 scoped fork） |
| `8b213bb` | fix: settings 改为可选依赖，配置改从 volatile 引用读（issue #11） | 当时是**0.1.7 专属**。**本次已采纳** |
| `39de3eb` | release: v0.3.15 | 版本号与兼容口径提升到 0.1.7，当时本机是 0.1.6-alpha.2，采纳会导致 `dshVersions` 与实际环境不符 |

---

## 本机环境口径

本机实际运行的是 **0.1.7-rc.1**：

- `dsh --version` → `0.1.7-rc.1`
- 本会话 runtime checkout → `…/@deepseek-ai/dsh-web-app@0.1.7-rc.1`
- 全局依赖树里只有 `dsh-settings@0.1.7-rc.1` / `dsh-skill@0.1.7-rc.1`，无 0.1.6 残留

因此：

- `package.json` 的 `dshWorkshop.compatibility.dshVersions` = `["0.1.7-rc.1"]`；
- devDependencies 的 `@deepseek-ai/dsh-*` 与 `@deepseek-ai/cordis` 钉在 `0.1.7-rc.1` / `4.0.4`（`Volatile` 类型从 cordis 4.0.4 起才有）；
- **旧的 0.1.6-alpha.2 口径已作废**：`SettingsProvider.register()` / `settingsScope` 在 0.1.7 里整个消失，旧代码在新宿主上会 `failed to import`。

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
   - 是否依赖 **0.1.7 的 API**（`settings.mutate`、`ctx.configForms`、`.volatile()`、`describe()`）？→ 本地已迁移，按新模型移植
   - 是否触碰**本地独有功能**（上表文件）？→ 手工移植接缝，绝不整块替换
   - 是否只是**文档/依赖清理**？→ 通常不采纳（本地结构与上游已漂移）
3. 手工移植，按主题分批提交；每批 `pnpm typecheck && pnpm test && pnpm build && pnpm smoke`。
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
