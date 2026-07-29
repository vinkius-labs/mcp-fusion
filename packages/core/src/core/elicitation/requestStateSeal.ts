/**
 * Request State Sealing — MCP 2026-07-28 SEP-2322
 *
 * Provides `sealRequestState()` for handlers to mint HMAC-SHA256-sealed
 * `requestState` tokens for multi-round elicitation flows. The SDK v2
 * `Server` verifies the seal automatically before re-entering the handler.
 *
 * The codec is created by `startServer({ requestStateKey })` and stored in
 * a module-level variable. When no key is configured, `sealRequestState()`
 * returns the payload as a plain JSON string (no sealing — only safe for
 * non-sensitive state in trusted environments).
 *
 * @module
 */
import type { RequestStateCodec } from '@modelcontextprotocol/server';

let _codec: RequestStateCodec | undefined;

/** @internal — called by startServer when requestStateKey is provided. */
export function _setRequestStateCodec(codec: RequestStateCodec | undefined): void {
    _codec = codec;
}

/**
 * Seal a payload into an opaque `requestState` string for `requireInput()`.
 *
 * When `requestStateKey` was provided to `startServer()`, this uses the
 * HMAC-SHA256 codec from the SDK v2 — the seal includes an expiry and is
 * verified by the SDK before handler re-entry.
 *
 * When no key was configured, the payload is JSON-stringified without
 * sealing (untrusted — only for non-sensitive state).
 *
 * @param payload - JSON-serializable state to seal
 * @returns Opaque string to pass as `requestState` in `requireInput()`
 *
 * @example
 * ```typescript
 * import { requireInput, readInput, sealRequestState, readRequestState } from '@mcpfusion/core';
 *
 * .handle(async () => {
 *     const state = readRequestState<{ step: string }>();
 *     if (!state) {
 *         return requireInput({
 *             inputRequests: { form: requireInput.elicit('Step 1:', { x: ask.string('X') }) },
 *             requestState: await sealRequestState({ step: 'phase-2' }),
 *         });
 *     }
 *     return { step: state.step };
 * })
 * ```
 */
export async function sealRequestState<T>(payload: T): Promise<string> {
    if (_codec) {
        return _codec.mint(payload);
    }
    return JSON.stringify(payload);
}