/**
 * skill-hub — host half，也是整个插件的组装点。
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
 * 把中英公告交给 systemPrompt。它自己不实现任何业务规则，具体装配分别放在
 * 同目录的 config.ts（配置面）、scope-assembly.ts（模式隔离）、stats-wiring.ts
 * （调用统计）与 startup.ts（启动期对账）。
 *
 * 浏览器半边（./client）渲染设置页里的面板与侧栏入口。全部能力都走官方 NPM
 * SDK 包，不改 dsh 源码，也不写用户的 preset 文件。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import type { SettingsForms, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-settings'
import { resolveHubConfig, type HubConfig } from './protocol.ts'
import { CONFIG_FIELDS, ENTRY_ID, SECTION_ORDER, SKILL_HUB_GUIDANCE, type Config } from './config.ts'
import { assembleScopes, SCOPE_WIRING_TICK_MS } from './scope-assembly.ts'
import { wireInvocationStats } from './stats-wiring.ts'
import { runStartupTasks } from './startup.ts'
import { SkillHubProvider } from './provider.ts'
import { makeRoutes } from './routes.ts'
import type { SkillStatsReader } from './stats.ts'
import { SkillHubStore } from './store.ts'
import { setGithubToken } from './repo.ts'

// 宿主契约：cordis Loader 直接从入口模块读这些导出名。
export { Config, ENTRY_ID, SKILL_HUB_GUIDANCE } from './config.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'skill-hub'

/**
 * Services required before the skill-hub surfaces can mount. `settings` 刻意
 * **不在这里**：0.1.7 的配置读数走插件自己的 volatile 引用，只有真要读写设置
 * 服务时才软取（`ctx.get('settings')`）——部署没有该服务时插件照常运行。
 */
export const inject = ['webServer', 'skills', 'systemPrompt']

/**
 * Mount the skill hub routes and announcement.
 * @param ctx - host plugin context carrying webServer/skills/systemPrompt.
 * @param config - the Loader entry's volatile config refs (dsh 0.1.7 settings model).
 */
export function apply(ctx: Context, config?: Config): void {
  /**
   * 从插件自己的 volatile 配置引用读运行时配置。
   *
   * 这正是 `volatile()` 的意义：Loader 就地更新这些值
   * （`ConfigEditor.edit` → `resolveConfig(fiber.runtime, next)` → `updateVolatile`），
   * 不重建 fiber，所以长期持有的引用 `.get()` 永远答最新值。由此：
   *   - 每个请求不再走 `settings.describe()`（那要遍历 profile 的每个入口）；
   *   - 读值不需要订阅或 watcher；
   *   - Settings 服务缺席时插件照常工作（issue #11：业务逻辑不依赖 Settings）。
   */
  const readConfig = (): Partial<HubConfig> => {
    const out: Record<string, unknown> = {}
    for (const field of CONFIG_FIELDS) {
      const ref = (config as unknown as Record<string, { get?: () => unknown } | undefined> | undefined)?.[field]
      const value = ref !== undefined && typeof ref.get === 'function' ? ref.get() : ref
      if (value !== undefined) out[field] = value
    }
    return out as Partial<HubConfig>
  }
  // 生效配置：schema 默认值 → 组合 base → 用户层（Loader 已把它们解析进 volatile 引用）。
  const current = (): HubConfig => resolveHubConfig({}, readConfig())

  /** Settings 服务（部署挂了才有）；缺席 ⇒ 没有用户层可读可写，插件照常运行。 */
  const settingsOf = (): SettingsForms | undefined => ctx.get('settings') as SettingsForms | undefined

  const store = new SkillHubStore()
  let disposeRoutes: (() => void) | undefined
  let disposeSection: (() => void) | undefined
  // The hub's own provider contributes user/project skills to the registry's
  // GLOBAL layer — the web app deliberately keeps that layer empty (presets
  // own per-scope discovery), and the GUI needs a session-independent view.
  let disposeProvider: (() => void) | undefined
  let providerControl: SkillProviderControl | undefined
  // Optional invocation-count source; only set once a session-query service
  // is present (see stats-wiring.ts). Absent deployments just omit the
  // stats route's data rather than failing to load.
  let stats: SkillStatsReader | undefined
  // `ctx.agentPresets`, read through a soft inject: a deployment that mounts
  // no preset roster simply has no modes to configure, and the hub's other
  // surfaces must not care. The value is held (not snapshotted) so a hot
  // reload is picked up by the next read.
  let agentPresets: unknown

  // 模式级技能隔离的装配（策略 / 判定 / 运行时效果三层）见 scope-assembly.ts。
  const scopes = assembleScopes({ ctx, store, presets: () => agentPresets })

  // The raw saved config layer (fields the user explicitly overrode); the
  // config route reports it so callers can mark overridden fields. Empty when
  // the deployment mounts no Settings service — the plugin still runs.
  const saved = (): Partial<HubConfig> => {
    const descriptor = settingsOf()?.describe().find((entry) => entry.ns === ENTRY_ID)
    return (descriptor?.user as Partial<HubConfig> | undefined) ?? {}
  }

  // 把一次配置补丁写进 settings 传输。补丁值为 undefined 表示清除该处的用户层
  // 覆盖 —— 表达成路径 `unset`，字段回落到继承值而不是写进一个字面 undefined
  // （旧 sidecar 的 reset 语义）。写入会把本 Loader 入口的值就地换掉，但**不会**
  // 重跑 apply()，所以这里写完显式 sync()，让路由/公告/provider 立刻跟上；
  // sync() 幂等（先拆后注册），重复调用无害。
  const updateConfig = async (patch: Partial<HubConfig>): Promise<HubConfig> => {
    const ops: SettingsPathOp[] = []
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) ops.push({ op: 'unset', path: [field] })
      else ops.push({ op: 'set', path: [field], value })
    }
    const settings = settingsOf()
    if (settings === undefined) throw new Error('this deployment does not mount the settings service; config is read-only')
    if (ops.length > 0) {
      await settings.mutate(ENTRY_ID, ops)
      sync()
    }
    return current()
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
        name: 'plugin:skill-hub',
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
        'skill-hub: provider',
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
            scopes.view.invalidate()
            scopes.wiring.invalidateAll()
          },
          stats,
          config: current,
          saved,
          updateConfig,
          scopes: scopes.deps,
        }).map((route) => ctx.webServer.register(route))
        return () => {
          for (const dispose of disposers) dispose()
        }
      },
      'skill-hub: routes',
    )
    // 接线器只在主开关打开时干活：关掉插件就不该继续往 preset 作用域里注入。
    if (value.enabled) void scopes.wiring.sync()
  }

  // 组合层装配时先注册一次。之后不再自建 watcher：0.1.7 下写配置的
  // `settings.mutate` 由 updateConfig 自己补一轮 sync()，而 Loader 侧的
  // 配置编辑会重载本入口、重新进入 apply()，进程内没有需要自己监听的东西。
  sync()

  // ── 模式隔离的接线触发点 ──────────────────────────────────────────────
  // 一个 preset 只有在**被某个会话用过**之后才有 standing mount，也才有可接
  // 的作用域。所以接线是持续性的：这里用三个互补的触发点覆盖它，任一先到即可
  // ——① 打开设置面板（/presets 读接口顺带推一轮）；② 下面的定时 tick 兜底；
  // ③ 策略保存后立即推一轮。最坏情况下，新挂载的模式在下一轮 tick 前按"不隔离"
  // 运行，绝不会误伤。
  const wiringTick = setInterval(() => { void scopes.wiring.sync() }, SCOPE_WIRING_TICK_MS)
  wiringTick.unref?.()
  ctx.effect(
    () => () => {
      clearInterval(wiringTick)
      void scopes.wiring.dispose()
    },
    'skill-hub: scope wiring',
  )

  // `ctx.agentPresets` 是可选依赖：缺席的部署只是没有"模式"可配，插件的其余
  // 表面完全不受影响（与 sessionQuery 的软注入同一模式）。服务到位后重新
  // sync 一次，让 /presets 立刻能报出名单。
  ctx.inject(['agentPresets'] as unknown as ['skills'], (pctx) => {
    agentPresets = (pctx as unknown as { agentPresets?: unknown }).agentPresets
    sync()
  })

  // 启动期清理、禁用对账与旧 sidecar 配置迁移（全部异步、不阻塞装载）。
  runStartupTasks({ ctx, store, settingsOf, saved })

  // 可选的调用次数统计：宿主挂上 sessionQuery 后把 reader 接进 /stats 路由。
  wireInvocationStats({
    ctx,
    store,
    current,
    install: (reader) => {
      stats = reader
      sync()
    },
  })
}
