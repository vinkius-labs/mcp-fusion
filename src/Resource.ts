import { type Annotations } from './Annotations.js';
import { GroupItem } from './GroupItem.js';

export class Resource extends GroupItem {
    public uri: string | undefined;
    public size: number | undefined;
    public mimeType: string | undefined;
    public annotations: Annotations | undefined;

    public constructor(name: string) {
        super(name);
    }
}
