/**
 * Full-page skill detail view: metadata, upstream source card with check/sync
 * actions, and the raw SKILL.md body. Pure presentation — every state value
 * and action arrives as a prop, so the panel stays the single owner of state.
 */
import { type JSX, type ReactNode } from 'react';
import type { GroupsResponse, HubConfig, SkillDetail, SourceCheckResult, SourcesResponse } from '../../protocol.ts';
interface SkillDetailViewProps {
    detail: SkillDetail;
    /**
     * 面板的错误/成功横幅。这个视图是整页替换，主视图的横幅位置它拿不到，
     * 但"启用失败""同步失败"恰好发生在这里，所以由面板把片段传进来渲染在顶部。
     */
    notices?: ReactNode;
    hubConfig: HubConfig | null;
    /** skillName → usage stat (count + last used). */
    uses: ReadonlyMap<string, {
        count: number;
        lastUsed?: number;
    }>;
    groupsState: GroupsResponse | null;
    sourcesState: SourcesResponse | null;
    sourceCheck: Readonly<Record<string, SourceCheckResult>>;
    checkingSource: string | null;
    syncingSource: string | null;
    /** Re-enable a skill that is switched off at runtime. */
    onEnable?: () => void;
    onBack: () => void;
    /** Check one source repo for upstream updates. */
    onCheck: (repo: string) => void;
    /** Request syncing the skill (overwrites local edits; opens a confirm). */
    onSync: (repo: string, skills: string[]) => void;
}
export declare function SkillDetailView(props: SkillDetailViewProps): JSX.Element;
export {};
