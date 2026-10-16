/**
 * useSourceFlow — 来源域：来源列表、上游更新检查、同步确认。目录与分组的
 * 刷新经聚合根传入的 reload 回调，不直接碰其他域的 state。
 *
 * 本插件不替用户删除任何技能文件：上游删除只在「检查」结果里报告出来，
 * 本地清理由用户自己在文件系统里完成。
 */
import type { SourceCheckResult, SourcesResponse } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type FlowNotices } from './shared.ts';
import type { ConfirmDialogState } from '../dialogs.tsx';
export declare function useSourceFlow(api: SkillHubApi, shared: FlowNotices, 
/** 目录重载（同步覆盖技能后刷新列表，目录域提供）。 */
reloadCatalog: () => Promise<void>, 
/** 分组重载（来源/成员变化后刷新，分组域提供）。 */
reloadGroups: () => Promise<void>): {
    sourcesState: SourcesResponse | null;
    sourceCheck: Readonly<Record<string, SourceCheckResult>>;
    checkingSource: string | null;
    syncingSource: string | null;
    confirmDialog: ConfirmDialogState | null;
    setConfirmDialog: import("react").Dispatch<import("react").SetStateAction<ConfirmDialogState | null>>;
    loadSources: () => Promise<void>;
    checkSources: (repo?: string) => Promise<void>;
    requestSync: (repo: string, skills: string[]) => void;
    runConfirmed: () => Promise<void>;
};
