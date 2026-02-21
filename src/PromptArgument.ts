import { BaseModel } from './BaseModel.js';

export class PromptArgument extends BaseModel {
    public required: boolean = false;

    public constructor(name: string) {
        super(name);
    }

    public getFullyQualifiedName(): string {
        return this.name;
    }
}
