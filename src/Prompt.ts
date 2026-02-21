import { GroupItem } from './GroupItem.js';
import { type PromptArgument } from './PromptArgument.js';
import { removeFromArray } from './utils.js';

export class Prompt extends GroupItem {
    public readonly promptArguments: PromptArgument[] = [];

    public constructor(name: string) {
        super(name);
    }

    public addPromptArgument(promptArgument: PromptArgument): boolean {
        if (this.promptArguments.includes(promptArgument)) return false;
        this.promptArguments.push(promptArgument);
        return true;
    }

    public removePromptArgument(promptArgument: PromptArgument): boolean {
        return removeFromArray(this.promptArguments, promptArgument);
    }
}
