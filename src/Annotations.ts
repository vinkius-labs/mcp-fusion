import { Role } from './Role.js';

export class Annotations {
    public audience: Role[] | undefined;
    public priority: number | undefined;
    public lastModified: string | undefined;

    public constructor(audience?: Role[], priority?: number, lastModified?: string) {
        this.audience = audience;
        this.priority = priority;
        this.lastModified = lastModified;
    }
}
