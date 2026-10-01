/**
 * 模式级技能隔离的装配：把策展数据（store）、纯计算判定（ScopeView）与运行时
 * 效果（PresetWiring）接到一起，并打包 `/scopes` 路由需要的依赖。
 *
 * 三层各归其位：策略在 store（②），判定在 ScopeView（纯计算 + 目录快照），运行时
 * 效果在 PresetWiring（把闸门接进每个 preset 的 standing 作用域）。它们都不改
 * 用户的 preset 文件，也不改技能文件。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { collectionKey, sourceKey, tagKey } from './protocol.ts'
import { ScopeView, type ScopeCatalogSnapshot, type ScopeSkillMeta } from './domain/scope-view.ts'
import { PresetWiring, loadScopeRuntime } from './enforcement/scope-wiring.ts'
import { readPresetRoster } from './enforcement/roster.ts'
import { buildCollections } from './routes/collection.ts'
import { workspaceEntries } from './routes/catalog-data.ts'
import type { ScopeRouteDeps } from './routes.ts'
import { dshHome } from './env.ts'
import type { SkillHubStore } from './store.ts'

/**
 * 模式隔离的接线轮询间隔。只做一件很便宜的事：枚举当前活着的 preset
 * standing mount 并补齐/清理闸门注入。首个注入之后它几乎总是无操作。
 */
export const SCOPE_WIRING_TICK_MS = 5000

/** 隔离装配的产物：判定视图、运行时接线器、路由依赖。 */
export interface ScopeAssembly {
  /** 纯计算的可见性判定 + 目录快照缓存。 */
  view: ScopeView
  /** 往每个 preset 的 standing 作用域注入/回收闸门。 */
  wiring: PresetWiring
  /** 交给 makeRoutes 的 /scopes 依赖。 */
  deps: ScopeRouteDeps
}

/**
 * @param options.ctx - 宿主上下文（读技能目录、写日志）。
 * @param options.store - 隔离策略的唯一来源。
 * @param options.presets - `ctx.agentPresets`（软注入），缺失的部署只是没有模式可配。
 */
export function assembleScopes(options: { ctx: Context; store: SkillHubStore; presets: () => unknown }): ScopeAssembly {
  const { ctx, store, presets } = options

  const view = new ScopeView({
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
    hiddenOf: (presetId) => view.hiddenOf(presetId),
    log: (level, message) => {
      if (level === 'warn') ctx.logger.warn('[skill-hub] ' + message)
      else ctx.logger.info('[skill-hub] ' + message)
    },
  })

  const deps: ScopeRouteDeps = {
    presets: async () => {
      // 读接口顺带推一轮接线：面板一打开，新挂载的 preset 就会被接上，
      // 用户不必等下一个定时 tick。
      void wiring.sync()
      const status = await wiring.status()
      const roster = await readPresetRoster(presets())
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
    visibilityOf: (presetId) => view.visibilityOf(presetId),
    policyOf: (presetId) => store.getScope(presetId),
    savePolicy: async (presetId, patch) => {
      const policy = await store.saveScope(presetId, patch)
      view.invalidate()
      return policy
    },
    deletePolicy: async (presetId) => {
      const removed = await store.deleteScope(presetId)
      view.invalidate()
      return removed
    },
    notifyPolicyChanged: (presetId) => {
      // 让已接线的闸门立刻丢掉完成的目录缓存：会话的下一个 turn 就生效，
      // 不需要重启，也不需要新会话。
      wiring.invalidate(presetId)
      void wiring.sync()
    },
  }

  return { view, wiring, deps }
}
