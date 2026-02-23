import { type Annotations } from './Annotations.js';
import { GroupItem } from './GroupItem.js';

/**
 * Represents an MCP Resource — a data source accessible via URI.
 *
 * Resources are leaf nodes in the domain model hierarchy. They expose
 * data that LLMs can read (e.g., files, database records, API responses).
 *
 * @example
 * ```typescript
 * import { Resource, createAnnotations, Role } from '@vinkius-core/mcp-fusion';
 *
 * const resource = new Resource('config');
 * resource.uri = 'file:///etc/app/config.json';
 * resource.mimeType = 'application/json';
 * resource.size = 1024;
 * resource.annotations = createAnnotations({
 *     audience: [Role.ASSISTANT],
 *     priority: 0.8,
 * });
 * ```
 *
 * @see {@link GroupItem} for group membership
 * @see {@link Annotations} for audience/priority metadata
 */
export class Resource extends GroupItem {
    /** URI that uniquely identifies this resource */
    public uri: string | undefined;
    /** Size in bytes (if known) */
    public size: number | undefined;
    /** MIME type of the resource content (e.g. `"application/json"`) */
    public mimeType: string | undefined;
    /** Resource annotations for audience, priority, and freshness */
    public annotations: Annotations | undefined;

    public constructor(name: string) {
        super(name);
    }
}
