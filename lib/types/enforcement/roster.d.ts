/**
 * 执行层 · preset 名单：把 `ctx.agentPresets` 的服务读数投影成面板需要的行。
 *
 * 这一层刻意只做**只读投影**：它不 mount、不写文件、不推断。preset 的权威
 * 定义在 `dsh-agent-preset-registry`，hub 只是把"有哪些模式、哪个是默认、是不是部署
 * 自带的"读出来，让设置界面能对着它们配置可见性。
 *
 * `broken` 的 preset 仍然列出（隐藏它会让用户看不见一个占着 id 的坏目录），
 * 但面板会标出来。
 */
/** 名单里的一行。 */
export interface PresetRosterEntry {
    /** preset id（= preset 目录名）。 */
    id: string;
    /** preset 自报显示名；缺省回退为 id（由面板决定，这里保持缺省）。 */
    name?: string;
    /** preset 自报的一句话说明。 */
    description?: string;
    /** `system` = 部署随包提供；`user` = 用户本地编写。 */
    trust: 'system' | 'user';
    /** 会话不指定 preset 时是否用它。 */
    isDefault: boolean;
    /** 该 preset 无法 compose 会话时的原因；可用于时缺省。 */
    broken?: string;
}
/**
 * 读取 preset 名单。
 * @param service - `ctx.agentPresets`（形状不符时返回 undefined，调用方据此降级）。
 * @returns 名单，或服务不可用时的 undefined。
 */
export declare function readPresetRoster(service: unknown): Promise<PresetRosterEntry[] | undefined>;
