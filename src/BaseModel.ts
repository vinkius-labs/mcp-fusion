import { Icon } from './Icon.js';

export abstract class BaseModel {
    public static readonly DEFAULT_SEPARATOR: string = ".";

    public readonly nameSeparator: string;
    public readonly name: string;
    public title: string | undefined;
    public description: string | undefined;
    public meta: Map<string, unknown> | undefined;
    public icons: Icon[] | undefined;

    protected constructor(name: string, nameSeparator?: string) {
        this.name = name;
        this.nameSeparator = nameSeparator !== undefined ? nameSeparator : BaseModel.DEFAULT_SEPARATOR;
    }

    public abstract getFullyQualifiedName(): string;
}
