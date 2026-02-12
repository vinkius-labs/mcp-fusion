import { AbstractBase } from './AbstractBase.js';

export class PromptArgument extends AbstractBase {
    protected required: boolean = false;

    public constructor(name: string) {
        super(name);
    }

    public setRequired(required: boolean): void {
        this.required = required;
    }

    public isRequired(): boolean {
        return this.required;
    }

    public toString(): string {
        return `PromptArgument [required=${this.required}, name=${this.name}, title=${this.title}, description=${this.description}, meta=${this.meta}]`;
    }

    public getFullyQualifiedName(): string {
        return this.name;
    }
}
