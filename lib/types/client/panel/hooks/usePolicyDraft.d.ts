/**
 * usePolicyDraft — 「可见性策略编辑器」的共用草稿机。
 *
 * 模式（`useScopeFlow`）与工作区（`useWorkspaceFlow`）编辑的是同一种东西：
 * 一份 `{ enabled, groups, skills }` 白名单，勾选 → 本地预览 → 保存落盘。
 * 差异只有三处，全部由调用方以 `PolicyDraftAdapter` 注入：
 *   · 保存/重置打到哪个接口（presetId vs workspaceId）；
 *   · 保存成功后重新拉哪份名单；
 *   · 行上的文案与状态（列表态，不在这里）。
 * 于是草稿状态机、纯本地预览、空白名单确认这一整套只写一遍。
 *
 * 预览是**本地纯计算**（复用 `domain/scope-policy` 的展开函数），所以勾选时立即
 * 有反馈、不需要往返服务端；服务端返回的计数用于列表行，两侧共用同一份判定语义，
 * 不会出现"预览说 3 个、实际隐藏 2 个"。
 */
import type { CatalogResponse, GroupsResponse, PolicyEntries } from '../../../protocol.ts';
import { type ExpandedScope } from '../../../domain/scope-policy.ts';
import { type FlowNotices } from './shared.ts';
/** 可被编辑的主体：一个 id + 一份已保存的策略（`PresetScopeRow` / `WorkspaceScopeRow` 都满足）。 */
export interface PolicySubjectRow {
    id: string;
    policy: PolicyEntries;
}
/** 主题相关的三个动作：草稿机只负责"何时调"，不关心"打到哪"。 */
export interface PolicyDraftAdapter {
    /** 保存草稿；`confirmEmpty` 表示用户已在确认框里同意"空白名单"。 */
    save(subjectId: string, body: {
        enabled: boolean;
        groups: string[];
        skills: string[];
        confirmEmpty: boolean;
    }): Promise<void>;
    /** 删除策略，回到不限制。 */
    reset(subjectId: string): Promise<void>;
    /** 保存/重置成功后重新拉列表。 */
    reload(): Promise<void>;
}
/** 编辑器底部需要用户拍板的两种情况。 */
export type PolicyConfirm = 'empty' | 'reset';
/** 编辑器需要的一切（`PolicyEditorView` 只认这个形状，不认它来自模式还是工作区）。 */
export interface PolicyDraftApi {
    /** 正在编辑的主体；null = 列表态。 */
    editing: PolicySubjectRow | null;
    /** 保存/重置进行中。 */
    busy: boolean;
    enabled: boolean;
    groups: ReadonlySet<string>;
    skills: ReadonlySet<string>;
    confirm: PolicyConfirm | null;
    saved: boolean;
    /** 草稿展开后的可见性（分组选项与悬空键提示的数据源）。 */
    preview: ExpandedScope | null;
    /** 目录中的全部技能名（升序）。 */
    allNames: string[];
    beginEdit(row: PolicySubjectRow): void;
    cancelEdit(): void;
    toggleGroup(key: string, checked: boolean): void;
    toggleSkill(name: string, checked: boolean): void;
    setSelection(kind: 'groups' | 'skills', keys: readonly string[], checked: boolean): void;
    setEnabled(enabled: boolean): void;
    setConfirm(confirm: PolicyConfirm | null): void;
    /** 保存入口：空白名单是一个"看不到任何技能"的强隔离，必须先确认。 */
    requestSave(confirmEmpty?: boolean): void;
    /** 重置入口：先弹确认框。 */
    requestReset(): void;
    /** 已确认过的重置。 */
    resetNow(): Promise<void>;
}
/** 编辑器里的分组勾选项：键、显示名、成员数与所属类别。 */
export interface ScopeGroupOption {
    key: string;
    label: string;
    kind: 'tag' | 'col' | 'src';
    count: number;
}
/**
 * 把分组数据摊平成勾选列表（场景 → 集合 → 来源根，与侧栏顺序一致）。
 * @param groupsState - 分组数据。
 * @param catalog - 目录（来源根的成员数与名称都从这里推）。
 * @param preview - 当前草稿的展开结果（用来显示每个分组贡献了几个技能）。
 * @returns 勾选项列表。
 */
export declare function scopeGroupOptions(groupsState: GroupsResponse | null, catalog: CatalogResponse | null, preview: {
    resolved: Record<string, string[]>;
} | null): ScopeGroupOption[];
/**
 * 管理一份可见性草稿：加载由调用方负责，这里只管"编辑中的那一个主体"。
 * @param adapter - 主题相关的保存/重置/重载动作（对象每次渲染重建没关系，内部按 ref 取最新的）。
 * @param shared - 跨域通知原语。
 * @param groupsState - 分组数据。
 * @param catalog - 目录。
 */
export declare function usePolicyDraft<Row extends PolicySubjectRow>(adapter: PolicyDraftAdapter, shared: FlowNotices, groupsState: GroupsResponse | null, catalog: CatalogResponse | null): PolicyDraftApi & {
    editing: Row | null;
};
