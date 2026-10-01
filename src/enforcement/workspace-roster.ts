/**
 * 执行层 · 工作区名单：把 `ctx.workspaceRegistry` 的服务读数投影成面板需要的行。
 *
 * 与 {@link readPresetRoster} 同一口径：只做**只读投影**，不创建、不删除、不
 * 推断。工作区的权威定义在 `dsh-workspace`，hub 只把"有哪些工作区、各自的目录、
 * 标题与会话数"读出来，让设置界面能对着它们配置可见性。
 *
 * 服务本身没有静态依赖：`ctx.workspaceRegistry` 在缺包/形状不符时返回
 * undefined，调用方据此把「工作区」tab 降级为只读，插件其余功能毫无感知。
 */
import { realpath } from 'node:fs/promises'

/** `ctx.workspaceRegistry` 的结构视图（只取投影需要的字段，便于测试替身）。 */
interface WorkspaceRegistryLike {
  /** 全部工作区，按注册表顺序（真实实现是同步返回）。 */
  list: () => readonly WorkspaceLike[] | Promise<readonly WorkspaceLike[]>
}

/** 一个工作区的读数。 */
interface WorkspaceLike {
  id: string
  path: string
  title?: string
  /** 归属该工作区的会话 id 列表（只用于计数）。 */
  sessionIds?: readonly unknown[]
}

/** 名单里的一行。 */
export interface WorkspaceRosterEntry {
  /** 工作区 id（uuid）。 */
  id: string
  /** 工作区目录，创建时已 realpath 规范化；会话的 cwd 与之精确相等才算属于它。 */
  path: string
  /** 显示名；服务没给时由调用方回退到目录末段。 */
  title?: string
  /** 当前归入该工作区的会话数。 */
  sessionCount: number
}

/**
 * 读取工作区名单。
 * @param service - `ctx.workspaceRegistry`（形状不符时返回 undefined，调用方据此降级）。
 * @returns 名单，或服务不可用时的 undefined。
 */
export async function readWorkspaceRoster(service: unknown): Promise<WorkspaceRosterEntry[] | undefined> {
  const candidate = service as Partial<WorkspaceRegistryLike> | undefined
  if (candidate === undefined || candidate === null || typeof candidate.list !== 'function') return undefined
  let workspaces: readonly WorkspaceLike[]
  try {
    // await 对同步返回值是恒等操作：真实实现同步返回，替身返回 Promise 也能跑。
    workspaces = await candidate.list()
  } catch {
    return undefined
  }
  if (!Array.isArray(workspaces)) return undefined
  const entries: WorkspaceRosterEntry[] = []
  const seen = new Set<string>()
  for (const workspace of workspaces) {
    if (workspace === null || typeof workspace !== 'object') continue
    const id = typeof workspace.id === 'string' ? workspace.id : ''
    const path = typeof workspace.path === 'string' ? workspace.path : ''
    if (id === '' || path === '' || seen.has(id)) continue
    seen.add(id)
    const title = typeof workspace.title === 'string' && workspace.title !== '' ? workspace.title : undefined
    entries.push({
      id,
      path,
      ...(title !== undefined ? { title } : {}),
      sessionCount: Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : 0,
    })
  }
  return entries
}

/**
 * 会话工作目录 → 工作区 id。归属判定与 dsh 一致：**精确相等**（工作区的 `path`
 * 在建档时已 realpath 规范化），子目录不算属于该工作区。cwd 没直接命中时才做一次
 * 路径规范化兜底（会话 cwd 一般已是规范路径，这步只兜住软链与 `..` 之类）。
 *
 * @param entries - 工作区名单（来自 {@link readWorkspaceRoster}）。
 * @param cwd - 会话工作目录；缺省或空串按"没有工作区"处理。
 * @param normalize - 路径规范化实现，默认 `fs.realpath`；注入便于测试。
 * @returns 命中的工作区 id，或 undefined（没有工作区 / 目录已不存在）。
 */
export async function resolveWorkspaceId(
  entries: readonly WorkspaceRosterEntry[],
  cwd: string | undefined,
  normalize: (path: string) => Promise<string> = realpath,
): Promise<string | undefined> {
  if (cwd === undefined || cwd === '') return undefined
  const exact = entries.find((entry) => entry.path === cwd)
  if (exact !== undefined) return exact.id
  let normalized: string
  try {
    normalized = await normalize(cwd)
  } catch {
    return undefined // 目录已不存在：按"没有工作区"处理，不误伤
  }
  return entries.find((entry) => entry.path === normalized)?.id
}
