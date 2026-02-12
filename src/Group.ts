import { AbstractBase } from './AbstractBase.js';
import { Tool } from './Tool.js';
import { Prompt } from './Prompt.js';
import { Resource } from './Resource.js';

export class Group extends AbstractBase {
    protected parent: Group | null = null;
    protected readonly childGroups: Group[];
    protected readonly childTools: Tool[];
    protected readonly childPrompts: Prompt[];
    protected readonly childResources: Resource[];

    public constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator !== undefined ? nameSeparator : AbstractBase.DEFAULT_SEPARATOR);
        this.childGroups = [];
        this.childTools = [];
        this.childPrompts = [];
        this.childResources = [];
    }

    public getParent(): Group | null {
        return this.parent;
    }

    public setParent(parent: Group): void {
        this.parent = parent;
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
        const added = this.childGroups.indexOf(childGroup) === -1;
        if (added) {
            this.childGroups.push(childGroup);
            childGroup.parent = this;
            return true;
        }
        return false;
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

    public getChildrenGroups(): Group[] {
        return this.childGroups;
    }

    public addChildTool(childTool: Tool): boolean {
        const added = this.childTools.indexOf(childTool) === -1;
        if (added) {
            this.childTools.push(childTool);
            childTool.addParentGroup(this);
            return true;
        }
        return false;
    }

    public removeChildTool(childTool: Tool): boolean {
        const index = this.childTools.indexOf(childTool);
        const removed = index !== -1;
        if (removed) {
            this.childTools.splice(index, 1);
            childTool.removeParentGroup(this);
            return true;
        }
        return false;
    }

    public getChildrenTools(): Tool[] {
        return this.childTools;
    }

    public addChildPrompt(childPrompt: Prompt): boolean {
        const added = this.childPrompts.indexOf(childPrompt) === -1;
        if (added) {
            this.childPrompts.push(childPrompt);
            childPrompt.addParentGroup(this);
            return true;
        }
        return false;
    }

    public removeChildPrompt(childPrompt: Prompt): boolean {
        const index = this.childPrompts.indexOf(childPrompt);
        const removed = index !== -1;
        if (removed) {
            this.childPrompts.splice(index, 1);
            childPrompt.removeParentGroup(this);
            return true;
        }
        return false;
    }

    public getChildrenResources(): Resource[] {
        return this.childResources;
    }

    public addChildResource(childResource: Resource): boolean {
        const added = this.childResources.indexOf(childResource) === -1;
        if (added) {
            this.childResources.push(childResource);
            childResource.addParentGroup(this);
            return true;
        }
        return false;
    }

    public removeChildResource(childResource: Resource): boolean {
        const index = this.childResources.indexOf(childResource);
        const removed = index !== -1;
        if (removed) {
            this.childResources.splice(index, 1);
            childResource.removeParentGroup(this);
            return true;
        }
        return false;
    }

    public getChildrenPrompts(): Prompt[] {
        return this.childPrompts;
    }

    protected getFullyQualifiedNameRecursive(sb: string, tg: Group): string {
        const parent = tg.getParent();
        if (parent !== null) {
            const parentName = this.getFullyQualifiedNameRecursive(sb, parent);
            return parentName + this.nameSeparator + tg.getName();
        }
        return tg.getName();
    }

    public getFullyQualifiedName(): string {
        return this.getFullyQualifiedNameRecursive("", this);
    }

    public toString(): string {
        return `Group [name=${this.name}, fqName=${this.getFullyQualifiedName()}, isRoot=${this.isRoot()}, title=${this.title}, description=${this.description}, meta=${this.meta}, childGroups=${this.childGroups}, childTools=${this.childTools}, childPrompts=${this.childPrompts}]`;
    }
}
