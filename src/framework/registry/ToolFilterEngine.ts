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
        if (requiredTags) {
            let hasAll = true;
            for (const t of requiredTags) {
                if (!builderTags.includes(t)) { hasAll = false; break; }
            }
            if (!hasAll) continue;
        }

        // OR logic: builder must have at least ONE of these tags
        if (anyTags) {
            let hasAny = false;
            for (const t of builderTags) {
                if (anyTags.has(t)) { hasAny = true; break; }
            }
            if (!hasAny) continue;
        }

        // Exclude: builder must not have ANY of these tags
        if (excludeTags) {
            let excluded = false;
            for (const t of builderTags) {
                if (excludeTags.has(t)) { excluded = true; break; }
            }
            if (excluded) continue;
        }

        tools.push(builder.buildToolDefinition());
    }
    return tools;
}
