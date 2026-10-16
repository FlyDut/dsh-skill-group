/**
 * 「工作区」tab：工作区级技能隔离。
 *
 * 与「模式」tab 完全对称——两种状态、两套根元素、同一套卡片样式：
 *   · 列表态 = 内联 tab 视图 → 根是 Fragment，只吐 `css.section` 卡片
 *     （与 `SourcesView` / `ScenesView` / `MarketView` 一致）；
 *   · 编辑态 = 整页子视图 → 交给共用的 `PolicyEditorView`（根是 `css.panel`），
 *     由 `SkillHubPanel` 提前返回。
 *
 * 与模式的两处语义差异：
 *   · 身份来自 DSH 的工作区注册表（`ctx.workspaceRegistry`），会话按自己的工作
 *     目录**精确**匹配到某个工作区；模式是按会话当前的 agent preset 匹配。
 *   · 工作区启用隔离后**覆盖**模式策略：该工作区目录下的会话只看这里的白名单。
 *
 * 工作区可能先被删、策略还在：这类**孤儿行**如实列出（`present: false`），
 * 让用户能进来清掉，但面板绝不自动删除任何策略。
 */
import type { JSX, ReactNode } from 'react';
import type { SkillHubState } from './useSkillHub.ts';
export declare function WorkspacesView(props: {
    hub: SkillHubState;
    notices?: ReactNode;
}): JSX.Element;
