/**
 * ToolFilterEngine — Tag-Based Tool Filtering Strategy
 *
 * Filters tool builders by tag criteria using the Specification pattern.
 * Supports AND, OR, and exclusion logic with O(1) Set-based lookups.
 *
 * Pure-function module: no state, no side effects.
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolBuilder } from '../types.js';

// ── Types ────────────────────────────────────────────────

/** Filter options for selective tool exposure */
export interface ToolFilter {
    /** Only include tools that have ALL these tags (AND logic) */
    tags?: string[];
    /** Only include tools that have at least ONE of these tags (OR logic) */
    anyTag?: string[];
    /** Exclude tools that have ANY of these tags */
    exclude?: string[];
}

// ── Filter Engine ────────────────────────────────────────

/**
 * Filter and build tool definitions from a collection of builders.
 *
 * Uses Set-based lookups for O(1) tag matching and single-pass iteration
 * to avoid intermediate array allocations.
 */
export function filterTools<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
    filter: ToolFilter,
): McpTool[] {
    // Pre-convert filter arrays to Sets for O(1) lookup
    const requiredTags = filter.tags && filter.tags.length > 0
        ? new Set(filter.tags) : undefined;
    const anyTags = filter.anyTag && filter.anyTag.length > 0
        ? new Set(filter.anyTag) : undefined;
    const excludeTags = filter.exclude && filter.exclude.length > 0
        ? new Set(filter.exclude) : undefined;

    const tools: McpTool[] = [];
    for (const builder of builders) {
        const builderTags = builder.getTags();

        // AND logic: builder must have ALL required tags
        if (requiredTags && !Array.from(requiredTags).every(t => builderTags.includes(t))) {
            continue;
        }

        // OR logic: builder must have at least ONE of these tags
        if (anyTags && !builderTags.some(t => anyTags.has(t))) {
            continue;
        }

        // Exclude: builder must not have ANY of these tags
        if (excludeTags && builderTags.some(t => excludeTags.has(t))) {
            continue;
        }

        tools.push(builder.buildToolDefinition());
    }
    return tools;
}
