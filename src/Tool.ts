import { type ToolAnnotations } from './ToolAnnotations.js';
import { GroupItem } from './GroupItem.js';

export class Tool extends GroupItem {
    public inputSchema: string | undefined;
    public outputSchema: string | undefined;
    public toolAnnotations: ToolAnnotations | undefined;

    public constructor(name: string) {
        super(name);
    }
}
