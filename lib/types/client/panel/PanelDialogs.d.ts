/**
 * PanelDialogs — SkillHubPanel 底部的对话框接线层（冲突、同步确认、
 * 分支选择、版本选择、市场同步、新建技能）。状态与动作仍由 useSkillHub
 * 的 hub 持有；这里只收窄成显式 props，渲染顺序与拆分前完全一致。
 */
import type { JSX } from 'react';
import type { CollectionGroup, SkillTag } from '../../protocol.ts';
import type { SkillHubState } from './useSkillHub.ts';
interface PanelDialogsProps {
    /** 分组开关冲突（groupsState 未加载时传空数组）。 */
    conflictDialog: SkillHubState['conflictDialog'];
    tags: readonly SkillTag[];
    collections: readonly CollectionGroup[];
    setConflictDialog: SkillHubState['setConflictDialog'];
    resolveConflict: SkillHubState['resolveConflict'];
    /** 来源同步确认。 */
    confirmDialog: SkillHubState['confirmDialog'];
    setConfirmDialog: SkillHubState['setConfirmDialog'];
    runConfirmed: SkillHubState['runConfirmed'];
    /** 编辑态暂存删除的落盘确认（点「完成」且有暂存时弹）。 */
    deleteDialog: SkillHubState['deleteDialog'];
    pendingDeletes: SkillHubState['pendingDeletes'];
    setDeleteDialog: SkillHubState['setDeleteDialog'];
    confirmDeletes: () => void;
    /** 无 release 的市场源分支选择。 */
    branchChoice: SkillHubState['branchChoice'];
    branchBusy: SkillHubState['branchBusy'];
    setBranchChoice: SkillHubState['setBranchChoice'];
    confirmBranchChoice: SkillHubState['confirmBranchChoice'];
    /** 市场源版本选择。 */
    versionDialog: SkillHubState['versionDialog'];
    versionBusy: SkillHubState['versionBusy'];
    setVersionDialog: SkillHubState['setVersionDialog'];
    confirmVersionDialog: SkillHubState['confirmVersionDialog'];
    /** 市场源同步后的技能勾选。 */
    marketSyncDialog: SkillHubState['marketSyncDialog'];
    syncBusy: SkillHubState['syncBusy'];
    setMarketSyncDialog: SkillHubState['setMarketSyncDialog'];
    confirmMarketSync: SkillHubState['confirmMarketSync'];
    /** 新建技能弹窗（字段草稿 + 提交动作）。 */
    showForm: SkillHubState['showForm'];
    formName: SkillHubState['formName'];
    formDesc: SkillHubState['formDesc'];
    formContent: SkillHubState['formContent'];
    formRoot: SkillHubState['formRoot'];
    formBusy: SkillHubState['formBusy'];
    formMessage: SkillHubState['formMessage'];
    setShowForm: SkillHubState['setShowForm'];
    setFormName: SkillHubState['setFormName'];
    setFormDesc: SkillHubState['setFormDesc'];
    setFormContent: SkillHubState['setFormContent'];
    setFormRoot: SkillHubState['setFormRoot'];
    setFormMessage: SkillHubState['setFormMessage'];
    create: SkillHubState['create'];
}
export declare function PanelDialogs(props: PanelDialogsProps): JSX.Element;
export {};
