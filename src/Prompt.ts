import { AbstractLeaf } from './AbstractLeaf.js';
import { PromptArgument } from './PromptArgument.js';

export class Prompt extends AbstractLeaf {
    protected promptArguments: PromptArgument[] = [];

    public constructor(name: string) {
        super(name);
    }

    public getPromptArguments(): PromptArgument[] {
        return this.promptArguments;
    }

    public addPromptArgument(promptArgument: PromptArgument): boolean {
        if (promptArgument === null || promptArgument === undefined) {
            throw new Error("promptArgument must not be null");
        }
        return this.promptArguments.indexOf(promptArgument) === -1 && (this.promptArguments.push(promptArgument), true);
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
