/** One parsed frontmatter outcome (official provider semantics). */
interface FrontmatterValue {
    name: string;
    description: string;
    whenToUse?: string;
    invocation: {
        modelInvocable: boolean;
        userInvocable: boolean;
    };
    /** Instruction body after the frontmatter block, trimmed. */
    content: string;
}
/** Parse a SKILL.md the way the official filesystem provider does. */
export declare function parseFrontmatter(text: string): {
    value: FrontmatterValue;
} | {
    error: string;
};
/** Try to repair a SKILL.md's frontmatter in place (unquoted colon etc.). Returns the new file text or null when not fixable. */
export declare function repairFrontmatterFileText(text: string): string | null;
export {};
