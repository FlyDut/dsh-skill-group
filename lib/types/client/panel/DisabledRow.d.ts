/**
 * One switched-off skill row (name + description + source badge + enable
 * switch, plus the edit-mode delete entry). Shared by the source-group lists,
 * the scene-group lists, and the bottom disabled section.
 */
import type { JSX } from 'react';
import type { CatalogSkill } from '../../protocol.ts';
export declare function DisabledRow(props: {
    record: CatalogSkill;
    busy: boolean;
    onEnable: () => void;
    duplicate?: boolean;
    onOpen?: () => void;
    stageDelete?: (name: string) => void;
}): JSX.Element;
