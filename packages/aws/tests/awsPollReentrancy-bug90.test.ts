/**
 * awsPollReentrancy-bug90.test.ts
 *
 * Regression: The setInterval polling loop in createAwsConnector
 * had no re-entrancy guard. If refresh() took longer than pollInterval,
 * concurrent iterations would race over shared state.
 *
 * After the fix, a `refreshing` boolean flag prevents overlap.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAwsConnector } from '../src/createAwsConnector.js';

// ── Slow mock adapters ─────────────────────────────────────

function createSlowLambdaAdapter(delayMs: number) {
    let callCount = 0;
    return {
        listFunctions: vi.fn(async () => {
            callCount++;
            await new Promise(r => setTimeout(r, delayMs));
            return [];
        }),
        invoke: vi.fn(async () => ({})),
        get calls() { return callCount; },
    };
}

describe('AWS Connector: polling re-entrancy guard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should NOT start a second refresh while the first is still running', async () => {
        const slowAdapter = createSlowLambdaAdapter(500); // 500ms delay

        // Use real timers briefly for the initial discovery
        vi.useRealTimers();
        const connector = await createAwsConnector({
            lambdaClient: slowAdapter as any,
            pollInterval: 100, // Poll every 100ms — much faster than 500ms discovery
        });
        vi.useFakeTimers();

        // At this point, initial discovery is done (callCount = 1)
        const initialCalls = slowAdapter.listFunctions.mock.calls.length;

        // Advance time by 100ms — triggers first polling refresh
        vi.advanceTimersByTime(100);
        // Give the async callback a chance to start
        await vi.advanceTimersByTimeAsync(0);

        // Advance another 100ms — would have triggered a second poll
        // but re-entrancy guard should prevent it
        vi.advanceTimersByTime(100);
        await vi.advanceTimersByTimeAsync(0);

        // Advance yet another 100ms
        vi.advanceTimersByTime(100);
        await vi.advanceTimersByTimeAsync(0);

        // Even after 3 intervals, only ONE new refresh should be in-flight
        // (the first poll at t=100ms), because the guard blocks re-entry
        const afterCalls = slowAdapter.listFunctions.mock.calls.length;
        // Should be at most initialCalls + 1 (one new poll started)
        expect(afterCalls).toBeLessThanOrEqual(initialCalls + 1);

        // Cleanup
        connector.stop();
    });

    it('should resume polling after a refresh completes', async () => {
        let refreshCount = 0;

        const adapter = {
            listFunctions: vi.fn(async () => {
                refreshCount++;
                return [];
            }),
            invoke: vi.fn(async () => ({})),
        };

        vi.useRealTimers();
        const connector = await createAwsConnector({
            lambdaClient: adapter as any,
            pollInterval: 50,
        });

        const initialCount = refreshCount;

        // Wait enough time for at least one polling cycle to complete
        await new Promise(r => setTimeout(r, 200));

        // At least one poll should have fired and completed
        expect(refreshCount).toBeGreaterThan(initialCount);

        connector.stop();
    });

    it('should stop polling when stop() is called', async () => {
        const adapter = {
            listFunctions: vi.fn(async () => []),
            invoke: vi.fn(async () => ({})),
        };

        vi.useRealTimers();
        const connector = await createAwsConnector({
            lambdaClient: adapter as any,
            pollInterval: 100,
        });

        const callsBefore = adapter.listFunctions.mock.calls.length;
        connector.stop();

        // Wait and confirm no more calls happened
        await new Promise(r => setTimeout(r, 300));
        expect(adapter.listFunctions.mock.calls.length).toBe(callsBefore);
    });
});
