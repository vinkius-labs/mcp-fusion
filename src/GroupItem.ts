import { BaseModel } from './BaseModel.js';
import type { Group } from './Group.js';
import { removeFromArray } from './utils.js';

export class GroupItem extends BaseModel {
    public readonly parentGroups: Group[];

    protected constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator);
        this.parentGroups = [];
    }

    public addParentGroup(parentGroup: Group): boolean {
        if (this.parentGroups.includes(parentGroup)) return false;
        this.parentGroups.push(parentGroup);
        return true;
    }

    public removeParentGroup(parentGroup: Group): boolean {
        return removeFromArray(this.parentGroups, parentGroup);
    }

    public getFullyQualifiedName(): string {
        return this.name;
    }
}
