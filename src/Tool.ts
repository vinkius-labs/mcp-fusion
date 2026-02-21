import { GroupItem } from './GroupItem.js';
import { ToolAnnotations } from './ToolAnnotations.js';

export class Tool extends GroupItem {
    public inputSchema: string | undefined;
    public outputSchema: string | undefined;
    public toolAnnotations: ToolAnnotations | undefined;

    public constructor(name: string) {
        super(name);
    }
}
