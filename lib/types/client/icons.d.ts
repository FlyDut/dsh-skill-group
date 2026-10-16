/**
 * Vendored UI icons for skill-hub.
 *
 * These were originally imported from `@deepseek-ai/dsh-client-ui-primitives`.
 * That package is not exposed as a standalone plugin module by the dsh web
 * build this plugin targets — dsh keeps a static compatibility module instead.
 * Vendoring the few tiny outline icons the hub uses keeps the browser half
 * self-contained and independent of how that module is packaged.
 *
 * SVG paths are copied verbatim from dsh-client-ui-primitives (MIT licensed)
 * so the visuals remain pixel-identical to the dsh icon family.
 */
import type { JSX } from 'react';
/** Props understood by the dsh icon family: size + optional className. */
interface IconProps {
    size?: number;
    className?: string;
}
/** ic_ds_chevron_down_outline_14 */
export declare function IconChevronDownOutline14({ size, className }: IconProps): JSX.Element;
/** ic_ds_skill_outline_16 */
export declare function IconSkillOutline16({ size, className }: IconProps): JSX.Element;
export {};
