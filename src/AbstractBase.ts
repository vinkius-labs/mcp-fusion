import { Icon } from './Icon.js';

export abstract class AbstractBase {
    public static readonly DEFAULT_SEPARATOR: string = ".";

    protected readonly nameSeparator: string;
    protected readonly name: string;
    protected title: string | undefined;
    protected description: string | undefined;
    protected meta: Map<string, unknown> | undefined;
    protected icons: Icon[] | undefined;

    protected constructor(name: string, nameSeparator?: string) {
        if (name === null || name === undefined) {
            throw new Error("name must not be null");
        }
        this.name = name;
        this.nameSeparator = nameSeparator !== undefined ? nameSeparator : AbstractBase.DEFAULT_SEPARATOR;
    }

    public getName(): string {
        return this.name;
    }

    public getTitle(): string | undefined {
        return this.title;
    }

    public setTitle(title: string): void {
        this.title = title;
    }

    public getDescription(): string | undefined {
        return this.description;
    }

    public setDescription(description: string): void {
        this.description = description;
    }

    public getIcons(): Icon[] | undefined {
        return this.icons;
    }

    public setIcons(icons: Icon[]): void {
        this.icons = icons;
    }

    public getMeta(): Map<string, unknown> | undefined {
        return this.meta;
    }

    public setMeta(meta: Map<string, unknown>): void {
        this.meta = meta;
    }

    public hashCode(): number {
        // Simple hash code implementation based on name
        let hash = 0;
        if (this.name.length === 0) return hash;
        for (let i = 0; i < this.name.length; i++) {
            const chr = this.name.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
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
