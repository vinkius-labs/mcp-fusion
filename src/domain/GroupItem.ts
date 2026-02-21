import { BaseModel } from './BaseModel.js';
import type { Group } from './Group.js';
import { removeFromArray } from './utils.js';

/**
 * Base class for leaf entities that can belong to one or more Groups.
 *
 * Tool, Prompt, and Resource all extend this class to inherit
 * group membership management.
 */
export class GroupItem extends BaseModel {
    /** Groups that contain this item (many-to-many relationship) */
    public readonly parentGroups: Group[];

    protected constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator);
        this.parentGroups = [];
    }

    /** Add this item to a parent group. Returns false if already a member. */
    public addParentGroup(parentGroup: Group): boolean {
        if (this.parentGroups.includes(parentGroup)) return false;
        this.parentGroups.push(parentGroup);
        return true;
    }

    /** Remove this item from a parent group. Returns false if not found. */
    public removeParentGroup(parentGroup: Group): boolean {
        return removeFromArray(this.parentGroups, parentGroup);
    }

    /** Returns the simple name (no hierarchy for leaf items) */
    public getFullyQualifiedName(): string {
        return this.name;
    }
}
