import { BaseModel } from './BaseModel.js';
import { type GroupItem } from './GroupItem.js';
import { type Tool } from './Tool.js';
import { type Prompt } from './Prompt.js';
import { type Resource } from './Resource.js';
import { removeFromArray } from './utils.js';

export class Group extends BaseModel {
    public parent: Group | null = null;
    public readonly childGroups: Group[];
    public readonly childTools: Tool[];
    public readonly childPrompts: Prompt[];
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

    public getRoot(): Group {
        return this.parent === null ? this : this.parent.getRoot();
    }

    public isRoot(): boolean {
        return this.parent === null;
    }

    // ── Child groups (special: sets parent, not parentGroup) ──

    public addChildGroup(childGroup: Group): boolean {
        if (this.childGroups.includes(childGroup)) return false;
        this.childGroups.push(childGroup);
        childGroup.parent = this;
        return true;
    }

    public removeChildGroup(childGroup: Group): boolean {
        if (!removeFromArray(this.childGroups, childGroup)) return false;
        childGroup.parent = null;
        return true;
    }

    // ── Child items (delegated to helpers) ──

    public addChildTool(childTool: Tool): boolean {
        return this.addChild(this.childTools, childTool);
    }

    public removeChildTool(childTool: Tool): boolean {
        return this.removeChild(this.childTools, childTool);
    }

    public addChildPrompt(childPrompt: Prompt): boolean {
        return this.addChild(this.childPrompts, childPrompt);
    }

    public removeChildPrompt(childPrompt: Prompt): boolean {
        return this.removeChild(this.childPrompts, childPrompt);
    }

    public addChildResource(childResource: Resource): boolean {
        return this.addChild(this.childResources, childResource);
    }

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

    public getFullyQualifiedName(): string {
        return this.getFullyQualifiedNameRecursive(this);
    }
}
