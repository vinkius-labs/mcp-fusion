/**
 * Elicitation Runtime — Era-Agnostic Driver
 *
 * Bridges the return-based {@link requireInput} authoring model onto the
 * transport available at runtime, so the same handler works on both eras:
 *
 *  - **2025 era / v1 SDK** — a live `sendRequest` channel exists. The framework
 *    fulfills each requested input over that channel and re-enters the handler
 *    with the collected answers (it plays the role the 2026 SDK shim plays).
 *  - **No channel** (stateless JSON HTTP without a 2026 client driver) — the
 *    handler's input request is refused cleanly instead of hanging.
 *
 * Non-interactive tools incur zero added overhead (no extra ALS wrap
 * on the first pass).
 *
 * @module
 */
import { toolError, type ToolResponse } from '../response.js';
import type { ElicitSink } from './types.js';
import {
    isInputRequiredResponse,
    _inputResponsesStore,
    type InputRuntimeContext,
    type RawInputResult,
} from './requireInput.js';

/** Options for {@link runWithElicitation}. */
export interface ElicitationRuntimeOptions {
    /**
     * Maximum handler re-entries before failing an interactive flow.
     * Matches the SDK legacy-shim default.
     * @default 8
     */
    readonly maxRounds?: number;
}

/**
 * Execute a handler with elicitation support.
 *
 * @param exec       - The handler execution thunk (returns a ToolResponse).
 * @param elicitSink - The bidirectional request channel, when available.
 * @param options    - Round-limit configuration.
 * @returns The handler's terminal (non-input-required) response.
 */
export async function runWithElicitation(
    exec: () => Promise<ToolResponse>,
    elicitSink: ElicitSink | undefined,
    options?: ElicitationRuntimeOptions,
): Promise<ToolResponse> {
    const maxRounds = options?.maxRounds ?? 8;

    // Run `exec`, optionally binding the collected answers on re-entry.
    // `inputCtx === undefined` on the first pass keeps the hot path identical
    // to the pre-existing behavior (no input-store wrap).
    const runExec = (inputCtx: InputRuntimeContext | undefined): Promise<ToolResponse> => {
        return inputCtx ? _inputResponsesStore.run(inputCtx, exec) : exec();
    };

    let round = 0;
    let result = await runExec(undefined);

    while (isInputRequiredResponse(result)) {
        // Handler requested input but there is no channel to collect it.
        if (!elicitSink) {
            return toolError('ELICITATION_UNSUPPORTED', {
                message: 'This tool requires interactive input, but the current connection has no channel to collect it.',
                suggestion: 'Use a client that supports MCP elicitation, or pass the required values as tool arguments.',
                severity: 'error',
            });
        }

        if (++round > maxRounds) {
            return toolError('ELICITATION_ROUNDS_EXCEEDED', {
                message: `Interactive input exceeded ${maxRounds} rounds without completing.`,
                suggestion: 'Provide the requested values or simplify the request.',
                severity: 'error',
            });
        }

        // Fulfill each requested input over the live channel (2025 era).
        const responses: Record<string, RawInputResult> = {};
        for (const [key, req] of Object.entries(result.inputRequests)) {
            const params = req.type === 'url'
                ? { message: req.message, url: req.url }
                : { message: req.message, requestedSchema: req.schema };
            const raw = (await elicitSink({ method: 'elicitation/create', params })) as RawInputResult | undefined;
            responses[key] = raw ?? { action: 'cancel' };
        }

        result = await runExec({
            responses,
            ...(result.requestState !== undefined ? { requestState: result.requestState } : {}),
        });
    }

    return result;
}
