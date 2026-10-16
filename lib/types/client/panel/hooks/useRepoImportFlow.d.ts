/**
 * useRepoImportFlow — 市场子域：仓库扫描/分支选择/导入任务（轮询+取消）。
 * 从 useMarketFlow 原样搬出：状态、动作、卸载中断与依赖顺序不变；市场源
 * 列表刷新（loadMarket）与目录/分组/来源重载经参数注入，不直接碰其他域。
 */
import type { RepoImportProgressResponse } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type FlowNotices, type RepoDiscoverState } from './shared.ts';
import type { BranchChoiceState } from '../dialogs.tsx';
export declare function useRepoImportFlow(api: SkillHubApi, shared: FlowNotices, 
/** 市场源列表刷新（扫描定版后刷新 ref 徽章，导入完成后刷新列表）。 */
loadMarket: () => Promise<void>, 
/** 目录重载（导入完成后刷新列表，目录域提供）。 */
reloadCatalog: () => Promise<void>, 
/** 分组重载（导入后刷新，分组域提供）。 */
reloadGroups: () => Promise<void>, 
/** 来源重载（导入后刷新，来源域提供）。 */
reloadSources: () => Promise<void>): {
    repoDiscoverState: RepoDiscoverState;
    scanningRepo: string | null;
    repoSelected: ReadonlySet<string>;
    repoImporting: boolean;
    repoResult: RepoImportProgressResponse | null;
    importJobId: string | null;
    branchChoice: BranchChoiceState | null;
    branchBusy: boolean;
    setBranchChoice: import("react").Dispatch<import("react").SetStateAction<BranchChoiceState | null>>;
    setRepoSelected: import("react").Dispatch<import("react").SetStateAction<ReadonlySet<string>>>;
    setRepoDiscoverState: import("react").Dispatch<import("react").SetStateAction<RepoDiscoverState>>;
    setScanningRepo: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    setRepoResult: import("react").Dispatch<import("react").SetStateAction<RepoImportProgressResponse | null>>;
    scanRepo: (input: string) => Promise<void>;
    confirmBranchChoice: () => Promise<void>;
    toggleRepoSelected: (path: string, checked: boolean) => void;
    importRepo: () => Promise<void>;
    cancelImport: () => Promise<void>;
    clearScan: () => void;
};
