/**
 * HydrationSandbox — Test Suite
 *
 * Tests the structured hydration deadline for prompt handlers.
 * Covers: timeout, early completion, handler errors, timer cleanup,
 * registry integration, per-prompt override, and backward compatibility.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWithHydrationDeadline } from '../../src/prompt/HydrationSandbox.js';
import { definePrompt } from '../../src/prompt/definePrompt.js';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.js';
import { type PromptResult, type PromptMessagePayload } from '../../src/prompt/types.js';

// ── Helpers ──────────────────────────────────────────────

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function textOf(result: PromptResult): string {
    const first = result.messages[0];
    return first?.content?.type === 'text' ? first.content.text : '';
}

function makeResult(text: string): PromptResult {
    return {
        messages: [{ role: 'user', content: { type: 'text', text } }],
    };
}

// ═════════════════════════════════════════════════════════
// UNIT TESTS: runWithHydrationDeadline
// ═════════════════════════════════════════════════════════

describe('HydrationSandbox — runWithHydrationDeadline', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('should return handler result when handler completes before deadline', async () => {
        const handler = async () => makeResult('success');

        const promise = runWithHydrationDeadline(handler, 5000);
        await vi.advanceTimersByTimeAsync(0);

        const result = await promise;
        expect(textOf(result)).toBe('success');
    });

    it('should return TIMEOUT alert when handler exceeds deadline', async () => {
        const handler = async () => {
            await delay(10_000);
            return makeResult('should not reach');
        };

        const promise = runWithHydrationDeadline(handler, 100);
        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;
        expect(textOf(result)).toContain('<hydration_alert>');
        expect(textOf(result)).toContain('<status>TIMEOUT</status>');
        expect(textOf(result)).toContain('0.1s');
        expect(textOf(result)).toContain('<guidance>');
    });

    it('should return ERROR alert when handler throws before deadline', async () => {
        const handler = async () => {
            throw new Error('Jira API returned 500');
        };

        const promise = runWithHydrationDeadline(handler, 5000);
        await vi.advanceTimersByTimeAsync(0);

        const result = await promise;
        expect(textOf(result)).toContain('<hydration_alert>');
        expect(textOf(result)).toContain('<status>ERROR</status>');
        expect(textOf(result)).toContain('Jira API returned 500');
    });

    it('should return ERROR alert for non-Error throws', async () => {
        const handler = async (): Promise<PromptResult> => {
            throw 'raw string error'; // eslint-disable-line no-throw-literal
        };

        const promise = runWithHydrationDeadline(handler, 5000);
        await vi.advanceTimersByTimeAsync(0);

        const result = await promise;
        expect(textOf(result)).toContain('<status>ERROR</status>');
        expect(textOf(result)).toContain('raw string error');
    });

    it('should clean up timer when handler completes first', async () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

        const handler = async () => makeResult('fast');

        const promise = runWithHydrationDeadline(handler, 5000);
        await vi.advanceTimersByTimeAsync(0);
        await promise;

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    it('should clean up timer even when handler throws', async () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

        const handler = async (): Promise<PromptResult> => {
            throw new Error('crash');
        };

        const promise = runWithHydrationDeadline(handler, 5000);
        await vi.advanceTimersByTimeAsync(0);
        await promise;

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    it('should format deadline in seconds with one decimal', async () => {
        const handler = async () => {
            await delay(10_000);
            return makeResult('never');
        };

        const promise = runWithHydrationDeadline(handler, 3000);
        await vi.advanceTimersByTimeAsync(3000);

        const result = await promise;
        expect(textOf(result)).toContain('3.0s');
        expect(textOf(result)).toContain('<deadline_ms>3000</deadline_ms>');
    });

    it('should include recovery guidance in TIMEOUT alert', async () => {
        const handler = async () => {
            await delay(10_000);
            return makeResult('never');
        };

        const promise = runWithHydrationDeadline(handler, 100);
        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;
        expect(textOf(result)).toContain('Proceed with the conversation');
        expect(textOf(result)).toContain('Do NOT retry the same prompt automatically');
    });
});

// ═════════════════════════════════════════════════════════
// INTEGRATION TESTS: definePrompt + PromptRegistry
// ═════════════════════════════════════════════════════════

describe('HydrationSandbox — definePrompt integration', () => {
    it('should store hydrationTimeout on the builder', () => {
        const prompt = definePrompt<void>('test', {
            hydrationTimeout: 3000,
            handler: async () => makeResult('test'),
        });

        expect(prompt.getHydrationTimeout()).toBe(3000);
    });

    it('should return undefined when no hydrationTimeout is set', () => {
        const prompt = definePrompt<void>('test', {
            handler: async () => makeResult('test'),
        });

        expect(prompt.getHydrationTimeout()).toBeUndefined();
    });
});

describe('HydrationSandbox — PromptRegistry integration', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('should apply per-prompt hydrationTimeout via routeGet', async () => {
        const registry = new PromptRegistry<void>();
        const prompt = definePrompt<void>('slow', {
            hydrationTimeout: 50,
            handler: async () => {
                await delay(5000);
                return makeResult('too slow');
            },
        });
        registry.register(prompt);

        const promise = registry.routeGet(undefined as void, 'slow', {});
        await vi.advanceTimersByTimeAsync(50);

        const result = await promise;
        expect(textOf(result)).toContain('<status>TIMEOUT</status>');
    });

    it('should apply registry default when prompt has no timeout', async () => {
        const registry = new PromptRegistry<void>();
        registry.setDefaultHydrationTimeout(80);

        const prompt = definePrompt<void>('inherited', {
            handler: async () => {
                await delay(5000);
                return makeResult('too slow');
            },
        });
        registry.register(prompt);

        const promise = registry.routeGet(undefined as void, 'inherited', {});
        await vi.advanceTimersByTimeAsync(80);

        const result = await promise;
        expect(textOf(result)).toContain('<status>TIMEOUT</status>');
    });

    it('should prefer per-prompt timeout over registry default', async () => {
        const registry = new PromptRegistry<void>();
        registry.setDefaultHydrationTimeout(5000);

        const prompt = definePrompt<void>('strict_prompt', {
            hydrationTimeout: 30,
            handler: async () => {
                await delay(5000);
                return makeResult('too slow');
            },
        });
        registry.register(prompt);

        const promise = registry.routeGet(undefined as void, 'strict_prompt', {});
        await vi.advanceTimersByTimeAsync(30);

        const result = await promise;
        expect(textOf(result)).toContain('<status>TIMEOUT</status>');
    });

    it('should NOT apply timeout when neither prompt nor registry sets one', async () => {
        const registry = new PromptRegistry<void>();
        const prompt = definePrompt<void>('no_timeout', {
            handler: async () => makeResult('instant'),
        });
        registry.register(prompt);

        const promise = registry.routeGet(undefined as void, 'no_timeout', {});
        await vi.advanceTimersByTimeAsync(0);

        const result = await promise;
        expect(textOf(result)).toBe('instant');
    });

    it('should return handler result when handler completes within deadline', async () => {
        const registry = new PromptRegistry<void>();
        const prompt = definePrompt<void>('fast_prompt', {
            hydrationTimeout: 5000,
            handler: async () => makeResult('success'),
        });
        registry.register(prompt);

        const promise = registry.routeGet(undefined as void, 'fast_prompt', {});
        await vi.advanceTimersByTimeAsync(0);

        const result = await promise;
        expect(textOf(result)).toBe('success');
    });

    it('should catch handler errors via registry routeGet', async () => {
        const registry = new PromptRegistry<void>();
        const prompt = definePrompt<void>('crashing', {
            hydrationTimeout: 5000,
            handler: async () => {
                throw new Error('Database connection refused');
            },
        });
        registry.register(prompt);

        const promise = registry.routeGet(undefined as void, 'crashing', {});
        await vi.advanceTimersByTimeAsync(0);

        const result = await promise;
        expect(textOf(result)).toContain('<status>ERROR</status>');
        expect(textOf(result)).toContain('Database connection refused');
    });

    it('should still run interceptors after hydration timeout', async () => {
        const registry = new PromptRegistry<void>();

        registry.useInterceptor(async (_ctx, builder) => {
            builder.appendUser('--- Compliance Footer ---');
        });

        const prompt = definePrompt<void>('intercepted', {
            hydrationTimeout: 50,
            handler: async () => {
                await delay(10_000);
                return makeResult('too slow');
            },
        });
        registry.register(prompt);

        const promise = registry.routeGet(undefined as void, 'intercepted', {});
        await vi.advanceTimersByTimeAsync(50);

        const result = await promise;
        expect(textOf(result)).toContain('<hydration_alert>');
        expect(result.messages.length).toBe(2);
        const lastMsg = result.messages[1] as PromptMessagePayload;
        expect(lastMsg.content.type === 'text' && lastMsg.content.text).toBe('--- Compliance Footer ---');
    });
});
