/**
 * 模式级技能隔离（Scope）的共享契约：模式策略的数据模型、分组键的构造与
 * 解析、以及 /presets 与 /scope 三个端点的载荷形状。
 *
 * 这一层**不依赖任何宿主 SDK**：宿主半边（`domain/`、`enforcement/`、
 * `routes/`）与浏览器半边（面板）都从这里 import 同一个词汇表，避免两侧对
 * "分组键长什么样"各写一份而漂移。
 */

/** 分组键前缀。一个键要么指向一个分组，要么指向单个技能名。 */
export const SCOPE_ENTRY_PREFIX = {
  /** 场景 tag：`tag:<tagId>`。 */
  tag: 'tag:',
  /** 来源集合（origin）：`col:<collectionName>`。 */
  col: 'col:',
  /** 来源根：`src:<source>`（user-dsh / project-dsh / …）。 */
  src: 'src:',
  /** 单个技能：`skill:<name>`。 */
  skill: 'skill:',
} as const

/** 场景 tag 的分组键。 */
export function tagKey(id: string): string {
  return SCOPE_ENTRY_PREFIX.tag + id
}

/** 来源集合（origin）的分组键。 */
export function collectionKey(name: string): string {
  return SCOPE_ENTRY_PREFIX.col + name
}

/** 来源根的分组键。 */
export function sourceKey(source: string): string {
  return SCOPE_ENTRY_PREFIX.src + source
}

/** 单个技能的分组键（等价于把名字放进 `skills[]`）。 */
export function skillKey(name: string): string {
  return SCOPE_ENTRY_PREFIX.skill + name
}

/**
 * 拆一个分组键。
 * @param key - 待解析的键。
 * @returns 前缀种类与剩余标识；无法识别时返回 undefined（该键被当成悬空项）。
 */
export function parseScopeEntry(key: string): { kind: keyof typeof SCOPE_ENTRY_PREFIX; value: string } | undefined {
  for (const kind of Object.keys(SCOPE_ENTRY_PREFIX) as Array<keyof typeof SCOPE_ENTRY_PREFIX>) {
    const prefix = SCOPE_ENTRY_PREFIX[kind]
    if (key.startsWith(prefix) && key.length > prefix.length) return { kind, value: key.slice(prefix.length) }
  }
  return undefined
}

/**
 * 一个模式的技能可见性策略。
 *
 * 语义是**白名单**：`enabled` 为真时，只有 `groups` ∪ `skills` 展开出的技能
 * 对该模式的 agent 可见（两者皆空 = 该模式一个技能都看不到，是合法的强隔离）；
 * `enabled` 为假（默认）时该模式不做任何隔离。**未出现在策略里的模式一律不
 * 限制**——这是向后兼容的默认，避免升级后突然吞掉已有会话的技能。
 */
export interface ScopePolicy {
  /** preset id（= preset 目录名，例如 `coding`）。 */
  presetId: string
  /** 是否真正执行隔离；关掉只保留面板预览。 */
  enabled: boolean
  /** 勾选的分组键（见 {@link SCOPE_ENTRY_PREFIX}）。 */
  groups: string[]
  /** 单独勾选的技能名（裸名，不是 `skill:` 键）。 */
  skills: string[]
}

/** 某模式的策略 + 运行时接线状态（面板一行）。 */
export interface PresetScopeRow {
  /** preset id。 */
  id: string
  /** preset 自报的显示名；缺省回退为 id。 */
  name?: string
  /** preset 自报的一句话说明。 */
  description?: string
  /** `system` = 部署随包提供；`user` = 用户本地编写。 */
  trust: 'system' | 'user'
  /** 会话不指定 preset 时是否用它。 */
  isDefault: boolean
  /** 该 preset 是否已有 standing mount（gate 接线的前提）。 */
  mounted: boolean
  /** gate 是否已注入到这个 preset 的作用域。 */
  gateActive: boolean
  /** 该模式当前的策略。 */
  policy: ScopePolicy
  /** 展开后可见的技能数。 */
  visibleCount: number
  /** 因此被隐藏的技能数。 */
  hiddenCount: number
}

/** GET /api/skill-hub/presets */
export interface PresetsResponse {
  ok: true
  /** enforcement 能力是否可用（缺 agent-presets / dsh-scope 时为 false）。 */
  available: boolean
  /** `available` 为 false 时的原因文案（面板原样显示）。 */
  unavailableReason?: string
  /** 全部 preset，按 roster 顺序。 */
  presets: PresetScopeRow[]
  /** 接线是否因未挂载而尚未生效的 preset 数（面板提示用）。 */
  pendingCount: number
}

/** POST /api/skill-hub/scope — 部分更新某个模式的策略。 */
export interface ScopeSaveRequest {
  presetId: string
  /** 省略则保持现值。 */
  enabled?: boolean
  /** 省略则保持现值；提供时整体替换。 */
  groups?: string[]
  /** 省略则保持现值；提供时整体替换。 */
  skills?: string[]
  /** 为真时删除该模式的策略（回到"不隔离"），其余字段忽略。 */
  reset?: boolean
}

/** POST /api/skill-hub/scope */
export interface ScopeSaveResponse {
  ok: true
  /** 保存后的策略；`reset` 时为 null（该模式已回到不隔离）。 */
  policy: ScopePolicy | null
}

/** GET /api/skill-hub/scope/preview?presetId= */
export interface ScopePreviewResponse {
  ok: true
  presetId: string
  enabled: boolean
  /** 展开后对该模式可见的技能名（升序）。 */
  visible: string[]
  /** 因白名单而被隐藏的技能名（升序）；`enabled` 为假时为空。 */
  hidden: string[]
  /** 指向已不存在分组的键（面板标注，不自动删除）。 */
  dangling: string[]
  /** 每个分组键 → 它当前展开出的技能名（面板解释"为什么可见"）。 */
  resolved: Record<string, string[]>
}

/** 策略条目的数量上限：防御性上限，避免异常输入撑爆 sidecar。 */
export const MAX_SCOPE_ENTRIES = 2000

/** 一个 preset id 的合法形状（与 dsh 的 PRESET_ID 同口径：一个路径段）。 */
export const PRESET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * 把任意输入清洗成一个策略。坏条目丢弃而不是整体拒绝——与 sidecar 其余
 * 字段的容错口径一致；`presetId` 非法时返回 undefined（调用方据此 400）。
 * @param raw - 未知形状的输入（sidecar 文档或 HTTP 体）。
 * @returns 清洗后的策略，或 presetId 不可用时的 undefined。
 */
export function normalizeScopePolicy(raw: unknown): ScopePolicy | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const presetId = typeof record.presetId === 'string' ? record.presetId.trim() : ''
  if (!PRESET_ID_RE.test(presetId)) return undefined
  const groups = cleanKeys(record.groups)
  const skills = cleanNames(record.skills)
  return { presetId, enabled: record.enabled === true, groups, skills }
}

/** 清洗分组键列表：仅保留可解析的键，去空去重，保序，受上限约束。 */
export function cleanKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') continue
    // 裸技能名也接受：面板的历史/手写输入可能直接给名字。
    const key = parseScopeEntry(entry) !== undefined ? entry : isSkillNameShape(entry) ? skillKey(entry) : undefined
    if (key === undefined || seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= MAX_SCOPE_ENTRIES) break
  }
  return out
}

/** 清洗技能名列表：去空去重，保序，受上限约束。 */
export function cleanNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '' || seen.has(entry)) continue
    seen.add(entry)
    out.push(entry)
    if (out.length >= MAX_SCOPE_ENTRIES) break
  }
  return out
}

/** 与 dsh 的 skill-name 语法同口径（kebab-case），只在清洗时做形状判断。 */
function isSkillNameShape(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}
