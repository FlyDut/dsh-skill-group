import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DisabledSkill, HubConfig, MarketSourceRecord, MarketStatsSnapshot, ScopePolicy, SkillStatsCheckpoint, SkillTag, SourceRecord, TrashEntry } from '../protocol.ts'

/** 默认场景名（系统预置的兜底场景，新技能自动归入）。 */
export const DEFAULT_SCENE_NAME = '通用'

/** Wire shape persisted on disk. */
export interface StoreFile {
  version: number
  disabled: DisabledSkill[]
  /** Runtime configuration edited from the web settings card (hub-owned, not settings-service). */
  config?: Partial<HubConfig>
  /** User-defined tag groups (pure organization; skill files untouched). */
  tags?: SkillTag[]
  /** Upstream source tracking records (repo + commit snapshot). */
  sources?: SourceRecord[]
  /** User-added market sources (owner/repo slugs + optional pinned ref). */
  marketSources?: MarketSourceRecord[]
  /** Trashed skills (removed after upstream deletion, restorable). */
  trash?: TrashEntry[]
  /** Usage-statistics incremental-scan checkpoint (frozen watermark + totals). */
  skillStats?: SkillStatsCheckpoint
  /** Market-stats snapshot (stars/downloads per repo, hourly TTL). */
  marketStats?: MarketStatsSnapshot
  /** 顶层排序：来源分组 collection 名称顺序（编辑态 ↑↓ 按钮写入） */
  collectionOrder?: string[]
  /** 顶层排序：来源顶层分组整体顺序（project / col:xxx / uncategorized-source） */
  sourceGroupOrder?: string[]
  /**
   * 模式级技能可见性策略（v5）。每个 preset 一条；缺席的 preset 不做隔离。
   * 与 `disabled` 正交：那里是全局硬禁用（改文件名），这里只是某些模式看不到。
   */
  scopes?: ScopePolicy[]
}

/** Resolve the DSH home directory (the filesystem provider's user-dsh root base). */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Resolve the sidecar state path (injectable in tests). */
export function statePath(home = dshHome()): string {
  return join(home, 'dsh-skill-hub.json')
}

/** Current sidecar schema version. Bump on breaking shape changes and add a migration below. */
export const STORE_VERSION = 5
