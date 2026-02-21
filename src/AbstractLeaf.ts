import { AbstractBase } from './AbstractBase.js';
import type { Group } from './Group.js';

export class AbstractLeaf extends AbstractBase {
    public readonly parentGroups: Group[];

    protected constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator);
        this.parentGroups = [];
    }

    public addParentGroup(parentGroup: Group): boolean {
        if (parentGroup === null || parentGroup === undefined) {
            throw new Error("parentGroup must not be null");
        }
        if (this.parentGroups.includes(parentGroup)) return false;
        this.parentGroups.push(parentGroup);
        return true;
    }

    public removeParentGroup(parentGroup: Group): boolean {
        const index = this.parentGroups.indexOf(parentGroup);
        if (index !== -1) {
            this.parentGroups.splice(index, 1);
            return true;
        }
        return false;
    }

    public getFullyQualifiedName(): string {
        return this.name;
    }
}
