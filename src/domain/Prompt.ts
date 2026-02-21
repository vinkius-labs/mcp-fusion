import { GroupItem } from './GroupItem.js';
import { type PromptArgument } from './PromptArgument.js';
import { removeFromArray } from './utils.js';

/**
 * Represents an MCP Prompt — a reusable template for LLM interactions.
 *
 * Prompts are leaf nodes that define structured input templates
 * with named arguments. They enable consistent, parameterized
 * LLM interactions.
 *
 * @example
 * ```typescript
 * import { Prompt, PromptArgument } from '@vinkius-core/mcp-fusion';
 *
 * const prompt = new Prompt('generate_summary');
 * prompt.description = 'Generate a summary of the given text';
 *
 * const textArg = new PromptArgument('text');
 * textArg.required = true;
 * textArg.description = 'The text to summarize';
 * prompt.addPromptArgument(textArg);
 *
 * const styleArg = new PromptArgument('style');
 * styleArg.description = 'Summary style (brief, detailed)';
 * prompt.addPromptArgument(styleArg);
 * ```
 *
 * @see {@link PromptArgument} for argument definitions
 * @see {@link GroupItem} for group membership
 */
export class Prompt extends GroupItem {
    /** Ordered list of arguments accepted by this prompt */
    public readonly promptArguments: PromptArgument[] = [];

    public constructor(name: string) {
        super(name);
    }

    /**
     * Add an argument to this prompt.
     *
     * @param promptArgument - The argument to add
     * @returns `false` if already present, `true` if added
     */
    public addPromptArgument(promptArgument: PromptArgument): boolean {
        if (this.promptArguments.includes(promptArgument)) return false;
        this.promptArguments.push(promptArgument);
        return true;
    }

    /**
     * Remove an argument from this prompt.
     *
     * @param promptArgument - The argument to remove
     * @returns `false` if not found, `true` if removed
     */
    public removePromptArgument(promptArgument: PromptArgument): boolean {
        return removeFromArray(this.promptArguments, promptArgument);
    }
}
