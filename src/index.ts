/**
 * dsh-skill-hub — host half，也是整个插件的组装点。
 *
 * 插件要完成的任务只有一句：**策展本地技能在 DSH 里的呈现与可用性**。
 * 代码按四条职责链分层，数据只向下流：
 *
 *   ① 发现 Discovery     技能事实从哪来                    skillfs/ · provider.ts
 *                        只读扫描，不产生任何副作用。
 *   ② 策展 Curation      用户希望技能世界长什么样           store/ · domain/ · protocol/
 *                        纯数据 + 纯函数（展开与判定可穷举单测）。
 *   ③ 执行 Enforcement   把策展意图落到运行时               enforcement/
 *                        副作用全部集中在这里：
 *                        · Disabled  = 重命名发现文件（全局硬禁用，routes/catalog.ts）
 *                        · Scope     = 往 preset 的 standing 作用域注入闸门（模式级软屏蔽）
 *   ④ 呈现 Surface       让用户表达与看见                   routes/ · client/
 *
 * 本文件只做组装：把 store（②）装配进 ScopeView（②的判定），把 ScopeView 与
 * 运行时能力装配成 PresetWiring（③），再把二者作为路由依赖交给 makeRoutes（④）、
 * 把中英公告交给 systemPrompt。它自己不实现任何业务规则。
 *
 * 浏览器半边（./client）渲染设置页里的面板与侧栏入口。全部能力都走官方 NPM
 * SDK 包，不改 dsh 源码，也不写用户的 preset 文件。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-settings'
import { HUB_CONFIG_DEFAULTS, HEX_COLOR_RE, collectionKey, sourceKey, tagKey, type HubConfig, type HubSettingsValue } from './protocol.ts'
import { ScopeView, type ScopeCatalogSnapshot, type ScopeSkillMeta } from './domain/scope-view.ts'
import { PresetWiring, loadScopeRuntime } from './enforcement/scope-wiring.ts'
import { readPresetRoster } from './enforcement/roster.ts'
import { SkillHubProvider } from './provider.ts'
import { buildCollections } from './routes/collection.ts'
import { workspaceEntries } from './routes/catalog-data.ts'
import { makeRoutes, type ScopeRouteDeps } from './routes.ts'
import { createSkillStatsReader, asPersistenceSeam, type SessionPersistenceLike, type SessionQueryLike, type SkillStatsReader } from './stats.ts'
import { SkillHubStore } from './store.ts'
import { reconcileDisabledSkills } from './reconcile.ts'
import { cleanupLeftoverImportDirs, setGithubToken } from './repo.ts'
import { dshHome } from './store.ts'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'skill-hub'

/** Services required before the skill-hub surfaces can mount. */
export const inject = ['webServer', 'skills', 'systemPrompt', 'settings']

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** When true (default), a system-prompt section announces the hub to every agent. */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, prompt section). */
  enabled?: boolean
  /** Show per-skill invocation count chip. Default true. */
  showUseCount?: boolean
  /** Show per-skill last-used relative time. Default true. */
  showUseTime?: boolean
  /** Show group-header usage summaries (count + last used). Default true. */
  showGroupSummary?: boolean
  /** 统计滚动窗口天数：只统计最近 N 天的使用；0 = 全部历史。默认 0。 */
  statsWindowDays?: number
  /** 自动统计扫描间隔（分钟，最小 1）。默认 5。 */
  statsScanMinutes?: number
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(HUB_CONFIG_DEFAULTS.announceToAgent),
  enabled: z.boolean().default(HUB_CONFIG_DEFAULTS.enabled),
  showUseCount: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseCount),
  showUseTime: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseTime),
  showGroupSummary: z.boolean().default(HUB_CONFIG_DEFAULTS.showGroupSummary),
  statsWindowDays: z.number().min(0).max(3650).default(HUB_CONFIG_DEFAULTS.statsWindowDays),
  statsScanMinutes: z.number().min(1).max(1440).default(HUB_CONFIG_DEFAULTS.statsScanMinutes),
})

/**
 * Settings namespace hosting the hub's runtime config. The host serves every
 * registered settings namespace to the web client, so the browser card and the
 * settings page edit this namespace through the official settings transport,
 * and the plugin consumes the same resolved value — one source of truth.
 */
export const CONFIG_NAMESPACE = 'dsh-skill-hub' as SettingsNamespace

/** Schema of the hub's settings namespace: the card's fields (booleans + optional dot colors). */
export const HubSettingsSchema: z<HubSettingsValue> = z.object({
  enabled: z.boolean().default(HUB_CONFIG_DEFAULTS.enabled),
  announceToAgent: z.boolean().default(HUB_CONFIG_DEFAULTS.announceToAgent),
  showUseCount: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseCount),
  showUseTime: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseTime),
  showGroupSummary: z.boolean().default(HUB_CONFIG_DEFAULTS.showGroupSummary),
  dotModelColor: z.string().pattern(HEX_COLOR_RE),
  dotUserColor: z.string().pattern(HEX_COLOR_RE),
  githubToken: z.string(),
  statsWindowDays: z.number().min(0).max(3650).default(HUB_CONFIG_DEFAULTS.statsWindowDays),
  statsScanMinutes: z.number().min(1).max(1440).default(HUB_CONFIG_DEFAULTS.statsScanMinutes),
})

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 152

/**
 * 模式隔离的接线轮询间隔。只做一件很便宜的事：枚举当前活着的 preset
 * standing mount 并补齐/清理闸门注入。首个注入之后它几乎总是无操作。
 */
const SCOPE_WIRING_TICK_MS = 5000

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const SKILL_HUB_GUIDANCE = [
  '本机已安装 dsh-skill-hub 插件（DSH Web GUI Skill管理）：设置 →「Skill」分区为管理主页；本插件的配置卡片（启用/公告开关）在插件管理页——侧边栏「插件」→ 本插件。能力：完整本地技能目录（项目/自定义/用户/内置全部来源，走官方 ctx.skills 注册表，含第三方 provider）；按来源与自定义分组浏览，分组/来源头部的滑动开关可一键启用/禁用整组（跨组冲突时询问）；市场：内置市场目录（精选仓库一键添加）加自定义仓库源，扫描后勾选安装，每个市场源行显示已装/可更新/上游已删数量，支持「检查全部」与「全部更新」；来源跟踪：从 GitHub 仓库（市场源或直接地址）导入的技能记录上游 repo/commit 快照，可检查更新、选择同步、上游删除时跟进删除（移入回收站可恢复，恢复后保留来源与场景归属）；个人技能（无来源记录）不跟踪；调用次数与最近使用时间统计；查看技能正文；发现诊断；新建技能向导（写入 ~/.dsh/skills 或 ~/.agents/skills）。模式级技能隔离：设置 →「技能」→「模式」把场景/来源分组或单个技能绑到某个 agent preset 上；该模式启用隔离后，只有勾选的技能对它的会话可见（模型目录与显式调用同时失效），其他模式完全不受影响；实现方式是把一个遮蔽 provider 接进该 preset 的作用域，不改任何 preset 文件，也不动技能文件。全局禁用与模式隔离正交：前者让技能在所有模式消失，后者只在指定模式消失。限制：仅用户级技能（user-dsh/user-agents 根目录）可写，项目/内置/运行时技能只读展示；路由仅回环可访问。用户提到「技能管理 / 技能列表 / 技能开关 / 技能同步 / 技能市场 / 更新技能 / 新建技能」时即指本插件，请据此协作。',
  'The dsh-skill-hub plugin is installed (the DSH Web GUI skill hub): Settings → "Skills" is the management page; the plugin\'s configuration card (enable / announcement toggles) lives on its own page in the Plugins manager (sidebar → 插件 → the plugin). Capabilities: full local skill catalog (project / custom / user / bundled roots via the official ctx.skills registry, including third-party providers); browsing by source and custom groups, each group header carrying a sliding switch to enable/disable the whole group in one click (cross-group conflicts prompt the user); market: a built-in catalog of curated repos (one-click add) plus custom repo sources, scan-and-install import, per-source installed / updatable / deleted-upstream badges with "check all" and "update all" actions; upstream source tracking: skills imported from GitHub repos (market sources or direct URLs) record the repo/commit snapshot, support update checks, selective sync, and follow-up deletion when the upstream removes a skill (moves it into a restorable trash; restoring keeps the source and scene membership); personal skills (no source record) are never tracked; invocation counts and last-used times; skill body inspection; discovery diagnostics; new-skill wizard (writes to ~/.dsh/skills or ~/.agents/skills). Mode-level skill isolation: Settings → Skills → Modes binds scenes, source collections, or individual skills to an agent preset; once a mode enables isolation, only the checked skills stay visible to its sessions (both the model catalog and explicit loads stop working for the rest) while every other mode is untouched. It works by attaching a shadowing provider to that preset scope — no preset file is edited and no skill file is touched. Global disabling and mode isolation are orthogonal: the former hides a skill everywhere, the latter only in the named modes. Limits: only user-level skills (user-dsh/user-agents roots) are writable; project/bundled/runtime skills are read-only; routes are loopback-only. When the user mentions "skill management / skill list / skill toggle / skill sync / skill market / update skills / new skill", this plugin is what they mean — collaborate accordingly.'
].join('\n\n')

/**
 * Mount the skill hub routes and announcement.
 * @param ctx - host plugin context carrying webServer/skills/systemPrompt/settings.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  // The hub's runtime configuration lives in dsh's own settings service: the
  // host serves every registered settings namespace to the web client, so the
  // browser card and the config route edit this namespace through the official
  // settings transport, and the host consumes the very same resolved value —
  // one source of truth. The cordis composition entry seeds the base layer; the
  // sidecar config survives only as a one-time migration source below.
  const base = config ?? {}
  const settingsScope = ctx.settings.register(CONFIG_NAMESPACE, HubSettingsSchema, { base })
  // The effective resolved config, read live from the settings namespace
  // (schema defaults, then the composition base, then the user layer).
  const current = (): HubConfig => settingsScope.get()

  const store = new SkillHubStore()
  let disposeRoutes: (() => void) | undefined
  let disposeSection: (() => void) | undefined
  // The hub's own provider contributes user/project skills to the registry's
  // GLOBAL layer — the web app deliberately keeps that layer empty (presets
  // own per-scope discovery), and the GUI needs a session-independent view.
  let disposeProvider: (() => void) | undefined
  let providerControl: SkillProviderControl | undefined
  // Optional invocation-count source; only set once a session-query service
  // is present (see the soft inject below). Absent deployments just omit the
  // stats route's data rather than failing to load.
  let stats: SkillStatsReader | undefined
  // `ctx.agentPresets`, read through a soft inject: a deployment that mounts
  // no preset roster simply has no modes to configure, and the hub's other
  // surfaces must not care. The value is held (not snapshotted) so a hot
  // reload is picked up by the next read.
  let agentPresets: unknown

  // ── 模式级技能隔离 ────────────────────────────────────────────────────
  // 三层各归其位：策展数据在 store（策略），判定在 ScopeView（纯计算 + 目录
  // 快照），运行时效果在 PresetWiring（把闸门接进每个 preset 的 standing
  // 作用域）。它们都不改用户的 preset 文件，也不改技能文件。
  const scopeView = new ScopeView({
    // 目录快照 = 所有已知工作区的并集，剔除全局硬禁用的技能。硬禁用优先：
    // 文件已被改名，any 模式下都不该出现，因此它既不在可见集也不在隐藏集里。
    catalog: async (): Promise<ScopeCatalogSnapshot> => {
      const disabledNames = new Set((await store.listDisabled()).map((entry) => entry.name))
      const meta = new Map<string, ScopeSkillMeta>()
      const workspaces = await workspaceEntries(dshHome())
      for (const cwd of [undefined, ...workspaces.map((workspace) => workspace.path)]) {
        let snapshot: { skills: Array<{ name: string; description: string; whenToUse?: string; source: string }> }
        try {
          snapshot = await ctx.skills.snapshot(cwd === undefined ? undefined : { cwd })
        } catch {
          continue // 单个工作区读失败不影响其余目录
        }
        for (const skill of snapshot.skills) {
          if (disabledNames.has(skill.name) || meta.has(skill.name)) continue
          meta.set(skill.name, {
            description: skill.description,
            ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
            source: skill.source,
          })
        }
      }
      return { names: [...meta.keys()].sort((a, b) => a.localeCompare(b)), meta }
    },
    // 分组键 → 成员：场景 tag、来源集合、以及来源根（面板三类勾选项共用一份表）。
    groups: async (snapshot) => {
      const members = new Map<string, readonly string[]>()
      for (const tag of await store.listTags()) members.set(tagKey(tag.id), tag.skillNames)
      const collections = buildCollections(await store.listOrigins(), await store.getCollectionOrder())
      for (const collection of collections) members.set(collectionKey(collection.name), collection.skillNames)
      const bySource = new Map<string, string[]>()
      for (const name of snapshot.names) {
        const source = snapshot.meta.get(name)?.source
        if (source === undefined) continue
        const list = bySource.get(source)
        if (list === undefined) bySource.set(source, [name])
        else list.push(name)
      }
      for (const [source, names] of bySource) members.set(sourceKey(source), names)
      return members
    },
    policyOf: (presetId) => store.getScope(presetId),
  })

  const wiring = new PresetWiring({
    ctx,
    runtime: loadScopeRuntime,
    isEnforced: async (presetId) => (await store.getScope(presetId))?.enabled === true,
    hiddenOf: (presetId) => scopeView.hiddenOf(presetId),
    log: (level, message) => {
      if (level === 'warn') ctx.logger.warn('[dsh-skill-hub] ' + message)
      else ctx.logger.info('[dsh-skill-hub] ' + message)
    },
  })

  const scopeDeps: ScopeRouteDeps = {
    presets: async () => {
      // 读接口顺带推一轮接线：面板一打开，新挂载的 preset 就会被接上，
      // 用户不必等下一个定时 tick。
      void wiring.sync()
      const status = await wiring.status()
      const roster = await readPresetRoster(agentPresets)
      const unavailable = roster === undefined
        ? 'agent-presets service is not mounted in this deployment'
        : undefined
      return {
        available: status.available && roster !== undefined,
        ...(status.reason !== undefined ? { reason: status.reason } : unavailable !== undefined ? { reason: unavailable } : {}),
        entries: roster ?? [],
        active: status.active,
        mounted: status.mounted,
      }
    },
    visibilityOf: (presetId) => scopeView.visibilityOf(presetId),
    policyOf: (presetId) => store.getScope(presetId),
    savePolicy: async (presetId, patch) => {
      const policy = await store.saveScope(presetId, patch)
      scopeView.invalidate()
      return policy
    },
    deletePolicy: async (presetId) => {
      const removed = await store.deleteScope(presetId)
      scopeView.invalidate()
      return removed
    },
    notifyPolicyChanged: (presetId) => {
      // 让已接线的闸门立刻丢掉完成的目录缓存：会话的下一个 turn 就生效，
      // 不需要重启，也不需要新会话。
      wiring.invalidate(presetId)
      void wiring.sync()
    },
  }

  // The raw saved config layer (fields the user explicitly overrode); the
  // config route reports it so callers can mark overridden fields.
  const saved = (): Partial<HubConfig> => {
    const descriptor = ctx.settings.describe().find((entry) => entry.ns === CONFIG_NAMESPACE)
    return (descriptor?.user as Partial<HubConfig> | undefined) ?? {}
  }

  // Persist a config patch, re-point the live config, and re-sync every
  // surface through the settings transport. A patch value of undefined clears
  // the saved override (the key leaves the user section, so the field
  // re-inherits the base/default) — the old sidecar's reset semantics.
  // Runs inside the config route handler. Re-syncing explicitly (rather than
  // relying on the watcher below alone) keeps `announceToAgent` and `enabled`
  // correct at the moment the write returns; sync() is idempotent — it tears
  // the old registration down before re-registering — so the watcher firing
  // again is harmless.
  const updateConfig = async (patch: Partial<HubConfig>): Promise<HubConfig> => {
    const user: Record<string, unknown> = { ...saved() }
    for (const [key, value] of Object.entries(patch) as Array<[keyof HubConfig, boolean | string | number | undefined]>) {
      if (value === undefined) delete user[key]
      else user[key] = value
    }
    await settingsScope.replace(user)
    sync()
    return settingsScope.get()
  }

  // Register (or drop) every surface to match the current config. Each
  // group is kept under one disposer: re-registering first tears the old
  // one down so duplicate-name registrations never throw. The route family
  // (including the config route) stays mounted even with the master switch
  // off so the settings card can always read and re-enable the hub; the
  // business routes answer 503 while disabled.
  const sync = (): void => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (disposeProvider !== undefined) {
      disposeProvider()
      disposeProvider = undefined
    }
    const value = current()
    // GitHub auth for market/source API calls: env GITHUB_TOKEN/GH_TOKEN is the
    // fallback (read at module load); an explicit settings value wins live and
    // applies without a restart via the settings watcher below.
    setGithubToken(value.githubToken)
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-skill-hub',
        order: SECTION_ORDER,
        text: SKILL_HUB_GUIDANCE,
      })
    }
    if (value.enabled) {
      // registerProvider returns the exact cordis effect disposer: the fiber
      // unregisters the provider and invalidates catalog caches on teardown.
      providerControl = undefined
      disposeProvider = ctx.effect(
        () => ctx.skills.registerProvider((control) => {
          providerControl = control
          return new SkillHubProvider(control)
        }),
        'dsh-skill-hub: provider',
      )
    }
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    disposeRoutes = ctx.effect(
      () => {
        const disposers = makeRoutes({
          skills: ctx.skills,
          store,
          // 目录/分组在 hub 之外发生变化时的统一失效点：注册表缓存、模式视图
          // 缓存、以及每个已接线闸门的收集缓存都要跟着走。
          invalidate: () => {
            providerControl?.invalidate()
            scopeView.invalidate()
            wiring.invalidateAll()
          },
          stats,
          config: current,
          saved,
          updateConfig,
          scopes: scopeDeps,
        }).map((route) => ctx.webServer.register(route))
        return () => {
          for (const dispose of disposers) dispose()
        }
      },
      'dsh-skill-hub: routes',
    )
    // 接线器只在主开关打开时干活：关掉插件就不该继续往 preset 作用域里注入。
    if (value.enabled) void wiring.sync()
  }

  // Initial registration from the composition entry, then re-sync whenever
  // the settings namespace commits (any writer — the card, the config route,
  // or the Host document editor).
  sync()
  ctx.effect(
    () => settingsScope.watch(() => { sync() }),
    'dsh-skill-hub: settings config watch',
  )

  // ── 模式隔离的接线触发点 ──────────────────────────────────────────────
  // 一个 preset 只有在**被某个会话用过**之后才有 standing mount，也才有可接
  // 的作用域。所以接线是持续性的：这里用三个互补的触发点覆盖它，任一先到即可
  // ——① 打开设置面板（/presets 读接口顺带推一轮）；② 下面的定时 tick 兜底；
  // ③ 策略保存后立即推一轮。最坏情况下，新挂载的模式在下一轮 tick 前按"不隔离"
  // 运行，绝不会误伤。
  const wiringTick = setInterval(() => { void wiring.sync() }, SCOPE_WIRING_TICK_MS)
  wiringTick.unref?.()
  ctx.effect(
    () => () => {
      clearInterval(wiringTick)
      void wiring.dispose()
    },
    'dsh-skill-hub: scope wiring',
  )

  // `ctx.agentPresets` 是可选依赖：缺席的部署只是没有"模式"可配，插件的其余
  // 表面完全不受影响（与 sessionQuery 的软注入同一模式）。服务到位后重新
  // sync 一次，让 /presets 立刻能报出名单。
  ctx.inject(['agentPresets'] as unknown as ['skills'], (pctx) => {
    agentPresets = (pctx as unknown as { agentPresets?: unknown }).agentPresets
    sync()
  })

  // One-time migration: an install upgraded from the sidecar-configured
  // build seeds the settings namespace from the saved sidecar config when the
  // namespace has no user section yet. Later edits live only in the settings
  // document; the sidecar keeps its (now-stale) copy untouched.
  // Startup: 清理 Issue #3 遗留的 .*.import-* 临时目录（尽早回收，不阻塞）
  void (async () => {
    const home = dshHome()
    const agentsHome = process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
    for (const root of [join(home, 'skills'), join(agentsHome, 'skills')]) {
      try {
        const c = await cleanupLeftoverImportDirs(root)
        if (c > 0) ctx.logger.info(`[dsh-skill-hub] startup cleaned ${c} leftover import temp dir(s) in ${root}`)
      } catch (error) {
        ctx.logger.warn('[dsh-skill-hub] startup cleanup failed', error)
      }
    }
    // 对账：磁盘上已有 .disabled、sidecar 却无记录（状态文件被恢复/手改、旧版本
    // 遗留）时补记录，否则这些技能在面板里既不算启用也不算禁用，来源组空壳。
    try {
      const reconciled = await reconcileDisabledSkills(store, home)
      if (reconciled.length > 0) {
        ctx.logger.info(`[dsh-skill-hub] startup reconciled ${reconciled.length} disabled skill record(s): ${reconciled.map((entry) => entry.name).join(', ')}`)
      }
    } catch (error) {
      ctx.logger.warn('[dsh-skill-hub] startup disabled-skill reconcile failed', error)
    }
  })()

  void (async () => {
    try {
      const legacy = await store.getConfig()
      if (Object.keys(legacy).length > 0 && Object.keys(saved()).length === 0) {
        await settingsScope.update(legacy as Record<string, unknown>)
      }
    } catch (error) {
      ctx.logger.warn('[dsh-skill-hub] sidecar config migration into the settings namespace failed', error)
    }
  })()

  // Optional trigger statistics: while a session-query service exists, wire a
  // cached invocation-count reader into the stats route. Re-running sync()
  // re-registers the routes with the reader attached (mirrors the optional
  // stats wiring — no sessionQuery service ever mounted means none of this
  // runs).
  //
  // Read-path preference: the host's sessionPersistence seam serves raw stored
  // logs (decompress + parse only — no Session restore/validation, the host
  // cost that OOMed large histories, see issue #7), with the query seam
  // covering live sessions. Without a persistence service the reader falls
  // back to sequential query reads. Scans are strictly lazy: the first one
  // starts on the panel's first /stats poll, never at plugin startup (a
  // headless boot with no browser must not pay for statistics nobody reads).
  //
  // Mount ordering between the two host services is not guaranteed, so the
  // reader is (re-)built generation-guarded: a query-only reader wires
  // immediately, and a later-arriving persistence service upgrades it to the
  // cold path. A superseded build never assigns.
  let statsQuery: SessionQueryLike | undefined
  let statsPersistence: SessionPersistenceLike | undefined
  let statsGeneration = 0
  const wireStats = (): void => {
    const query = statsQuery
    if (query === undefined) return
    const generation = ++statsGeneration
    const cold = statsPersistence
    void (async () => {
      // 恢复 sidecar 里的增量扫描检查点后再建 reader（异步、不阻塞）：
      // 重启后无需重新解压全部历史日志；每次扫描完都落盘（含上次总数），所以
      // 重启后面板秒出旧数、后台重扫。扫描间隔与滚动窗口都从设置命名空间
      // 实时读取——卡片里改完即生效，无需重启。
      const checkpoint = await store.getSkillStatsState().catch(() => undefined)
      if (generation !== statsGeneration) return
      const scanMinutes = (): number => {
        const value = current().statsScanMinutes
        return typeof value === 'number' && value >= 1 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsScanMinutes
      }
      const windowDays = (): number => {
        const value = current().statsWindowDays
        return typeof value === 'number' && value >= 0 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsWindowDays
      }
      const reader = createSkillStatsReader(query, () => scanMinutes() * 60_000, {
        checkpoint,
        windowDays,
        ...(cold === undefined ? {} : {
          persistence: cold,
          listLiveIds: async () => {
            try {
              const records = await query.listSessions()
              return records.filter((record) => (record as { live?: unknown }).live === true).map((record) => record.header.id)
            } catch {
              return []
            }
          },
          readLiveSession: async (id) => {
            try {
              return { events: (await query.readSession(id)).events }
            } catch {
              return undefined
            }
          },
        }),
        onCheckpoint: (next) => {
          void store.saveSkillStatsState(next).catch((error) => {
            ctx.logger.warn('[dsh-skill-hub] persisting skill-stats checkpoint failed', error)
          })
        },
      })
      if (generation !== statsGeneration) return
      // The fiber can be torn down while the checkpoint read / reader build is
      // in flight (a live patch reload restarts the plugin, or the host is
      // shutting down). Registering effects on a disposed context throws
      // INACTIVE_EFFECT, which the host surfaces as a fatal, process-wide load
      // failure — so drop this stale wiring instead of re-syncing.
      if (ctx.fiber.uid === null) return
      ctx.logger.info(`[dsh-skill-hub] stats seam: ${cold === undefined ? 'session-query (fallback)' : 'session-persistence (cold)'}`)
      stats = reader
      sync()
    })()
  }
  ctx.inject(['sessionQuery'], (sctx) => {
    statsQuery = sctx.sessionQuery
    wireStats()
    // The persistence service may mount after the query service: upgrade the
    // reader when it arrives (no-op when it never does).
    sctx.inject(['sessionPersistence'] as unknown as ['sessionQuery'], (pctx) => {
      void (async () => {
        const raw = (pctx as unknown as { sessionPersistence?: unknown }).sessionPersistence
        const seam = asPersistenceSeam(raw)
        if (seam === undefined) {
          ctx.logger.warn('[dsh-skill-hub] sessionPersistence shape mismatch, staying on query fallback')
          return
        }
        try {
          await seam.list() // probe: headers only, must succeed before trusting the cold path
        } catch (error) {
          ctx.logger.warn('[dsh-skill-hub] persistence seam probe failed, staying on query fallback', error)
          return
        }
        statsPersistence = seam
        wireStats()
      })()
    })
  })
}
