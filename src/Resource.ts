import { AbstractLeaf } from './AbstractLeaf.js';
import { Annotations } from './Annotations.js';

export class Resource extends AbstractLeaf {
    protected uri: string | undefined;
    protected size: number | undefined;
    protected mimeType: string | undefined;
    protected annotations: Annotations | undefined;

    public constructor(name: string) {
        super(name);
    }

    public getUri(): string | undefined {
        return this.uri;
    }

    public setUri(uri: string): void {
        this.uri = uri;
    }

    public getSize(): number | undefined {
        return this.size;
    }

    public setSize(size: number): void {
        this.size = size;
    }

    public getMimeType(): string | undefined {
        return this.mimeType;
    }

    public setMimeType(mimeType: string): void {
        this.mimeType = mimeType;
    }

    public getAnnotations(): Annotations | undefined {
        return this.annotations;
    }

    public setAnnotations(annotations: Annotations): void {
        this.annotations = annotations;
    }

    public toString(): string {
        return `Resource [name=${this.name}, fqName=${this.getFullyQualifiedName()}, title=${this.title}, description=${this.description}, meta=${this.meta}, uri=${this.uri}, size=${this.size}, mimeType=${this.mimeType}, annotations=${this.annotations}]`;
    }
}
