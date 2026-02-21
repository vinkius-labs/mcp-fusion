import { AbstractBase } from './AbstractBase.js';
import { AbstractLeaf } from './AbstractLeaf.js';
import { Tool } from './Tool.js';
import { Prompt } from './Prompt.js';
import { Resource } from './Resource.js';

export class Group extends AbstractBase {
    public parent: Group | null = null;
    public readonly childGroups: Group[];
    public readonly childTools: Tool[];
    public readonly childPrompts: Prompt[];
    public readonly childResources: Resource[];

    public constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator !== undefined ? nameSeparator : AbstractBase.DEFAULT_SEPARATOR);
        this.childGroups = [];
        this.childTools = [];
        this.childPrompts = [];
        this.childResources = [];
    }

    // ── Private helpers to eliminate add/remove repetition ──

    private addLeaf<T extends AbstractLeaf>(list: T[], child: T): boolean {
        if (list.includes(child)) return false;
        list.push(child);
        child.addParentGroup(this);
        return true;
    }

    private removeLeaf<T extends AbstractLeaf>(list: T[], child: T): boolean {
        const index = list.indexOf(child);
        if (index === -1) return false;
        list.splice(index, 1);
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
        const index = this.childGroups.indexOf(childGroup);
        if (index === -1) return false;
        this.childGroups.splice(index, 1);
        childGroup.parent = null;
        return true;
    }

    // ── Child leaves (delegated to helpers) ──

    public addChildTool(childTool: Tool): boolean {
        return this.addLeaf(this.childTools, childTool);
    }

    public removeChildTool(childTool: Tool): boolean {
        return this.removeLeaf(this.childTools, childTool);
    }

    public addChildPrompt(childPrompt: Prompt): boolean {
        return this.addLeaf(this.childPrompts, childPrompt);
    }

    public removeChildPrompt(childPrompt: Prompt): boolean {
        return this.removeLeaf(this.childPrompts, childPrompt);
    }

    public addChildResource(childResource: Resource): boolean {
        return this.addLeaf(this.childResources, childResource);
    }

    public removeChildResource(childResource: Resource): boolean {
        return this.removeLeaf(this.childResources, childResource);
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

    public toString(): string {
        return `Group [name=${this.name}, fqName=${this.getFullyQualifiedName()}, isRoot=${this.isRoot()}, title=${this.title}, description=${this.description}, meta=${this.meta}, childGroups=${this.childGroups}, childTools=${this.childTools}, childPrompts=${this.childPrompts}]`;
    }
}
