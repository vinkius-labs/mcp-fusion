import { AbstractLeaf } from './AbstractLeaf.js';
import { ToolAnnotations } from './ToolAnnotations.js';

export class Tool extends AbstractLeaf {
    public inputSchema: string | undefined;
    public outputSchema: string | undefined;
    public toolAnnotations: ToolAnnotations | undefined;

    public constructor(name: string) {
        super(name);
    }

    public toString(): string {
        return `Tool [name=${this.name}, fqName=${this.getFullyQualifiedName()}, title=${this.title}, description=${this.description}, meta=${this.meta}, inputSchema=${this.inputSchema}, outputSchema=${this.outputSchema}, toolAnnotation=${this.toolAnnotations}]`;
    }
}
