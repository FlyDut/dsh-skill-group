/**
 * PolicyEditorView — 「可见性策略编辑器」的共用视图（模式与工作区两处共用）。
 *
 * 输入是一份由 `usePolicyDraft` 管理的草稿加三个主题相关的显示值：
 * 主体名（模式名 / 工作区标题）、主体类别称呼（填进 `policy.*` 的 `{subject}`）、
 * 生效时机那一行。除此之外的一切——分组勾选、单技能勾选、保存/重置/确认框——
 * 都与主体无关，所以只写一遍。
 *
 * 刻意**不做**「实时预览」窗口：预览整块列出来会把页面撑得很长，而每个主体的
 * 可见/隐藏计数在列表行里已经如实给出。保存与「重置为不限制」贴在顶部开关左边，
 * 编辑到哪儿都不用再滚回底部。
 *
 * 这是**整页替换**的子视图（与 `TagEditorView` / `SkillDetailView` 同类）：
 * 根是 `.panel`，由 `SkillHubPanel` 在编辑态时提前返回，因此它不会嵌在主面板里。
 *
 * 卡片内的行一律写 `css.row + ' ' + css.rowStatic`，名字/描述用 `css.rowName` +
 * `css.rowDesc`，状态用 `css.badge`，主操作用 `css.button + css.primary`。
 * 注意 `css.rowStatic` 只是修饰类（仅声明 cursor），**必须**与 `css.row` 同时使用
 * ——单独用会让行失去 flex / padding / gap，元素会挤成一团。
 */
import { type JSX, type ReactNode } from 'react';
import type { CatalogResponse } from '../../protocol.ts';
import { scopeGroupOptions, type PolicyDraftApi } from './hooks/usePolicyDraft.ts';
export declare function PolicyEditorView(props: {
    /** 草稿机（模式与工作区共用）。 */
    draft: PolicyDraftApi;
    /** 分组数据摊平成的勾选列表。 */
    groupsState: Parameters<typeof scopeGroupOptions>[0];
    /** 目录（技能描述与来源根成员数）。 */
    catalog: CatalogResponse | null;
    /** 主体显示名（模式名 / 工作区标题）。 */
    subjectName: string;
    /** 主体类别称呼，已翻译（「模式」/「工作区」），填进 `{subject}` 占位。 */
    subjectKind: string;
    /** 生效时机那一行（由调用方按主题语义给出，已翻译）。 */
    effect: string;
    notices?: ReactNode;
}): JSX.Element;
