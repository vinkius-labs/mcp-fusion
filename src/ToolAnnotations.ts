export class ToolAnnotations {
    protected title: string | undefined;
    protected readOnlyHint: boolean | undefined;
    protected destructiveHint: boolean | undefined;
    protected idempotentHint: boolean | undefined;
    protected openWorldHint: boolean | undefined;
    protected returnDirect: boolean | undefined;

    public constructor() {
    }

    public getTitle(): string | undefined {
        return this.title;
    }

    public setTitle(title: string): void {
        this.title = title;
    }

    public getReadOnlyHint(): boolean | undefined {
        return this.readOnlyHint;
    }

    public setReadOnlyHint(readOnlyHint: boolean): void {
        this.readOnlyHint = readOnlyHint;
    }

    public getDestructiveHint(): boolean | undefined {
        return this.destructiveHint;
    }

    public setDestructiveHint(destructiveHint: boolean): void {
        this.destructiveHint = destructiveHint;
    }

    public getIdempotentHint(): boolean | undefined {
        return this.idempotentHint;
    }

    public setIdempotentHint(idempotentHint: boolean): void {
        this.idempotentHint = idempotentHint;
    }

    public getOpenWorldHint(): boolean | undefined {
        return this.openWorldHint;
    }

    public setOpenWorldHint(openWorldHint: boolean): void {
        this.openWorldHint = openWorldHint;
    }

    public getReturnDirect(): boolean | undefined {
        return this.returnDirect;
    }

    public setReturnDirect(returnDirect: boolean): void {
        this.returnDirect = returnDirect;
    }

    public toString(): string {
        return `ToolAnnotation [title=${this.title}, readOnlyHint=${this.readOnlyHint}, destructiveHint=${this.destructiveHint}, idempotentHint=${this.idempotentHint}, openWorldHint=${this.openWorldHint}, returnDirect=${this.returnDirect}]`;
    }
}
