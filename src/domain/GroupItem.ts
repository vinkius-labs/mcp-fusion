import { BaseModel } from './BaseModel.js';
import type { Group } from './Group.js';
import { removeFromArray } from './utils.js';

/**
 * Base class for leaf entities that can belong to one or more Groups.
 *
 * {@link Tool}, {@link Prompt}, and {@link Resource} all extend this
 * class to inherit group membership management. Supports many-to-many
 * relationships with parent groups.
 *
 * @example
 * ```typescript
 * const tool = new Tool('read_file');
 * const group = new Group('filesystem');
 *
 * group.addChildTool(tool);
 * tool.parentGroups; // [group]
 * ```
 *
 * @see {@link Group} for parent containers
 * @see {@link Tool} for tool leaf nodes
 * @see {@link Prompt} for prompt leaf nodes
 * @see {@link Resource} for resource leaf nodes
 */
export class GroupItem extends BaseModel {
    /** Groups that contain this item (many-to-many relationship) */
    public readonly parentGroups: Group[];

    protected constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator);
        this.parentGroups = [];
    }

    /**
     * Add this item to a parent group.
     *
     * @param parentGroup - The group to join
     * @returns `false` if already a member, `true` if added
     */
    public addParentGroup(parentGroup: Group): boolean {
        if (this.parentGroups.includes(parentGroup)) return false;
        this.parentGroups.push(parentGroup);
        return true;
    }

    /**
     * Remove this item from a parent group.
     *
     * @param parentGroup - The group to leave
     * @returns `false` if not found, `true` if removed
     */
    public removeParentGroup(parentGroup: Group): boolean {
        return removeFromArray(this.parentGroups, parentGroup);
    }

    /** Returns the simple name (leaf items have no hierarchy prefix) */
    public getFullyQualifiedName(): string {
        return this.name;
    }
}
