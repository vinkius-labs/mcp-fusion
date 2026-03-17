/**
 * TelemetryCollector — Presenter Telemetry Emission
 *
 * Extracted from PostProcessor to uphold SRP.
 * Emits `presenter.slice`, `presenter.rules`, and `dlp.redact` events
 * with zero coupling to the post-processing priority logic.
 *
 * @internal
 * @module
 */
import { type ToolResponse } from '../core/response.js';
import { type Presenter } from './Presenter.js';
import { type TelemetrySink } from '../observability/TelemetryEvent.js';

// ── Shared Encoder ──────────────────────────────────────

const _encoder = new TextEncoder();

// ── Types ───────────────────────────────────────────────

/**
 * Options for emitting Presenter telemetry events.
 * @internal
 */
export interface PresenterTelemetryOpts {
    /** Telemetry sink to emit events to */
    readonly sink: TelemetrySink;
    /** Tool name (e.g. 'billing.invoice') */
    readonly tool: string;
    /** Action name (e.g. 'get') */
    readonly action: string;
    /** Built MCP ToolResponse */
    readonly response: ToolResponse;
    /** The Presenter that produced the response */
    readonly presenter: Presenter<unknown>;
    /** Pre-serialized raw JSON (before Presenter processing) */
    readonly rawJson: string;
    /** Number of raw data rows (1 for single item, array length for collections) */
    readonly rawRows: number;
    /** Optional _select field names for context window optimization */
    readonly selectFields?: string[] | undefined;
}

// ── Main Emitter ────────────────────────────────────────

/**
 * Emit all Presenter telemetry events for a single post-processing cycle.
 *
 * Emits up to 3 events:
 * 1. `presenter.slice` — raw vs wire bytes, rows, selectFields, guardrail info
 * 2. `presenter.rules` — extracted rule strings from `<domain_rules>` XML
 * 3. `dlp.redact` — PII redaction path count and list
 *
 * @param opts - Telemetry emission options
 * @internal
 */
export function emitPresenterTelemetry(opts: PresenterTelemetryOpts): void {
    const { sink, tool, action, response, presenter, rawJson, rawRows, selectFields } = opts;

    // ── 1. presenter.slice ──────────────────────────────
    const rawBytes = _encoder.encode(rawJson).byteLength;

    let wireBytes = 0;
    for (const c of response.content) {
        if ('text' in c && typeof c.text === 'string') {
            wireBytes += _encoder.encode(c.text).byteLength;
        }
    }

    const agentLimitMax = presenter.getAgentLimitMax();
    const wireRows = (agentLimitMax !== undefined && rawRows > agentLimitMax)
        ? agentLimitMax
        : rawRows;

    sink({
        type: 'presenter.slice',
        tool,
        action,
        rawBytes,
        wireBytes,
        rowsRaw: rawRows,
        rowsWire: wireRows,
        ...(selectFields && selectFields.length > 0 ? {
            selectFields,
            totalFields: presenter.getSchemaKeys().length || undefined,
        } : {}),
        ...(agentLimitMax !== undefined && rawRows > agentLimitMax ? {
            guardrailFrom: rawRows,
            guardrailTo: agentLimitMax,
            guardrailHint: 'Results truncated by agentLimit. Use pagination or filters.',
        } : {}),
        timestamp: Date.now(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
    } as any);

    // ── 2. presenter.rules ──────────────────────────────
    const rulesFromResponse: string[] = [];
    for (const c of response.content) {
        if ('text' in c && typeof c.text === 'string') {
            const match = c.text.match(/<domain_rules>\n([\s\S]*?)\n<\/domain_rules>/);
            if (match) {
                rulesFromResponse.push(
                    ...match[1]!.split('\n').filter(Boolean).map(r => r.replace(/^- /, '')),
                );
            }
        }
    }
    if (rulesFromResponse.length > 0) {
        sink({
            type: 'presenter.rules',
            tool,
            action,
            rules: rulesFromResponse,
            timestamp: Date.now(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
        } as any);
    }

    // ── 3. dlp.redact ───────────────────────────────────
    const redactPaths = presenter.getRedactPaths();
    if (redactPaths.length > 0) {
        sink({
            type: 'dlp.redact',
            tool,
            action,
            fieldsRedacted: redactPaths.length,
            paths: [...redactPaths],
            timestamp: Date.now(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — TelemetrySink accepts extensible event shapes
        } as any);
    }
}
