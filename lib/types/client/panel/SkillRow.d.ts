/**
 * One switched-on skill row: name + invocation dots + usage meta, the
 * read-only badge (a source's writability only affects file edits, not the
 * runtime switch), the edit-mode delete button and the switch itself. Shared by
 * the flat list and both grouped views.
 */
import type { JSX } from 'react';
import type { CatalogSkill, HubConfig } from '../../protocol.ts';
/** The narrowed hub surface one skill row consumes. */
export interface SkillRowProps {
    skill: CatalogSkill;
    /** skillName → usage stats. */
    uses: ReadonlyMap<string, {
        count: number;
        lastUsed?: number;
    }>;
    /** Effective hub config; null while it has not loaded. */
    hubConfig: HubConfig | null;
    /** Names with an in-flight toggle. */
    busyNames: ReadonlySet<string>;
    /** Names that collide with another skill (duplicate badge). */
    duplicateNames: ReadonlySet<string>;
    toggle: (skill: CatalogSkill, enabled: boolean) => Promise<void>;
    openDetail: (name: string) => Promise<void>;
    /**
     * 编辑态点「删除」：只把行从显示列表里移走（暂存），点「完成」确认后才落盘。
     * 缺席时（非编辑态，或来源不可写）不渲染删除入口。
     */
    stageDelete?: (name: string) => void;
}
export declare function SkillRow(props: SkillRowProps): JSX.Element;
