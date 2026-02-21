import { type ToolAnnotations } from './ToolAnnotations.js';
import { GroupItem } from './GroupItem.js';

/**
 * Represents an MCP Tool — an executable capability exposed to LLMs.
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
