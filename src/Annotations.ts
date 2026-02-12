import { Role } from './Role.js';

export class Annotations {
    private audience: Role[] | undefined;
    private priority: number | undefined;
    private lastModified: string | undefined;

    public constructor(audience: Role[], priority: number, lastModified: string) {
        this.audience = audience;
        this.priority = priority;
        this.lastModified = lastModified;
    }

    public getAudience(): Role[] | undefined {
        return this.audience;
    }

    public setAudience(audience: Role[]): void {
        this.audience = audience;
    }

    public getPriority(): number | undefined {
        return this.priority;
    }

    public setPriority(priority: number): void {
        this.priority = priority;
    }

    public getLastModified(): string | undefined {
        return this.lastModified;
    }

    public setLastModified(lastModified: string): void {
        this.lastModified = lastModified;
    }

    public toString(): string {
        return `Annotations [audience=${this.audience}, priority=${this.priority}, lastModified=${this.lastModified}]`;
    }
}
