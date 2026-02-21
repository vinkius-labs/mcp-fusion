import { AbstractLeaf } from './AbstractLeaf.js';
import { Annotations } from './Annotations.js';

export class Resource extends AbstractLeaf {
    public uri: string | undefined;
    public size: number | undefined;
    public mimeType: string | undefined;
    public annotations: Annotations | undefined;

    public constructor(name: string) {
        super(name);
    }

    public toString(): string {
        return `Resource [name=${this.name}, fqName=${this.getFullyQualifiedName()}, title=${this.title}, description=${this.description}, meta=${this.meta}, uri=${this.uri}, size=${this.size}, mimeType=${this.mimeType}, annotations=${this.annotations}]`;
    }
}
