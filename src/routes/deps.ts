/**
 * routes 共享层 · 依赖视图：路由依赖接口、配置解析与可写技能解析（HTTP
 * 围栏在 ./http.ts）。从 helpers.ts 原样搬出，行为不变。
 */

import type { ServerResponse } from 'node:http'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import { resolveHubConfig, type HubConfig, type ScopePolicy, type WritableRoot } from '../protocol.ts'
import type { ScopeVisibility } from '../domain/scope-policy.ts'
import type { PresetRosterEntry } from '../enforcement/roster.ts'
import { dshHome } from '../env.ts'
import { type SkillHubStore } from '../store.ts'
import { writeError } from './http.ts'

/** Sources the hub may toggle (the user-level filesystem roots). */
export function isWritableSource(source: string): source is WritableRoot {
  return source === 'user-dsh' || source === 'user-agents'
}

/** Lookup options the hub forwards to the registry. */
export interface SkillLookupLike {
  signal?: AbortSignal
}

/** Route family dependencies (narrow structural view of ctx.skills for tests). */
export interface SkillHubRouteDeps {
  skills: {
    snapshot(options?: SkillLookupLike): Promise<{ skills: SkillSummary[]; complete: boolean }>
    get(name: string, options?: SkillLookupLike): Promise<SkillDefinition | undefined>
  }
  store: SkillHubStore
  /** DSH home override (tests isolate the writable roots; defaults to ~/.dsh). */
  home?: string
  /** Invalidate the registry catalog cache after hub-driven mutations. */
  invalidate?: () => void
  /** Optional invocation-count reader; absent means the stats route reports unavailable. */
  stats?: import('../stats.ts').SkillStatsReader
  /** Resolves the current plugin config; business routes honour the master switch. */
  config?: () => HubConfig
  /** Resolves the raw saved config layer (fields the user explicitly overrode). */
  saved?: () => Partial<HubConfig>
  /** Persist a config patch and re-sync plugin surfaces; resolves with the fresh config. */
  updateConfig?: (patch: Partial<HubConfig>) => Promise<HubConfig>
  /**
   * 模式级技能隔离的宿主接口。缺席时 /presets 与 /scope 返回"能力不可用"，
   * 其余路由完全不受影响（与 stats 的可选接线同一模式）。
   */
  scopes?: ScopeRouteDeps
}

/**
 * 模式隔离的路由接口：由宿主在 `index.ts` 组装（ScopeView + PresetWiring +
 * agentPresets 软注入），路由本身只做参数校验与 JSON 编解码。
 */
export interface ScopeRouteDeps {
  /** preset 名单 + 运行时接线状态。 */
  presets: () => Promise<ScopePresetSnapshot>
  /** 某模式此刻的可见性判定（含展开明细）。 */
  visibilityOf: (presetId: string) => Promise<ScopeVisibility>
  /** 某模式的策略；undefined 表示从未配置。 */
  policyOf: (presetId: string) => Promise<ScopePolicy | undefined>
  /** 保存策略（部分更新）。 */
  savePolicy: (presetId: string, patch: { enabled?: boolean; groups?: string[]; skills?: string[] }) => Promise<ScopePolicy>
  /** 删除策略，让该模式回到"不隔离"。 */
  deletePolicy: (presetId: string) => Promise<boolean>
  /** 策略落地后通知执行层刷新闸门缓存（下一个 turn 生效）。 */
  notifyPolicyChanged: (presetId: string) => void
}

/** 一次 /presets 读取所需的全部宿主数据。 */
export interface ScopePresetSnapshot {
  /** 模式隔离能力是否可用（agentPresets / dsh-scope 齐备）。 */
  available: boolean
  /** 不可用原因。 */
  reason?: string
  /** preset 名单；能力不可用或服务缺席时为空数组。 */
  entries: PresetRosterEntry[]
  /** 闸门已注入的 preset id。 */
  active: string[]
  /** 已挂载、可用于接线的 preset id。 */
  mounted: string[]
}

/** The resolved hub config a route sees (the shared resolver fills defaults). */
export function configOf(deps: SkillHubRouteDeps): HubConfig {
  return resolveHubConfig({}, deps.config?.() ?? {})
}

/** The raw saved config layer a route reports (empty when the owner omits it). */
export function savedOf(deps: SkillHubRouteDeps): Partial<HubConfig> {
  return deps.saved?.() ?? {}
}

/** Refuse business routes while the master switch is off (the config route stays up). */
export function disabledGate(deps: SkillHubRouteDeps, res: ServerResponse): boolean {
  if (configOf(deps).enabled) return false
  writeError(res, 503, 'plugin disabled: enable it from the settings card')
  return true
}

/** Resolve the home used for writable-root operations. */
export function homeOf(deps: SkillHubRouteDeps): string {
  return deps.home ?? dshHome()
}
