import { GroupItem } from './GroupItem.js';
import { type PromptArgument } from './PromptArgument.js';
import { removeFromArray } from './utils.js';

/**
 * Represents an MCP Prompt — a reusable template for LLM interactions.
 */
export class Prompt extends GroupItem {
    /** Ordered list of arguments accepted by this prompt */
    public readonly promptArguments: PromptArgument[] = [];

    public constructor(name: string) {
        super(name);
    }

    /** Add an argument to this prompt. Returns false if already present. */
    public addPromptArgument(promptArgument: PromptArgument): boolean {
        if (this.promptArguments.includes(promptArgument)) return false;
        this.promptArguments.push(promptArgument);
        return true;
    }

    /** Remove an argument from this prompt. Returns false if not found. */
    public removePromptArgument(promptArgument: PromptArgument): boolean {
        return removeFromArray(this.promptArguments, promptArgument);
    }
}
