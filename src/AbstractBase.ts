import { Icon } from './Icon.js';

export abstract class AbstractBase {
    public static readonly DEFAULT_SEPARATOR: string = ".";

    public readonly nameSeparator: string;
    public readonly name: string;
    public title: string | undefined;
    public description: string | undefined;
    public meta: Map<string, unknown> | undefined;
    public icons: Icon[] | undefined;

    protected constructor(name: string, nameSeparator?: string) {
        if (name === null || name === undefined) {
            throw new Error("name must not be null");
        }
        this.name = name;
        this.nameSeparator = nameSeparator !== undefined ? nameSeparator : AbstractBase.DEFAULT_SEPARATOR;
    }

    public hashCode(): number {
        let hash = 0;
        if (this.name.length === 0) return hash;
        for (let i = 0; i < this.name.length; i++) {
            const chr = this.name.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash;
    }

    public equals(obj: unknown): boolean {
        if (this === obj) {
            return true;
        }
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return false;
        }
        if (this.constructor !== obj.constructor) {
            return false;
        }
        const other = obj as AbstractBase;
        return this.name === other.name;
    }

    public abstract getFullyQualifiedName(): string;
}
