/**
 * CollectionCard — 一个来源集合卡片：组头（来源链接 + 成员数 + 用量汇总）、
 * 检查/同步徽章、三态开关，以及展开后的启用行与关闭行。数据与动作均由
 * SourcesView 传入。上游删除只在徽章里报告，本插件不代删。
 *
 * 插件 provider 提供的集合（kind = 'provider'）没有上游仓库：组名不带
 * GitHub 链接、也不渲染检查/同步徽章，只剩分组与开关。
 */
import type { JSX } from 'react';
import type { CollectionGroup, SourceCheckResult } from '../../protocol.ts';
import type { GroupRow, GroupSwitchView } from '../grouping.ts';
import { type SkillRowProps } from './SkillRow.tsx';
import type { SkillHubState } from './useSkillHub.ts';
interface CollectionCardProps {
    collection: CollectionGroup;
    /** 该集合内通过筛选的行（启用技能与关闭技能已按当前排序键合并）。 */
    rows: GroupRow[];
    /** 该集合卡片是否折叠。 */
    collapsed: boolean;
    /** 成员开关状态（groupSwitchView 派生）。 */
    view: GroupSwitchView;
    /** 该来源的上游检查结果。 */
    check: SourceCheckResult | undefined;
    /** 组内至少一个成员可开关（三态开关可点）。 */
    hasTogglable: boolean;
    /** 正在检查的来源名。 */
    checkingSource: string | null;
    /** 正在同步的来源名。 */
    syncingSource: string | null;
    /** 整组操作忙碌。 */
    batchBusy: boolean;
    /** SkillRow / DisabledRow 共用的收窄 props（skill/record 由行内传入）。 */
    rowProps: Omit<SkillRowProps, 'skill'>;
    toggleGroupCollapse: SkillHubState['toggleGroupCollapse'];
    checkSources: SkillHubState['checkSources'];
    requestSync: SkillHubState['requestSync'];
    toggleGroup: SkillHubState['toggleGroup'];
}
export declare function CollectionCard(props: CollectionCardProps): JSX.Element;
export {};
