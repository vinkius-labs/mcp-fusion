import { AbstractLeaf } from './AbstractLeaf.js';
import { ToolAnnotations } from './ToolAnnotations.js';

export class Tool extends AbstractLeaf {
    protected inputSchema: string | undefined;
    protected outputSchema: string | undefined;
    protected toolAnnotations: ToolAnnotations | undefined;

    public constructor(name: string) {
        super(name);
    }

    public getInputSchema(): string | undefined {
        return this.inputSchema;
    }

    public setInputSchema(inputSchema: string): void {
        this.inputSchema = inputSchema;
    }

    public getOutputSchema(): string | undefined {
        return this.outputSchema;
    }

    public setOutputSchema(outputSchema: string): void {
        this.outputSchema = outputSchema;
    }

    public getToolAnnotations(): ToolAnnotations | undefined {
        return this.toolAnnotations;
    }

    public setToolAnnotations(toolAnnotations: ToolAnnotations): void {
        this.toolAnnotations = toolAnnotations;
    }

    public toString(): string {
        return `Tool [name=${this.name}, fqName=${this.getFullyQualifiedName()}, title=${this.title}, description=${this.description}, meta=${this.meta}, inputSchema=${this.inputSchema}, outputSchema=${this.outputSchema}, toolAnnotation=${this.toolAnnotations}]`;
    }
}
