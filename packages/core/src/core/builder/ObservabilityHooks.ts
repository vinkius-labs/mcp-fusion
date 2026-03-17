/**
 * ObservabilityHooks — Pipeline hook factories for GroupedToolBuilder
 *
 * Extracted from GroupedToolBuilder to adhere to the Single Responsibility
 * Principle. Each factory creates a {@link PipelineHooks} object that
 * instruments the execution pipeline for a specific observability concern:
 *
 * - **Debug**: Lightweight structured event emission via `DebugObserverFn`
 * - **Tracing**: OpenTelemetry-compatible span creation via `VurbTracer`
 * - **Telemetry**: Shadow Socket IPC emission for the Inspector TUI
 *
 * @module
 */
import { type ToolResponse } from '../types.js';
import { type DebugObserverFn } from '../../observability/DebugObserver.js';
import { type TelemetrySink } from '../../observability/TelemetryEvent.js';
import { type VurbTracer, SpanStatusCode } from '../../observability/Tracing.js';
import { computeResponseSize, type PipelineHooks } from '../execution/PipelineHooks.js';
import { toErrorMessage } from '../ErrorUtils.js';

// ── Context passed from GroupedToolBuilder ────────────────

/**
 * Minimal data needed by hook factories.
 * Avoids coupling to the full GroupedToolBuilder class.
 */
export interface HookContext {
    readonly name: string;
    readonly tags: readonly string[];
    readonly description?: string | undefined;
}

// ── Debug Hooks ──────────────────────────────────────────

/**
 * Build debug hooks: lightweight event emission.
 *
 * Emits structured {@link DebugEvent} objects at each pipeline step.
 * Captures per-call duration and error classification.
 *
 * @param debug - Observer function from `createDebugObserver()`
 * @param ctx - Tool metadata (name, tags, description)
 */
export function buildDebugHooks(debug: DebugObserverFn, ctx: HookContext): PipelineHooks {
    const toolName = ctx.name;
    const startTime = performance.now();

    return {
        onRouteError: () => {
            debug({ type: 'error', tool: toolName, action: '?', error: 'Missing discriminator', step: 'route', timestamp: Date.now() });
        },
        onRouteOk: (action) => {
            debug({ type: 'route', tool: toolName, action, timestamp: Date.now() });
        },
        onResolveError: (action) => {
            debug({ type: 'error', tool: toolName, action, error: `Unknown action "${action}"`, step: 'route', timestamp: Date.now() });
        },
        onValidateError: (action, durationMs) => {
            debug({ type: 'validate', tool: toolName, action, valid: false, error: 'Validation failed', durationMs, timestamp: Date.now() });
        },
        onValidateOk: (action, durationMs) => {
            debug({ type: 'validate', tool: toolName, action, valid: true, durationMs, timestamp: Date.now() });
        },
        onMiddleware: (action, chainLength) => {
            debug({ type: 'middleware', tool: toolName, action, chainLength, timestamp: Date.now() });
        },
        onExecuteOk: (action, response) => {
            const isErr = response.isError === true;
            debug({ type: 'execute', tool: toolName, action, durationMs: performance.now() - startTime, isError: isErr, timestamp: Date.now() });
        },
        onExecuteError: (action, err) => {
            const message = toErrorMessage(err);
            debug({ type: 'error', tool: toolName, action, error: message, step: 'execute', timestamp: Date.now() });
        },
    };
}

// ── Traced Hooks ─────────────────────────────────────────

/**
 * Build traced hooks: OpenTelemetry-compatible span creation.
 *
 * Creates ONE span per tool call with events for pipeline steps.
 * Uses wrapResponse for leak-proof span closure.
 * AI errors → UNSET, system errors → ERROR.
 *
 * @param tracer - A {@link VurbTracer} instance (or OTel Tracer)
 * @param ctx - Tool metadata
 */
export function buildTracedHooks(tracer: VurbTracer, ctx: HookContext): PipelineHooks {
    const startAttrs: Record<string, string | number | boolean | ReadonlyArray<string>> = {
        'mcp.system': 'vurb',
        'mcp.tool': ctx.name,
    };
    if (ctx.tags.length > 0) startAttrs['mcp.tags'] = ctx.tags;
    if (ctx.description) startAttrs['mcp.description'] = ctx.description;

    const span = tracer.startSpan(`mcp.tool.${ctx.name}`, { attributes: startAttrs });
    const startTime = performance.now();
    let statusCode: number = SpanStatusCode.UNSET;
    let statusMessage: string | undefined;

    const finalizeSpan = (response?: ToolResponse) => {
        span.setAttribute('mcp.durationMs', performance.now() - startTime);
        if (response) {
            span.setAttribute('mcp.response_size', computeResponseSize(response));
        }
        span.setStatus(
            statusMessage !== undefined
                ? { code: statusCode, message: statusMessage }
                : { code: statusCode },
        );
        span.end();
    };

    return {
        rethrow: true,
        onRouteError: () => {
            span.setAttribute('mcp.error_type', 'missing_discriminator');
            span.setAttribute('mcp.isError', true);
        },
        onRouteOk: (action) => {
            span.setAttribute('mcp.action', action);
            span.addEvent?.('mcp.route');
        },
        onResolveError: () => {
            span.setAttribute('mcp.error_type', 'unknown_action');
            span.setAttribute('mcp.isError', true);
        },
        onValidateError: (_action, durationMs) => {
            span.setAttribute('mcp.error_type', 'validation_failed');
            span.setAttribute('mcp.isError', true);
            span.addEvent?.('mcp.validate', { 'mcp.valid': false, 'mcp.durationMs': durationMs });
        },
        onValidateOk: (_action, durationMs) => {
            span.addEvent?.('mcp.validate', { 'mcp.valid': true, 'mcp.durationMs': durationMs });
        },
        onMiddleware: (_action, chainLength) => {
            span.addEvent?.('mcp.middleware', { 'mcp.chainLength': chainLength });
        },
        onExecuteOk: (_action, response) => {
            const isErr = response.isError === true;
            statusCode = isErr ? SpanStatusCode.UNSET : SpanStatusCode.OK;
            if (isErr) span.setAttribute('mcp.error_type', 'handler_returned_error');
            span.setAttribute('mcp.isError', isErr);
        },
        onExecuteError: (_action, err) => {
            const message = toErrorMessage(err);
            span.recordException(err instanceof Error ? err : message);
            span.setAttribute('mcp.error_type', 'system_error');
            span.setAttribute('mcp.isError', true);
            statusCode = SpanStatusCode.ERROR;
            statusMessage = message;
        },
        wrapResponse: (response) => {
            finalizeSpan(response);
            return response;
        },
    };
}

// ── Telemetry Hooks ──────────────────────────────────────

/**
 * Build telemetry hooks: Shadow Socket event emission for Inspector TUI.
 *
 * Emits `validate`, `middleware`, and `execute` TelemetryEvents
 * to the IPC sink so that `vurb inspect` shows real pipeline data.
 *
 * @param emit - TelemetrySink IPC function
 * @param ctx - Tool metadata
 */
export function buildTelemetryHooks(emit: TelemetrySink, ctx: HookContext): PipelineHooks {
    const toolName = ctx.name;
    const startTime = performance.now();

    return {
        onValidateError: (action, durationMs) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
            emit({ type: 'validate', tool: toolName, action, valid: false, error: 'Validation failed', durationMs, timestamp: Date.now() } as any);
        },
        onValidateOk: (action, durationMs) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
            emit({ type: 'validate', tool: toolName, action, valid: true, durationMs, timestamp: Date.now() } as any);
        },
        onMiddleware: (action, chainLength) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
            emit({ type: 'middleware', tool: toolName, action, chainLength, timestamp: Date.now() } as any);
        },
        onExecuteOk: (action, response) => {
            const isErr = response.isError === true;

            // Extract recovery data from error responses
            let recovery: string | undefined;
            let recoveryActions: string[] | undefined;
            if (isErr && response.content.length > 0) {
                const text = response.content[0]!.text;
                recovery = extractXmlTag(text, 'recovery');
                recoveryActions = extractXmlActions(text);
            }

            emit({
                type: 'execute', tool: toolName, action,
                durationMs: performance.now() - startTime,
                isError: isErr,
                ...(recovery ? { recovery } : {}),
                ...(recoveryActions && recoveryActions.length > 0 ? { recoveryActions } : {}),
                timestamp: Date.now(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
            } as any);
        },
        onExecuteError: (action, err) => {
            const message = toErrorMessage(err);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
            emit({ type: 'error', tool: toolName, action, error: message, step: 'execute', timestamp: Date.now() } as any);
        },
    };
}

// ── XML Extraction Helpers (Telemetry) ───────────────────

/**
 * Extract content from a simple XML tag.
 * @example extractXmlTag('<recovery>Fix X</recovery>', 'recovery') → 'Fix X'
 * @internal
 */
function extractXmlTag(text: string, tag: string): string | undefined {
    const re = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const m = re.exec(text);
    return m?.[1]?.trim() || undefined;
}

/**
 * Extract `<action>` elements from `<available_actions>` block.
 * @internal
 */
function extractXmlActions(text: string): string[] | undefined {
    const block = extractXmlTag(text, 'available_actions');
    if (!block) return undefined;
    const actions: string[] = [];
    const re = /<action>(.*?)<\/action>/gs;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
        const v = m[1]?.trim();
        if (v) actions.push(v);
    }
    // If no individual <action> tags, the content might be a comma/space list
    if (actions.length === 0 && block.trim().length > 0) {
        actions.push(...block.split(/[,\s]+/).filter(Boolean));
    }
    return actions.length > 0 ? actions : undefined;
}
