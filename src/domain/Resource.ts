import { type Annotations } from './Annotations.js';
import { GroupItem } from './GroupItem.js';

/**
 * Represents an MCP Resource — a data source accessible via URI.
 */
export class Resource extends GroupItem {
    /** URI that uniquely identifies this resource */
    public uri: string | undefined;
    /** Size in bytes (if known) */
    public size: number | undefined;
    /** MIME type of the resource content (e.g. "application/json") */
    public mimeType: string | undefined;
    /** Resource annotations for audience, priority, and freshness */
    public annotations: Annotations | undefined;

    public constructor(name: string) {
        super(name);
    }
}
