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
import { type TelemetrySink } from '../observability/TelemetryEvent.js';

// ── Telemetry Context ────────────────────────────────────

/**
 * Optional telemetry context for Presenter event emission.
 * Keeps the fast path (no telemetry) at zero overhead.
 * @internal
 */
export interface PostProcessTelemetry {
    readonly sink: TelemetrySink;
    readonly tool: string;
    readonly action: string;
}

const _encoder = new TextEncoder();

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
 * @param telemetry - Optional telemetry context for Presenter events
 * @returns A valid MCP ToolResponse
 *
 * @internal
 */
export function postProcessResult(
    result: unknown,
    presenter: Presenter<unknown> | undefined,
    ctx?: unknown,
    selectFields?: string[],
    telemetry?: PostProcessTelemetry,
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
        // Measure raw data size for telemetry
        const rawJson = telemetry ? JSON.stringify(result) : undefined;
        const rawBytes = rawJson ? _encoder.encode(rawJson).byteLength : 0;
        const rawRows = Array.isArray(result) ? result.length : 1;

        const response = presenter.make(result, ctx, selectFields).build();

        // Emit presenter.slice and presenter.rules events
        if (telemetry) {
            // Measure wire bytes from the built response
            let wireBytes = 0;
            for (const c of response.content) {
                if ('text' in c && typeof c.text === 'string') {
                    wireBytes += _encoder.encode(c.text).byteLength;
                }
            }
            // Count wire rows from the response data (estimate from wire data)
            const wireRows = rawRows; // Same as raw when no agentLimit truncation

            telemetry.sink({
                type: 'presenter.slice',
                tool: telemetry.tool,
                action: telemetry.action,
                rawBytes,
                wireBytes,
                rowsRaw: rawRows,
                rowsWire: wireRows,
                timestamp: Date.now(),
            } as any);

            // Extract rules from the response (system rules are in text content blocks)
            const rules = presenter.getCompiledRules?.(result, ctx);
            if (rules && rules.length > 0) {
                telemetry.sink({
                    type: 'presenter.rules',
                    tool: telemetry.tool,
                    action: telemetry.action,
                    rules,
                    timestamp: Date.now(),
                } as any);
            }
        }

        return response;
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
