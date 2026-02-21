import { BaseModel } from './BaseModel.js';
import { type GroupItem } from './GroupItem.js';
import { type Tool } from './Tool.js';
import { type Prompt } from './Prompt.js';
import { type Resource } from './Resource.js';
import { removeFromArray } from './utils.js';

/**
 * Represents a hierarchical group (tree node) in the MCP domain model.
 *
 * Groups can contain child groups, tools, prompts, and resources.
 * Supports fully qualified names via recursive parent traversal.
 *
 * @example
 * ```typescript
 * // Build a hierarchy
 * const api = new Group('api');
 * const v2 = new Group('v2');
 * api.addChildGroup(v2);
 *
 * const readFile = new Tool('read_file');
 * v2.addChildTool(readFile);
 *
 * v2.getFullyQualifiedName();  // "api.v2"
 * api.isRoot();                // true
 * v2.getRoot();                // api
 * ```
 *
 * @see {@link GroupItem} for leaf nodes (Tool, Prompt, Resource)
 * @see {@link BaseModel} for shared properties
 */
export class Group extends BaseModel {
    /** Parent group (null if this is a root node) */
    public parent: Group | null = null;
    /** Direct child groups in this container */
    public readonly childGroups: Group[];
    /** Tools contained in this group */
    public readonly childTools: Tool[];
    /** Prompts contained in this group */
    public readonly childPrompts: Prompt[];
    /** Resources contained in this group */
    public readonly childResources: Resource[];

    public constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator !== undefined ? nameSeparator : BaseModel.DEFAULT_SEPARATOR);
        this.childGroups = [];
        this.childTools = [];
        this.childPrompts = [];
        this.childResources = [];
    }

    // ── Private helpers to eliminate add/remove repetition ──

    private addChild<T extends GroupItem>(list: T[], child: T): boolean {
        if (list.includes(child)) return false;
        list.push(child);
        child.addParentGroup(this);
        return true;
    }

    private removeChild<T extends GroupItem>(list: T[], child: T): boolean {
        if (!removeFromArray(list, child)) return false;
        child.removeParentGroup(this);
        return true;
    }

    // ── Tree navigation ──

    /**
     * Traverse to the root of the tree.
     *
     * @returns The topmost ancestor group
     *
     * @example
     * ```typescript
     * const root = new Group('api');
     * const child = new Group('users');
     * root.addChildGroup(child);
     * child.getRoot(); // root
     * ```
     */
    public getRoot(): Group {
        return this.parent === null ? this : this.parent.getRoot();
    }

    /** Returns `true` if this group has no parent (is a root node). */
    public isRoot(): boolean {
        return this.parent === null;
    }

    // ── Child groups (special: sets parent, not parentGroup) ──

    /**
     * Add a child group to this container.
     *
     * @param childGroup - The group to nest under this one
     * @returns `false` if already a child, `true` if added
     */
    public addChildGroup(childGroup: Group): boolean {
        if (this.childGroups.includes(childGroup)) return false;
        this.childGroups.push(childGroup);
        childGroup.parent = this;
        return true;
    }

    /**
     * Remove a child group from this container.
     *
     * @param childGroup - The group to remove
     * @returns `false` if not found, `true` if removed
     */
    public removeChildGroup(childGroup: Group): boolean {
        if (!removeFromArray(this.childGroups, childGroup)) return false;
        childGroup.parent = null;
        return true;
    }

    // ── Child items (delegated to helpers) ──

    /** Add a tool to this group. Returns `false` if already present. */
    public addChildTool(childTool: Tool): boolean {
        return this.addChild(this.childTools, childTool);
    }

    /** Remove a tool from this group. Returns `false` if not found. */
    public removeChildTool(childTool: Tool): boolean {
        return this.removeChild(this.childTools, childTool);
    }

    /** Add a prompt to this group. Returns `false` if already present. */
    public addChildPrompt(childPrompt: Prompt): boolean {
        return this.addChild(this.childPrompts, childPrompt);
    }

    /** Remove a prompt from this group. Returns `false` if not found. */
    public removeChildPrompt(childPrompt: Prompt): boolean {
        return this.removeChild(this.childPrompts, childPrompt);
    }

    /** Add a resource to this group. Returns `false` if already present. */
    public addChildResource(childResource: Resource): boolean {
        return this.addChild(this.childResources, childResource);
    }

    /** Remove a resource from this group. Returns `false` if not found. */
    public removeChildResource(childResource: Resource): boolean {
        return this.removeChild(this.childResources, childResource);
    }

    // ── FQN ──

    protected getFullyQualifiedNameRecursive(tg: Group): string {
        const parent = tg.parent;
        if (parent !== null) {
            const parentName = this.getFullyQualifiedNameRecursive(parent);
            return parentName + this.nameSeparator + tg.name;
        }
        return tg.name;
    }

    /**
     * Returns the dot-separated fully qualified name.
     *
     * @example
     * ```typescript
     * const root = new Group('api');
     * const v2 = new Group('v2');
     * root.addChildGroup(v2);
     * v2.getFullyQualifiedName(); // "api.v2"
     * ```
     */
    public getFullyQualifiedName(): string {
        return this.getFullyQualifiedNameRecursive(this);
    }
}
