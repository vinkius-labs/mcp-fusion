import { AbstractBase } from './AbstractBase.js';
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

    public getRoot(): Group {
        const parent = this.parent;
        if (parent === null) {
            return this;
        } else {
            return parent.getRoot();
        }
    }

    public isRoot(): boolean {
        return this.parent === null;
    }

    public addChildGroup(childGroup: Group): boolean {
        if (this.childGroups.includes(childGroup)) return false;
        this.childGroups.push(childGroup);
        childGroup.parent = this;
        return true;
    }

    public removeChildGroup(childGroup: Group): boolean {
        const index = this.childGroups.indexOf(childGroup);
        if (index !== -1) {
            this.childGroups.splice(index, 1);
            childGroup.parent = null;
            return true;
        }
        return false;
    }

    public addChildTool(childTool: Tool): boolean {
        if (this.childTools.includes(childTool)) return false;
        this.childTools.push(childTool);
        childTool.addParentGroup(this);
        return true;
    }

    public removeChildTool(childTool: Tool): boolean {
        const index = this.childTools.indexOf(childTool);
        if (index !== -1) {
            this.childTools.splice(index, 1);
            childTool.removeParentGroup(this);
            return true;
        }
        return false;
    }

    public addChildPrompt(childPrompt: Prompt): boolean {
        if (this.childPrompts.includes(childPrompt)) return false;
        this.childPrompts.push(childPrompt);
        childPrompt.addParentGroup(this);
        return true;
    }

    public removeChildPrompt(childPrompt: Prompt): boolean {
        const index = this.childPrompts.indexOf(childPrompt);
        if (index !== -1) {
            this.childPrompts.splice(index, 1);
            childPrompt.removeParentGroup(this);
            return true;
        }
        return false;
    }

    public addChildResource(childResource: Resource): boolean {
        if (this.childResources.includes(childResource)) return false;
        this.childResources.push(childResource);
        childResource.addParentGroup(this);
        return true;
    }

    public removeChildResource(childResource: Resource): boolean {
        const index = this.childResources.indexOf(childResource);
        if (index !== -1) {
            this.childResources.splice(index, 1);
            childResource.removeParentGroup(this);
            return true;
        }
        return false;
    }

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
