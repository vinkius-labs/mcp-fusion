/**
 * HydrationSandbox — Structured Deadline for Prompt Server-Side Hydration
 *
 * When a user invokes `/morning_briefing`, the prompt handler performs
 * server-side hydration: fetching Jira tickets, Stripe invoices, database
 * queries. If any external source hangs (15s Jira timeout, API 500),
 * the user stares at a frozen UI.
 *
 * This sandbox wraps the handler in a strict `Promise.race` deadline:
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │  Promise.race([                                 │
 *   │    handler(ctx, args),     ← the real work      │
 *   │    deadlinePromise(3s),   ← the safety net      │
 *   │  ])                                             │
 *   │                                                 │
 *   │  Winner:                                        │
 *   │    handler  → return result (happy path)        │
 *   │    deadline → return SYSTEM ALERT (graceful)    │
 *   │    handler throws → return ERROR ALERT (catch)  │
 *   └─────────────────────────────────────────────────┘
 *
 * Three guarantees:
 *   1. The UI unblocks within `deadlineMs` — always.
 *   2. Handler errors become graceful alerts, not -32603 crashes.
 *   3. Timers are cleaned via `finally` — no resource leaks.
 *
 * Design influenced by:
 *   - Go's `context.WithDeadline` (structured cancellation)
 *   - gRPC deadline propagation (strict, per-call)
 *   - Resilience4j's TimeLimiter (JVM circuit breaker pattern)
 *
 * @module
 * @internal
 */

import { type PromptResult } from './types.js';

// ── Alert Formatters ─────────────────────────────────────

/**
 * Build an XML-structured SYSTEM ALERT for the LLM.
 *
 * Uses XML semantic boundaries so the LLM can parse the
 * alert deterministically — same pattern as our self-healing
 * tool errors (`<tool_error>`, `<validation_error>`).
 */
function formatHydrationAlert(
    status: 'TIMEOUT' | 'ERROR',
    deadlineMs: number,
    errorMessage?: string,
): string {
    const parts: string[] = ['<hydration_alert>'];

    parts.push(`  <status>${status}</status>`);
    parts.push(`  <deadline_ms>${deadlineMs}</deadline_ms>`);

    if (status === 'TIMEOUT') {
        parts.push(
            `  <message>Prompt hydration did not complete within ${(deadlineMs / 1000).toFixed(1)}s. ` +
            `External data sources (APIs, databases) did not respond within the deadline.</message>`,
        );
    } else {
        parts.push(
            `  <message>Prompt hydration failed: ${errorMessage ?? 'Unknown error'}.</message>`,
        );
    }

    parts.push(
        '  <guidance>Proceed with the conversation using available context. ' +
        'The user\'s request is still valid — answer with your general knowledge ' +
        'and inform the user that live data could not be fetched at this time. ' +
        'Do NOT retry the same prompt automatically.</guidance>',
    );

    parts.push('</hydration_alert>');
    return parts.join('\n');
}

/**
 * Wrap a hydration alert as a valid `PromptResult`.
 *
 * Returns a single `user` message with the XML alert.
 * MCP `PromptMessage` only supports `user`|`assistant` roles.
 */
function alertAsPromptResult(
    status: 'TIMEOUT' | 'ERROR',
    deadlineMs: number,
    errorMessage?: string,
): PromptResult {
    return {
        messages: [{
            role: 'user',
            content: {
                type: 'text',
                text: formatHydrationAlert(status, deadlineMs, errorMessage),
            },
        }],
    };
}

// ── Sandbox Execution ────────────────────────────────────

/**
 * Execute a prompt hydration function within a strict deadline.
 *
 * Uses `Promise.race` between the handler and a timeout promise.
 * Three scenarios:
 *
 * 1. **Handler wins** (completes before deadline) → returns result
 * 2. **Deadline wins** (handler too slow) → returns TIMEOUT alert
 * 3. **Handler throws** (API error, crash) → returns ERROR alert
 *
 * In ALL cases, the caller receives a valid `PromptResult`.
 * The UI never freezes. The user never sees `-32603`.
 *
 * @param fn - The prompt hydration function to execute
 * @param deadlineMs - Maximum time in milliseconds (must be > 0)
 * @returns Always returns a valid PromptResult
 */
export async function runWithHydrationDeadline(
    fn: () => Promise<PromptResult>,
    deadlineMs: number,
): Promise<PromptResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Deadline promise: resolves with TIMEOUT alert after deadline
    const deadlinePromise = new Promise<PromptResult>((resolve) => {
        timer = setTimeout(() => {
            resolve(alertAsPromptResult('TIMEOUT', deadlineMs));
        }, deadlineMs);
    });

    // Handler promise: wraps fn() to catch errors → ERROR alert
    const handlerPromise = fn().catch((err): PromptResult => {
        const message = err instanceof Error ? err.message : String(err);
        return alertAsPromptResult('ERROR', deadlineMs, message);
    });

    try {
        // First to finish wins. UI unblocks immediately.
        return await Promise.race([handlerPromise, deadlinePromise]);
    } finally {
        // Always clean up the timer — prevents resource leaks
        // and keeps Node.js from staying alive unnecessarily.
        if (timer !== undefined) clearTimeout(timer);
    }
}
