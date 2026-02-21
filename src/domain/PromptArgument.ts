import { BaseModel } from './BaseModel.js';

/**
 * Represents a named argument for an MCP Prompt.
 */
export class PromptArgument extends BaseModel {
    /** Whether this argument must be provided when invoking the prompt */
    public required: boolean = false;

    public constructor(name: string) {
        super(name);
    }

    /** Returns the simple argument name */
    public getFullyQualifiedName(): string {
        return this.name;
    }
}
