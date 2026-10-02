import { join } from 'node:path'
import { dshHome } from '../env.ts'
import type { DisabledSkill, HubConfig, MarketSourceRecord, MarketStatsSnapshot, ScopePolicy, SkillStatsCheckpoint, SkillTag, SourceRecord, WorkspacePolicy } from '../protocol.ts'

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
   * 与 `disabled` 正交：那里是全局运行时关闭（所有模式都看不到），这里只是某些模式看不到。
   */
  scopes?: ScopePolicy[]
  /**
   * 工作区级技能可见性策略（v7）。每个 DSH 工作区一条；启用后覆盖该工作区目录
   * 下会话的模式策略，才是一个会话真正可见的集合。
   */
  workspaces?: WorkspacePolicy[]
}

/** Resolve the sidecar state path (injectable in tests). */
export function statePath(home = dshHome()): string {
  return join(home, 'dsh-skill-group.json')
}

/** Current sidecar schema version. Bump on breaking shape changes and add a migration below. */
export const STORE_VERSION = 7
