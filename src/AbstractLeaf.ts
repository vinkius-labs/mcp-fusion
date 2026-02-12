import { AbstractBase } from './AbstractBase.js';
import type { Group } from './Group.js';

export class AbstractLeaf extends AbstractBase {
    protected parentGroups: Group[];

    protected constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator);
        this.parentGroups = [];
    }

    public addParentGroup(parentGroup: Group): boolean {
        if (parentGroup === null || parentGroup === undefined) {
            throw new Error("parentGroup must not be null");
        }
        return this.parentGroups.indexOf(parentGroup) === -1 && (this.parentGroups.push(parentGroup), true);
    }

    public removeParentGroup(parentGroup: Group): boolean {
        const index = this.parentGroups.indexOf(parentGroup);
        if (index !== -1) {
            this.parentGroups.splice(index, 1);
            return true;
        }
        return false;
    }

    public getParentGroups(): Group[] {
        return this.parentGroups;
    }

    public getParentGroupRoots(): Group[] {
        const parentGroups = this.parentGroups;
        return parentGroups.map(group => group.getRoot());
    }

    public getFullyQualifiedName(): string {
        return this.name;
    }
}
