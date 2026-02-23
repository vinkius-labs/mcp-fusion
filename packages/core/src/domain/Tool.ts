import { type ToolAnnotations } from './ToolAnnotations.js';
import { GroupItem } from './GroupItem.js';

/**
 * Represents an MCP Tool — an executable capability exposed to LLMs.
 *
 * Tools are leaf nodes in the domain model hierarchy. They can belong
 * to one or more {@link Group}s and carry input/output schemas plus
 * behavioral annotations for LLM safety hints.
 *
 * @example
 * ```typescript
 * import { Tool, createToolAnnotations } from '@vinkius-core/mcp-fusion';
 *
 * const tool = new Tool('read_file');
 * tool.title = 'Read File';
 * tool.description = 'Read a file from the filesystem';
 * tool.inputSchema = JSON.stringify({
 *     type: 'object',
 *     properties: { path: { type: 'string' } },
 * });
 * tool.toolAnnotations = createToolAnnotations({
 *     readOnlyHint: true,
 *     destructiveHint: false,
 * });
 * ```
 *
 * @see {@link GroupItem} for group membership
 * @see {@link ToolAnnotations} for behavioral hints
 */
export class Tool extends GroupItem {
    /** JSON Schema string describing the tool's input parameters */
    public inputSchema: string | undefined;
    /** JSON Schema string describing the tool's output format */
    public outputSchema: string | undefined;
    /** MCP annotations providing behavioral hints to LLMs */
    public toolAnnotations: ToolAnnotations | undefined;

    public constructor(name: string) {
        super(name);
    }
}
