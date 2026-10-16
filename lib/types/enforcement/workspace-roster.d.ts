/** 名单里的一行。 */
export interface WorkspaceRosterEntry {
    /** 工作区 id（uuid）。 */
    id: string;
    /** 工作区目录，创建时已 realpath 规范化；会话的 cwd 与之精确相等才算属于它。 */
    path: string;
    /** 显示名；服务没给时由调用方回退到目录末段。 */
    title?: string;
    /** 当前归入该工作区的会话数。 */
    sessionCount: number;
}
/**
 * 读取工作区名单。
 * @param service - `ctx.workspaceRegistry`（形状不符时返回 undefined，调用方据此降级）。
 * @returns 名单，或服务不可用时的 undefined。
 */
export declare function readWorkspaceRoster(service: unknown): Promise<WorkspaceRosterEntry[] | undefined>;
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
export declare function resolveWorkspaceId(entries: readonly WorkspaceRosterEntry[], cwd: string | undefined, normalize?: (path: string) => Promise<string>): Promise<string | undefined>;
