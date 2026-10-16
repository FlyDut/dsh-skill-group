/**
 * MarketSourceRow — 一个已添加来源的完整行：状态徽章 + 操作按钮。
 * B 方案：扫描主按钮 + 智能更新按钮（检查/更新二合一）+ 溢出移除。
 * 从 MarketView.ts 原样搬出，渲染逻辑不变。
 */
import type { JSX } from 'react';
import type { MarketSourceRecord } from '../../protocol.ts';
import type { SkillHubState } from './useSkillHub.ts';
export declare function MarketSourceRow(props: {
    hub: SkillHubState;
    record: MarketSourceRecord;
}): JSX.Element;
