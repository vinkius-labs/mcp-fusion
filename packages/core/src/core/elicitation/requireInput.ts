/**
 * requireInput — Return-Based Elicitation (2026-07-28 native model)
 *
 * The stateless MCP protocol (2026-07-28) removes the server→client request
 * channel. Instead of `await ask(...)` mid-handler, a handler **returns**
 * `requireInput({...})` to declare the input it needs. The client gathers the
 * answers and re-issues the original call; on that retry the handler reads the
 * answers with {@link readInput} / {@link inputResponse}.
 *
 * This is the migration target for the deprecated {@link ask}. The same
 * handler shape works on both protocol eras:
 *  - **2025 era / v1 SDK** — the framework drives the round-trips over the
 *    live `sendRequest` channel and re-enters the handler (see `runtime.ts`).
 *  - **2026 era / v2 SDK** — the framework emits the native `inputRequired`
 *    result and the client/SDK drives the retry.
 *
 * The field DSL is the existing `ask.*` descriptors — nothing new to learn.
 *
 * @example
 * ```typescript
 * import { f, ask, requireInput, readInput } from '@mcpfusion/core';
 *
 * export default f.mutation('infra.deploy')
 *     .withString('app_id', 'Application ID')
 *     .interactive()
 *     .handle(async (input) => {
 *         const answers = readInput<{ region: string; confirm: boolean }>('deploy');
 *
 *         // First call — no answers yet: request them.
 *         if (!answers) {
 *             return requireInput({
 *                 inputRequests: {
 *                     deploy: requireInput.elicit('Confirm deployment:', {
 *                         region:  ask.enum(['us-east-1', 'eu-west-1'] as const, 'Region'),
 *                         confirm: ask.boolean('I confirm this deployment'),
 *                     }),
 *                 },
 *             });
 *         }
 *
 *         // Re-entry — answers present.
 *         if (!answers.confirm) return f.error('CANCELLED', 'Aborted');
 *         return { region: answers.region };
 *     });
 * ```
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { TOOL_RESPONSE_BRAND, type ToolResponse } from '../response.js';
import { compileAskFields } from './ask.js';
import type { AskField, JsonSchemaProperty } from './types.js';

// ── Wire Shapes ──────────────────────────────────────────

/**
 * Compiled JSON Schema object for an elicitation form.
 * Mirrors the MCP `requestedSchema` (2025) / `schema` (2026) shape.
 */
export interface ElicitationSchema {
    readonly type: 'object';
    readonly properties: Record<string, JsonSchemaProperty>;
    readonly required: string[];
}

/** A request for structured form input (elicitation). */
export interface ElicitationInputRequest {
    readonly type: 'elicitation';
    readonly message: string;
    readonly schema: ElicitationSchema;
}

/** A request to redirect the user to an external URL (OAuth, payment, etc.). */
export interface UrlInputRequest {
    readonly type: 'url';
    readonly message: string;
    readonly url: string;
}

/** A single input request keyed inside {@link InputRequiredResponse.inputRequests}. */
export type InputRequest = ElicitationInputRequest | UrlInputRequest;

// ── Discriminated Response ───────────────────────────────

/**
 * Discriminated response returned by {@link requireInput}.
 *
 * Detected by `ServerAttachment` (via {@link isInputRequiredResponse}) and
 * fulfilled per protocol era instead of being forwarded to the LLM as data.
 * Follows the same interception pattern as `HandoffResponse`.
 */
export interface InputRequiredResponse {
    readonly _MCPFUSION_inputRequired: true;
    readonly isInputRequired: true;
    /** The input requests the handler needs answered before it can complete. */
    readonly inputRequests: Record<string, InputRequest>;
    /**
     * Opaque continuation token for multi-round flows (read via {@link readRequestState}).
     * Use `sealRequestState(payload)` to mint sealed tokens when `requestStateKey`
     * is configured in `startServer()`.
     */
    readonly requestState?: string;
}

/**
 * Type-guard used by `ServerAttachment` to detect an {@link InputRequiredResponse}
 * without a hard import cycle. Mirrors `isHandoffResponse`.
 */
export function isInputRequiredResponse(v: unknown): v is InputRequiredResponse {
    if (typeof v !== 'object' || v === null) return false;
    const r = v as Record<string, unknown>;
    return r['_MCPFUSION_inputRequired'] === true && r['isInputRequired'] === true;
}

// ── Builder ──────────────────────────────────────────────

/** Options accepted by {@link requireInput}. */
export interface RequireInputSpec {
    /** Map of input key → request descriptor. Each key is read back by the same key. */
    readonly inputRequests: Record<string, InputRequest>;
    /** Optional continuation token for multi-round flows. */
    readonly requestState?: string;
}

/**
 * The `requireInput` callable + namespace.
 *
 * - `requireInput({ inputRequests, requestState? })` — build the response.
 * - `requireInput.elicit(message, fields)` — a form request from `ask.*` fields.
 * - `requireInput.url(message, url)` — an external-redirect request.
 */
export interface RequireInputFunction {
    (spec: RequireInputSpec): InputRequiredResponse;
    /**
     * Build a form-input request from `ask.*` field descriptors.
     * @param message - Human-readable prompt shown to the user
     * @param fields  - Object of `ask.*` field descriptors
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elicit(message: string, fields: Record<string, AskField<any>>): ElicitationInputRequest;
    /**
     * Build a URL-redirect request (sensitive operations: OAuth, payment).
     * @param message - Explanation of why the redirect is needed
     * @param url     - The URL to open in the user's browser
     */
    url(message: string, url: string): UrlInputRequest;
}

/**
 * Declare the input a handler needs (2026-native, return-based elicitation).
 *
 * @see {@link readInput} / {@link inputResponse} to read the answers on re-entry.
 */
export const requireInput: RequireInputFunction = Object.assign(
    function requireInput(spec: RequireInputSpec): InputRequiredResponse {
        const resp: InputRequiredResponse = {
            _MCPFUSION_inputRequired: true,
            isInputRequired: true,
            inputRequests: spec.inputRequests,
            ...(spec.requestState !== undefined ? { requestState: spec.requestState } : {}),
        };
        // Stamp the framework brand so the execution pipeline treats this as a
        // terminal ToolResponse (skips success()-wrapping and Presenter), exactly
        // as it does for HandoffResponse.
        Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
        return resp;
    },
    {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elicit(message: string, fields: Record<string, AskField<any>>): ElicitationInputRequest {
            return { type: 'elicitation', message, schema: compileAskFields(fields) };
        },
        url(message: string, url: string): UrlInputRequest {
            return { type: 'url', message, url };
        },
    },
);

// ── Response Reading (Re-entry) ──────────────────────────

/** Raw elicitation result for a single input key. */
export interface RawInputResult {
    readonly action?: 'accept' | 'decline' | 'cancel' | string;
    readonly content?: unknown;
}

/**
 * Per-request answer context, bound via `AsyncLocalStorage` on re-entry.
 * @internal
 */
export interface InputRuntimeContext {
    readonly responses: Record<string, RawInputResult | undefined>;
    readonly requestState?: string;
}

/**
 * AsyncLocalStorage carrying the answers collected for the current call.
 * Bound by the elicitation runtime (2025 era) or the request handler (2026 era).
 * @internal
 */
export const _inputResponsesStore = new AsyncLocalStorage<InputRuntimeContext>();

/**
 * Discriminated view of a single input answer — for decline/cancel detection.
 */
export type InputResponseView =
    | { readonly kind: 'missing' }
    | { readonly kind: 'elicit'; readonly action: 'accept' | 'decline' | 'cancel'; readonly content?: unknown };

/**
 * Read the discriminated answer for `key` from the current re-entry context.
 * Returns `{ kind: 'missing' }` on the first call (before any answers exist).
 */
export function inputResponse(key: string): InputResponseView {
    const raw = _inputResponsesStore.getStore()?.responses[key];
    if (!raw) return { kind: 'missing' };
    const action = (raw.action ?? 'cancel') as 'accept' | 'decline' | 'cancel';
    return { kind: 'elicit', action, ...(raw.content !== undefined ? { content: raw.content } : {}) };
}

/**
 * Read the accepted content for `key`, or `undefined` when missing, declined,
 * or cancelled. This is the common-case reader for a single form.
 *
 * @typeParam T - Expected shape of the submitted content (unvalidated cast).
 */
export function readInput<T = Record<string, unknown>>(key: string): T | undefined {
    const view = inputResponse(key);
    return view.kind === 'elicit' && view.action === 'accept'
        ? (view.content as T)
        : undefined;
}

/**
 * Read the opaque continuation token echoed by the client on the retry.
 * `undefined` on the first call / when no state was threaded.
 */
export function readRequestState<T = string>(): T | undefined {
    return _inputResponsesStore.getStore()?.requestState as T | undefined;
}
