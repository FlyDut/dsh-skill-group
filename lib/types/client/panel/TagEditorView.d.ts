/**
 * Full-page tag (scene) editor: rename / delete header, member checkbox
 * lists (enabled + disabled skills), and the save-members action. Pure
 * presentation — the draft state lives in the panel and arrives as props.
 *
 * Members the catalog no longer knows (the skill was deleted or renamed) get
 * their own checked rows as well: they never render in the two lists above,
 * so without this the only way out would be hand-editing the sidecar.
 */
import type { JSX, ReactNode } from 'react';
import type { CatalogResponse, SkillTag } from '../../protocol.ts';
interface TagEditorViewProps {
    tag: SkillTag;
    /** 面板的错误/成功横幅（整页替换，由面板传入，渲染在顶部）。 */
    notices?: ReactNode;
    /** Current name draft (panel-owned). */
    editName: string;
    /** Current member-checkbox draft (panel-owned). */
    membersDraft: ReadonlySet<string>;
    /** Current member-list search text (panel-owned). */
    editSearch: string;
    catalog: CatalogResponse | null;
    tagBusy: boolean;
    onBack: () => void;
    onEditName: (value: string) => void;
    onEditSearch: (value: string) => void;
    onToggleMember: (name: string, checked: boolean) => void;
    /** Rename with the current draft (disabled while blank). */
    onRename: () => void;
    /** Delete this tag. */
    onDelete: () => void;
    /** Persist the current member draft and leave the editor. */
    onSaveMembers: () => void;
}
export declare function TagEditorView(props: TagEditorViewProps): JSX.Element;
export {};
