/**
 * useMarketFlow — 市场域：市场源增删、更新检查、星标统计、版本同步、全部
 * 更新；仓库扫描/分支选择/导入任务在 useRepoImportFlow（这里组装它并透传
 * 同样的返回字段）。目录/分组/来源的刷新与来源检查经聚合根传入，不直接
 * 碰其他域的 state。
 */
import type { SourceCheckResult } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type FlowNotices, type MarketState } from './shared.ts';
import type { MarketSyncDialogState, VersionChoiceState } from '../dialogs.tsx';
export declare function useMarketFlow(api: SkillHubApi, shared: FlowNotices, 
/** 目录重载（导入/同步后刷新列表，目录域提供）。 */
reloadCatalog: () => Promise<void>, 
/** 分组重载（导入后刷新，分组域提供）。 */
reloadGroups: () => Promise<void>, 
/** 来源重载（导入/同步后刷新，来源域提供）。 */
reloadSources: () => Promise<void>, 
/** 来源更新检查（全部更新后重查，来源域提供）。 */
checkSources: (repo?: string) => Promise<void>, 
/** 各来源的上游检查结果（全部更新遍历它，来源域提供）。 */
sourceCheck: Readonly<Record<string, SourceCheckResult>>): {
    marketState: MarketState;
    marketCheck: Readonly<Record<string, {
        repo: string;
        ref?: string;
        latestTag?: string;
        updateAvailable: boolean;
        commitSha: string;
        throttled?: boolean;
        error?: string;
    }>>;
    branchChoice: import("../dialogs.tsx").BranchChoiceState | null;
    branchBusy: boolean;
    marketSyncDialog: MarketSyncDialogState | null;
    syncingMarket: string | null;
    syncBusy: boolean;
    newSourceName: string;
    repoDiscoverState: import("./shared.ts").RepoDiscoverState;
    scanningRepo: string | null;
    repoSelected: ReadonlySet<string>;
    repoImporting: boolean;
    repoResult: import("../../../protocol.ts").RepoImportProgressResponse | null;
    importJobId: string | null;
    marketStats: Readonly<Record<string, {
        stars: number;
        downloads: number;
    }>>;
    versionDialog: VersionChoiceState | null;
    versionBusy: boolean;
    updateAllDialog: boolean;
    setBranchChoice: import("react").Dispatch<import("react").SetStateAction<import("../dialogs.tsx").BranchChoiceState | null>>;
    setMarketSyncDialog: import("react").Dispatch<import("react").SetStateAction<MarketSyncDialogState | null>>;
    setNewSourceName: import("react").Dispatch<import("react").SetStateAction<string>>;
    setRepoSelected: import("react").Dispatch<import("react").SetStateAction<ReadonlySet<string>>>;
    setUpdateAllDialog: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    setVersionDialog: import("react").Dispatch<import("react").SetStateAction<VersionChoiceState | null>>;
    loadMarket: () => Promise<void>;
    addSource: (input: string) => Promise<void>;
    addMarketSource: () => Promise<void>;
    removeMarketSource: (repo: string) => Promise<void>;
    scanRepo: (input: string) => Promise<void>;
    confirmBranchChoice: () => Promise<void>;
    openVersionDialog: (repo: string) => Promise<void>;
    confirmVersionDialog: () => Promise<void>;
    toggleRepoSelected: (path: string, checked: boolean) => void;
    importRepo: () => Promise<void>;
    cancelImport: () => Promise<void>;
    clearScan: () => void;
    checkMarket: (silent?: boolean) => Promise<void>;
    loadMarketStats: () => Promise<void>;
    syncMarketSource: (repo: string) => Promise<void>;
    confirmMarketSync: () => Promise<void>;
    updateAll: () => Promise<void>;
};
