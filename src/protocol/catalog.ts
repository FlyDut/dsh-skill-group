/** User-level roots the hub may write to (matches dsh-skill-filesystem ranks 400/500). */
export type WritableRoot = 'user-dsh' | 'user-agents'

/** Invocation policy resolved by the registry, re-spelled for the wire. */
export interface HubInvocation {
  /** Whether model-facing catalogs may load this skill. */
  modelInvocable: boolean
  /** Whether human-facing command catalogs may load this skill. */
  userInvocable: boolean
}

/** One skill row in the catalog (whether or not the user switched it off). */
export interface CatalogSkill {
  name: string
  description: string
  whenToUse?: string
  invocation: HubInvocation
  provider: string
  /** Whether the hub may toggle this skill (user-level filesystem skills only). */
  writable: boolean
  /**
   * false = the user switched this skill off at runtime. The file on disk is
   * untouched; the per-preset gate simply hides the skill. Defaults to true.
   */
  enabled: boolean
  /** 技能来源标识（user-dsh/user-agents/...）。 */
  source: string
  /** SKILL.md creation time (epoch ms); used for "added" sorting. Absent when unknown. */
  addedAt?: number
  /** SKILL.md last-modified time (epoch ms); used for "updated" display. Absent when unknown. */
  updatedAt?: number
  /** UI metadata from agents/openai.yaml (mirrors codex SkillInterface). */
  displayName?: string
  shortDescription?: string
  brandColor?: string
  iconSmall?: string
  iconLarge?: string
  defaultPrompt?: string
}

/**
 * One skill the user switched off at runtime. Only the name is recorded: no
 * file is renamed or moved, so the row keeps its normal catalog metadata and
 * the per-preset gate hides it. Persisted in the sidecar's `disabled` list.
 */
export interface DisabledSkill {
  name: string
  disabledAt: number
}

/** One discovery diagnostic: a file the filesystem provider skips, with the reason. */
export interface DiagnosticEntry {
  path: string
  root: string
  reason: string
  /** Whether this diagnostic can be auto-fixed (e.g. unquoted colon). */
  fixable?: boolean
}

/** POST /api/skill-hub/diagnostic/fix — repair a fixable diagnostic in place. */
export interface DiagnosticFixRequest {
  path: string
}
export interface DiagnosticFixResponse {
  ok: true
  path: string
}

/** GET /api/skill-hub/catalog */
export interface CatalogResponse {
  ok: true
  /** 已安装插件自身的版本号（package.json version），面板标题旁显示。 */
  pluginVersion: string
  /** Whether discovery completed within a stable catalog revision. */
  complete: boolean
  /** Sorted winning summaries of every discovered skill, on/off alike. */
  skills: CatalogSkill[]
  /** Files in the writable roots the provider ignores, with reasons. */
  diagnostics: DiagnosticEntry[]
  /** Skill names that appeared in multiple roots (first wins, others hidden). Mirrors codex name_counts. */
  duplicateNames?: string[]
}

/** GET /api/skill-hub/skill */
export interface SkillDetail {
  name: string
  description: string
  whenToUse?: string
  invocation: HubInvocation
  provider: string
  /** Whether the user switched this skill off at runtime. */
  enabled: boolean
  /** Absolute file path when the skill came from disk. */
  path?: string
  /** SKILL.md creation time (epoch ms); absent when the file is unreadable. */
  addedAt?: number
  /** SKILL.md last-modified time (epoch ms); absent when the file is unreadable. */
  updatedAt?: number
  /** Markdown instruction body. */
  content: string
  displayName?: string
  shortDescription?: string
  brandColor?: string
  iconSmall?: string
  iconLarge?: string
  defaultPrompt?: string
}

export interface SkillDetailResponse {
  ok: true
  skill: SkillDetail
}

/** POST /api/skill-hub/toggle */
export interface ToggleRequest {
  /** Kebab-case skill name. */
  name: string
  /** true re-enables a switched-off skill; false switches an enabled one off. */
  enabled: boolean
}

export interface ToggleResponse {
  ok: true
  /** Fresh catalog after the mutation (the gate picks it up next turn). */
  catalog: CatalogResponse
}

/** POST /api/skill-hub/toggle-batch — one group of skills, one write. */
export interface ToggleBatchRequest {
  names: string[]
  enabled: boolean
}

/** POST /api/skill-hub/toggle-batch */
export interface ToggleBatchResponse {
  ok: true
  catalog: CatalogResponse
  /** Per-name failures (unknown/read-only skills); empty means all landed. */
  failures: Array<{ name: string; error: string }>
}

/** POST /api/skill-hub/create */
export interface CreateRequest {
  /** Kebab-case skill name (validated with the official isSkillName grammar). */
  name: string
  /** Optional one-line routing description for the frontmatter. */
  description?: string
  /**
   * Optional markdown body written after the frontmatter. Blank means the
   * scaffold placeholder paragraph; the frontmatter itself is always generated
   * from `name` / `description` so the file cannot end up unparseable.
   */
  content?: string
  /** Target user root; defaults to user-dsh (~/.dsh/skills). */
  root?: WritableRoot
}

export interface CreateResponse {
  ok: true
  path: string
  root: WritableRoot
}
