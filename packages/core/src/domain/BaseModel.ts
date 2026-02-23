import { type Icon } from './Icon.js';

/**
 * Base class for all MCP domain model entities.
 *
 * Provides common metadata properties shared by all MCP domain objects
 * (tools, resources, prompts, groups). Every entity has a `name`,
 * optional `title`, `description`, `meta`, and `icons`.
 *
 * @example
 * ```typescript
 * // BaseModel is abstract — use concrete subclasses:
 * const tool = new Tool('read_file');
 * tool.title = 'Read File';
 * tool.description = 'Read a file from the filesystem';
 * tool.meta = new Map([['version', '1.0']]);
 * ```
 *
 * @see {@link Group} for tree nodes
 * @see {@link GroupItem} for leaf nodes (Tool, Prompt, Resource)
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

    /**
     * Returns the fully qualified name including all ancestor paths.
     *
     * @example
     * ```typescript
     * const parent = new Group('api');
     * const child = new Group('v2');
     * parent.addChildGroup(child);
     * child.getFullyQualifiedName(); // "api.v2"
     * ```
     */
    public abstract getFullyQualifiedName(): string;
}
