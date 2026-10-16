/**
 * useGroupFlow — 分组域：groups 加载、tag 新建/删除/成员、
 * 组开关与冲突解决。目录侧只消费 batchToggleNames +
 * actionNames（聚合根传入），不碰目录 state。
 */
import { type FormEvent } from 'react';
import type { GroupsResponse, SkillTag } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type GroupSwitchState } from '../../grouping.ts';
import { type FlowNotices } from './shared.ts';
import type { ConflictDialogState } from '../dialogs.tsx';
export declare function useGroupFlow(api: SkillHubApi, shared: FlowNotices, 
/** 整组开关的执行器（目录域提供，stable）。 */
batchToggleNames: (names: string[], enabled: boolean) => Promise<void>, 
/** 目录里存在的技能名：组开关能作用的范围（目录域派生）。 */
actionNames: ReadonlySet<string>, 
/** 当前开启的技能名：判断「关闭会牵连别的组」时只看真正开着的成员。 */
enabledNames: ReadonlySet<string>): {
    groupsState: GroupsResponse | null;
    conflictDialog: ConflictDialogState | null;
    editingTag: SkillTag | null;
    editName: string;
    membersDraft: ReadonlySet<string>;
    newTagName: string;
    editSearch: string;
    setConflictDialog: import("react").Dispatch<import("react").SetStateAction<ConflictDialogState | null>>;
    setEditingTag: import("react").Dispatch<import("react").SetStateAction<SkillTag | null>>;
    setEditName: import("react").Dispatch<import("react").SetStateAction<string>>;
    setMembersDraft: import("react").Dispatch<import("react").SetStateAction<ReadonlySet<string>>>;
    setNewTagName: import("react").Dispatch<import("react").SetStateAction<string>>;
    setEditSearch: import("react").Dispatch<import("react").SetStateAction<string>>;
    loadGroups: () => Promise<void>;
    applyTags: (tags: SkillTag[]) => void;
    groupMap: () => Map<string, string[]>;
    toggleGroup: (key: string, name: string, view: GroupSwitchState) => void;
    resolveConflict: (closeAll: boolean) => Promise<void>;
    createTag: (event: FormEvent) => Promise<void>;
    deleteTag: (id: string) => Promise<void>;
    saveTag: (id: string, name: string, memberNames: string[] | null) => Promise<void>;
};
