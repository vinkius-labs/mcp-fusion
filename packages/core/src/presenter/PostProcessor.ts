/**
 * PostProcessor — MVA Response Post-Processing
 *
 * Extracted from the ExecutionPipeline to uphold SRP.
 * Transforms raw handler return values into valid MCP ToolResponse
 * objects according to the MVA priority hierarchy.
 *
 * @internal
 * @module
 */
import { type ToolResponse, success as successResponse } from '../core/response.js';
import { isResponseBuilder, type ResponseBuilder } from './ResponseBuilder.js';
import { type Presenter } from './Presenter.js';

/**
 * Post-process a handler's return value through the MVA priority hierarchy.
 *
 * Priority:
 * 1. **ToolResponse** → use directly (backward compatibility)
 * 2. **ResponseBuilder** → call `.build()` (auto-build)
 * 3. **Raw data + Presenter** → pipe through `Presenter.make(data).build()`
 * 4. **Raw data without Presenter** → wrap via canonical `success()` helper
 *
 * @param result - The handler's return value
 * @param presenter - The action's Presenter (from `returns` field), if any
 * @param ctx - Optional request context
 * @param selectFields - Optional `_select` field names for context window optimization
 * @returns A valid MCP ToolResponse
 *
 * @internal
 */
export function postProcessResult(
    result: unknown,
    presenter: Presenter<unknown> | undefined,
    ctx?: unknown,
    selectFields?: string[],
): ToolResponse {
    // Priority 1: Already a ToolResponse (has content array)
    if (isToolResponse(result)) {
        return result;
    }

    // Priority 2: ResponseBuilder instance → auto-call .build()
    if (isResponseBuilder(result)) {
        return (result as ResponseBuilder).build();
    }

    // Priority 3: Raw data + Presenter → pipe through MVA
    if (presenter) {
        return presenter.make(result, ctx, selectFields).build();
    }

    // Priority 4: Raw data without Presenter → canonical success() helper
    return successResponse(
        typeof result === 'string' || typeof result === 'object'
            ? (result as string | object)
            : String(result),
    );
}

// ── Type Guard ───────────────────────────────────────────

/**
 * Check if a value is a valid MCP ToolResponse.
 *
 * A ToolResponse must have a `content` array — the canonical shape
 * from `response.ts`.
 *
 * @internal
 */
export function isToolResponse(value: unknown): value is ToolResponse {
    return (
        typeof value === 'object' &&
        value !== null &&
        'content' in value &&
        Array.isArray((value as { content: unknown }).content)
    );
}
