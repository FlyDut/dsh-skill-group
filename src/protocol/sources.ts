import type { CollectionGroup } from './groups.ts'
import type { RepoRoot } from './repo.ts'

/** 来源跟踪记录：一组来自同一上游仓库根目录的技能。 */
export interface SourceRecord {
  /** GitHub owner/repo。 */
  repo: string
  /** 显式分支/tag；缺省表示默认分支。 */
  ref?: string
  /** 技能在仓库中的根目录。 */
  root: RepoRoot
  /** 上次导入/同步时的上游 commit SHA；空 = 尚未核对过。 */
  commitSha: string
  /** 该来源下的技能名（来源组 = 这些技能）。 */
  skills: string[]
  /** 仓库内路径 → 文件大小 的基线清单（差异检测用；缺失 = 无基线）。 */
  manifest?: Record<string, number>
}

/** GET /api/skill-hub/sources */
export interface SourcesResponse {
  ok: true
  /** 全部来源记录（按 repo 排序）。 */
  sources: SourceRecord[]
  /** skillName → 集合名（由 sources 派生）。 */
  origins: Record<string, string>
  /** 来源集合组（按 origin 聚合）。 */
  collections: CollectionGroup[]
}

/** POST /api/skill-hub/sources/check — 检查指定（或全部）来源的上游更新。 */
export interface SourceCheckRequest {
  /** 仅检查该 repo；缺省检查全部。 */
  repo?: string
}

/** 单个来源的检查结果。 */
export interface SourceCheckResult {
  repo: string
  ref?: string
  /** 检查失败时的原因（如仓库不可达/限流）。 */
  error?: string
  /** 上游 commit 是否变化。 */
  changed: boolean
  /** 上游最新 commit SHA（检查成功时）。 */
  commitSha?: string
  /** 上游有更新的技能名（changed 时经 tree 差异得出）。 */
  updated: string[]
  /** 上游已删除的技能名（changed 时经 tree 差异得出）。 */
  deleted: string[]
  /** 节流跳过（距上次检查不足 5 分钟，未访问网络）。 */
  throttled?: boolean
  /** 该来源此前没有快照（迁移/旧记录），本次已回填 commit，尚未有差异基线。 */
  unverified?: boolean
}

/** POST /api/skill-hub/sources/check */
export interface SourceCheckResponse {
  ok: true
  results: SourceCheckResult[]
}

/** POST /api/skill-hub/sources/sync — 按上游重新下载所选技能并更新快照。 */
export interface SourceSyncRequest {
  repo: string
  /** 要同步的技能名；缺省同步该来源全部技能。 */
  skills?: string[]
}

/** POST /api/skill-hub/sources/sync */
export interface SourceSyncResponse {
  ok: true
  repo: string
  /** 同步后的上游 commit SHA。 */
  commitSha: string
  /** 成功同步的技能。 */
  synced: string[]
  /** 失败的技能。 */
  failed: Array<{ name: string; error: string }>
}
