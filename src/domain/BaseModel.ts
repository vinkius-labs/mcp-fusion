import { type Icon } from './Icon.js';

/**
 * Base class for all domain model entities.
 *
 * Provides common metadata properties shared by all MCP domain objects
 * (tools, resources, prompts, groups).
 */
export abstract class BaseModel {
    /** Default separator used in fully qualified names */
    public static readonly DEFAULT_SEPARATOR: string = ".";

    /** Separator character for constructing fully qualified names */
    public readonly nameSeparator: string;
    /** Unique identifier within the parent scope */
    public readonly name: string;
    /** Human-readable display title */
    public title: string | undefined;
    /** Detailed description of this entity's purpose */
    public description: string | undefined;
    /** Arbitrary key-value metadata for extensibility */
    public meta: Map<string, unknown> | undefined;
    /** Visual icons associated with this entity */
    public icons: Icon[] | undefined;

    protected constructor(name: string, nameSeparator?: string) {
        this.name = name;
        this.nameSeparator = nameSeparator ?? BaseModel.DEFAULT_SEPARATOR;
    }

    /** Returns the fully qualified name including all ancestor paths */
    public abstract getFullyQualifiedName(): string;
}
