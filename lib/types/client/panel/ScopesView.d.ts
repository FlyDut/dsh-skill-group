/**
 * 「模式」tab：模式级技能隔离。
 *
 * 两种状态：**列表态**（每个 agent preset 一行：策略摘要、接线状态、配置入口）
 * 与**编辑态**（按分组/单技能勾选白名单）。
 *
 * 两种状态的根元素不同，取决于它是内联还是整页替换：
 *   · 列表态 = 内联 tab 视图 → 根是 Fragment，只吐 `css.section` 卡片
 *     （与 `SourcesView` / `ScenesView` / `MarketView` 一致）；
 *   · 编辑态 = 整页子视图 → 交给共用的 `PolicyEditorView`（根是 `css.panel`），
 *     由 `SkillHubPanel` 提前返回（与 `TagEditorView` / `SkillDetailView` 一致）。
 *
 * 卡片内的行一律写 `css.row + ' ' + css.rowStatic`，
 * 名字/描述用 `css.rowName` + `css.rowDesc`，状态用 `css.badge`，主操作用
 * `css.button + css.primary`。
 *
 * 注意 `css.rowStatic` 只是修饰类（仅声明 cursor），**必须**与 `css.row`
 * 同时使用——单独用会让行失去 flex / padding / gap，元素会挤成一团。
 *
 * 能力不可用（部署缺 agent-presets / dsh-scope）时降级为只读提示。
 */
import type { JSX, ReactNode } from 'react';
import type { SkillHubState } from './useSkillHub.ts';
export declare function ScopesView(props: {
    hub: SkillHubState;
    notices?: ReactNode;
}): JSX.Element;
