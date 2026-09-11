/**
 * 执行层 · preset 名单：把 `ctx.agentPresets` 的服务读数投影成面板需要的行。
 *
 * 这一层刻意只做**只读投影**：它不 mount、不写文件、不推断。preset 的权威
 * 定义在 `dsh-agent-presets`，hub 只是把"有哪些模式、哪个是默认、是不是部署
 * 自带的"读出来，让设置界面能对着它们配置可见性。
 *
 * `broken` 的 preset 仍然列出（隐藏它会让用户看不见一个占着 id 的坏目录），
 * 但面板会标出来。
 */

/** `ctx.agentPresets` 的结构视图（只取投影需要的字段，便于测试替身）。 */
export interface AgentPresetsLike {
  /** 全部 preset。 */
  list: () => Promise<readonly AgentPresetLike[]>
  /** 未指定时默认使用的 preset id。 */
  defaultId?: string
}

/** 一个 preset 的读数。 */
export interface AgentPresetLike {
  id: string
  trust: 'system' | 'user'
  name?: string
  description?: string
  /** 非空表示该 preset 无法 compose 会话，值是原因。 */
  broken?: string
}

/** 名单里的一行。 */
export interface PresetRosterEntry {
  /** preset id（= preset 目录名）。 */
  id: string
  /** preset 自报显示名；缺省回退为 id（由面板决定，这里保持缺省）。 */
  name?: string
  /** preset 自报的一句话说明。 */
  description?: string
  /** `system` = 部署随包提供；`user` = 用户本地编写。 */
  trust: 'system' | 'user'
  /** 会话不指定 preset 时是否用它。 */
  isDefault: boolean
  /** 该 preset 无法 compose 会话时的原因；可用于时缺省。 */
  broken?: string
}

/**
 * 读取 preset 名单。
 * @param service - `ctx.agentPresets`（形状不符时返回 undefined，调用方据此降级）。
 * @returns 名单，或服务不可用时的 undefined。
 */
export async function readPresetRoster(service: unknown): Promise<PresetRosterEntry[] | undefined> {
  const candidate = service as Partial<AgentPresetsLike> | undefined
  if (candidate === undefined || candidate === null || typeof candidate.list !== 'function') return undefined
  let presets: readonly AgentPresetLike[]
  try {
    presets = await candidate.list()
  } catch {
    return undefined
  }
  if (!Array.isArray(presets)) return undefined
  const defaultId = typeof candidate.defaultId === 'string' ? candidate.defaultId : undefined
  const entries: PresetRosterEntry[] = []
  const seen = new Set<string>()
  for (const preset of presets) {
    if (preset === null || typeof preset !== 'object') continue
    const id = typeof preset.id === 'string' ? preset.id : ''
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    entries.push({
      id,
      ...(typeof preset.name === 'string' && preset.name !== '' ? { name: preset.name } : {}),
      ...(typeof preset.description === 'string' && preset.description !== '' ? { description: preset.description } : {}),
      trust: preset.trust === 'system' ? 'system' : 'user',
      isDefault: id === defaultId,
      ...(typeof preset.broken === 'string' && preset.broken !== '' ? { broken: preset.broken } : {}),
    })
  }
  return entries
}
