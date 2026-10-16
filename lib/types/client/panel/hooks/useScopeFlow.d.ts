/**
 * useScopeFlow — 模式域：preset 名单加载 + 某个模式的可见性策略编辑。
 *
 * 草稿状态机（勾选/预览/保存/重置/确认框）由 `usePolicyDraft` 提供，这里只补
 * 模式域独有的两件事：拉 `PresetsResponse`、把保存/重置打到 `/scope` 接口。
 */
import type { CatalogResponse, GroupsResponse, PresetsResponse, PresetScopeRow } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type PolicyDraftApi } from './usePolicyDraft.ts';
import type { FlowNotices } from './shared.ts';
export declare function useScopeFlow(api: SkillHubApi, shared: FlowNotices, 
/** 分组数据（场景 tag + 来源集合），由分组域提供。 */
groupsState: GroupsResponse | null, 
/** 目录（技能清单与来源），由目录域提供。 */
catalog: CatalogResponse | null): {
    scopeState: PresetsResponse | null;
    scopeBusy: boolean;
    editingPreset: PresetScopeRow | null;
    loadScopes: () => Promise<void>;
    beginScopeEdit: (row: PresetScopeRow) => void;
    cancelScopeEdit: () => void;
    draft: PolicyDraftApi;
};
