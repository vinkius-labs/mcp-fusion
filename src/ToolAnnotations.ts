export class ToolAnnotations {
    public title: string | undefined;
    public readOnlyHint: boolean | undefined;
    public destructiveHint: boolean | undefined;
    public idempotentHint: boolean | undefined;
    public openWorldHint: boolean | undefined;
    public returnDirect: boolean | undefined;

    public toString(): string {
        return `ToolAnnotation [title=${this.title}, readOnlyHint=${this.readOnlyHint}, destructiveHint=${this.destructiveHint}, idempotentHint=${this.idempotentHint}, openWorldHint=${this.openWorldHint}, returnDirect=${this.returnDirect}]`;
    }
}
