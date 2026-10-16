/**
 * useCatalogFlow — 目录域：catalog 加载、详情、开关（单个/批量）、新建、
 * 诊断修复、编辑态暂存的删除，以及列表过滤/排序派生。跨域刷新只通过 shared
 * 通知，不直接碰其他域的 state。
 *
 * 关闭的技能**留在**目录里（CatalogSkill.enabled === false），因此既能被
 * 搜索到，也能在任何视图里一键重新打开：主行与关闭行共用同一份筛选结果。
 *
 * 删除是破坏性的：编辑态点「删除」只把名字放进 pendingDeletes（行立即从列表
 * 消失），点「完成」并确认后才调一次 /skill/delete 落盘。
 */
import type { CatalogResponse, CatalogSkill, SkillDetail, WritableRoot } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type SortKey } from '../../grouping.ts';
import { type FlowNotices, type UsesMap } from './shared.ts';
export declare function useCatalogFlow(api: SkillHubApi, uses: UsesMap, shared: FlowNotices, 
/** 技能总数 >80 时折叠 personal 分组（聚合根实现，状态归它）。 */
collapsePersonal: () => void, 
/** 清掉来源筛选（状态归聚合根，这里只在清空筛选项时调用）。 */
clearSourceFilter: () => void): {
    catalog: CatalogResponse | null;
    loading: boolean;
    detail: SkillDetail | null;
    detailLoading: boolean;
    busyNames: ReadonlySet<string>;
    search: string;
    showForm: boolean;
    formName: string;
    formDesc: string;
    formContent: string;
    formRoot: WritableRoot;
    formBusy: boolean;
    formMessage: {
        kind: "error" | "success";
        text: string;
    } | null;
    fixingPaths: ReadonlySet<string>;
    invocationFilter: "user" | "model" | "all";
    sortKey: SortKey;
    normalized: string;
    actionNames: Set<string>;
    viewNames: Set<string>;
    offSkills: CatalogSkill[];
    filtered: CatalogSkill[];
    sorted: CatalogSkill[];
    shortenedCount: number;
    pendingDeletes: readonly string[];
    deleteDialog: boolean;
    setDetail: import("react").Dispatch<import("react").SetStateAction<SkillDetail | null>>;
    setSearch: import("react").Dispatch<import("react").SetStateAction<string>>;
    setShowForm: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    setFormName: import("react").Dispatch<import("react").SetStateAction<string>>;
    setFormDesc: import("react").Dispatch<import("react").SetStateAction<string>>;
    setFormContent: import("react").Dispatch<import("react").SetStateAction<string>>;
    setFormRoot: import("react").Dispatch<import("react").SetStateAction<WritableRoot>>;
    setFormMessage: import("react").Dispatch<import("react").SetStateAction<{
        kind: "error" | "success";
        text: string;
    } | null>>;
    setInvocationFilter: import("react").Dispatch<import("react").SetStateAction<"user" | "model" | "all">>;
    setSortKey: import("react").Dispatch<import("react").SetStateAction<SortKey>>;
    setDeleteDialog: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    load: () => Promise<void>;
    openDetail: (name: string) => Promise<void>;
    toggle: (skill: CatalogSkill, enabled: boolean) => Promise<void>;
    batchToggleNames: (names: string[], enabled: boolean) => Promise<void>;
    fixDiagnostic: (path: string) => Promise<void>;
    create: () => Promise<void>;
    clearListFilters: () => void;
    stageDelete: (name: string) => void;
    unstageDelete: (name: string) => void;
    confirmDeletes: () => Promise<boolean>;
};
