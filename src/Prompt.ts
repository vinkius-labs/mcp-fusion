import { AbstractLeaf } from './AbstractLeaf.js';
import { PromptArgument } from './PromptArgument.js';

export class Prompt extends AbstractLeaf {
    public readonly promptArguments: PromptArgument[] = [];

    public constructor(name: string) {
        super(name);
    }

    public addPromptArgument(promptArgument: PromptArgument): boolean {
        if (promptArgument === null || promptArgument === undefined) {
            throw new Error("promptArgument must not be null");
        }
        if (this.promptArguments.includes(promptArgument)) return false;
        this.promptArguments.push(promptArgument);
        return true;
    }

    public removePromptArgument(promptArgument: PromptArgument): boolean {
        const index = this.promptArguments.indexOf(promptArgument);
        if (index !== -1) {
            this.promptArguments.splice(index, 1);
            return true;
        }
        return false;
    }

    public toString(): string {
        return `Prompt [promptArguments=${this.promptArguments}, name=${this.name}, fqName=${this.getFullyQualifiedName()}, title=${this.title}, description=${this.description}, meta=${this.meta}]`;
    }
}
