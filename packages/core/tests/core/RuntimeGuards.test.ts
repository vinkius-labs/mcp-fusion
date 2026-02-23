/**
 * RuntimeGuards.test.ts
 *
 * Tests for Concurrency Limiter and Egress Guard.
 *
 * Validates:
 *   - ConcurrencyGuard: semaphore, backpressure queue, load shedding
 *   - ConcurrencyGuard + AbortSignal: queued waiters cancelled on abort
 *   - EgressGuard: payload truncation, system intervention message
 *   - Builder integration: .concurrency() and .maxPayloadBytes()
 *   - Zero overhead when guards are not configured
 */
import { describe, it, expect } from 'vitest';
import { createTool, success } from '../../src/core/index.js';
import { ConcurrencyGuard } from '../../src/core/execution/ConcurrencyGuard.js';
import { applyEgressGuard } from '../../src/core/execution/EgressGuard.js';
import { type ToolResponse } from '../../src/core/response.js';

// ============================================================================
// Unit Tests: ConcurrencyGuard
// ============================================================================

describe('ConcurrencyGuard: Semaphore Basics', () => {
    it('should allow up to maxActive concurrent acquisitions', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 3 });

        const r1 = guard.acquire();
        const r2 = guard.acquire();
        const r3 = guard.acquire();

        expect(r1).not.toBeNull();
        expect(r2).not.toBeNull();
        expect(r3).not.toBeNull();

        expect(guard.active).toBe(3);
        expect(guard.queued).toBe(0);
    });

    it('should release slot and allow next acquisition', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1 });

        const result = guard.acquire();
        expect(result).not.toBeNull();
        const release = await result!;
        expect(guard.active).toBe(1);

        release();
        expect(guard.active).toBe(0);

        // Should acquire again
        const result2 = guard.acquire();
        expect(result2).not.toBeNull();
        expect(guard.active).toBe(1);
    });

    it('should be idempotent on double release', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1 });

        const release = await guard.acquire()!;
        release();
        release(); // Double release

        expect(guard.active).toBe(0);
    });
});

describe('ConcurrencyGuard: Backpressure Queue', () => {
    it('should queue when maxActive is reached', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 5 });

        const release1 = await guard.acquire()!;
        expect(guard.active).toBe(1);

        // This should be queued
        let resolved = false;
        const queued = guard.acquire()!;
        queued.then(() => { resolved = true; });

        // Wait a tick
        await new Promise(r => setTimeout(r, 10));
        expect(guard.queued).toBe(1);
        expect(resolved).toBe(false);

        // Release first — queued should resolve
        release1();
        await new Promise(r => setTimeout(r, 10));
        expect(resolved).toBe(true);
        expect(guard.active).toBe(1);
        expect(guard.queued).toBe(0);
    });

    it('should load-shed when both active and queue are full', () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 1 });

        // Fill active slot
        guard.acquire();
        expect(guard.active).toBe(1);

        // Fill queue
        guard.acquire();
        expect(guard.queued).toBe(1);

        // This should be load-shed (return null)
        const result = guard.acquire();
        expect(result).toBeNull();
    });

    it('should load-shed immediately with maxQueue: 0', () => {
        const guard = new ConcurrencyGuard({ maxActive: 2 });

        guard.acquire();
        guard.acquire();

        // No queue configured (default 0)
        const result = guard.acquire();
        expect(result).toBeNull();
    });
});

describe('ConcurrencyGuard: AbortSignal Integration', () => {
    it('should reject queued waiter when signal is aborted', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 5 });
        const controller = new AbortController();

        // Fill active slot
        guard.acquire();

        // Queue with abort signal
        const queued = guard.acquire(controller.signal)!;
        expect(guard.queued).toBe(1);

        // Abort the signal
        controller.abort();

        // The queued promise should reject
        await expect(queued).rejects.toThrow('cancelled');
        expect(guard.queued).toBe(0);
    });

    it('should reject immediately if signal is already aborted when queuing', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 5 });
        const controller = new AbortController();
        controller.abort(); // Already aborted

        // Fill active slot
        guard.acquire();

        const queued = guard.acquire(controller.signal)!;
        await expect(queued).rejects.toThrow('cancelled');
    });
});

// ============================================================================
// Unit Tests: EgressGuard
// ============================================================================

describe('EgressGuard: Payload Truncation', () => {
    it('should pass through responses within limit', () => {
        const response: ToolResponse = success('small payload');
        const result = applyEgressGuard(response, 1024 * 1024);

        expect(result).toBe(response); // Same reference — no copy
    });

    it('should truncate responses exceeding limit', () => {
        const bigText = 'x'.repeat(10_000);
        const response: ToolResponse = success(bigText);
        const result = applyEgressGuard(response, 2048);

        const text = (result.content[0] as { text: string }).text;
        expect(text.length).toBeLessThan(bigText.length);
        expect(text).toContain('[SYSTEM INTERVENTION');
        expect(text).toContain('pagination');
    });

    it('should enforce minimum of 1024 bytes', () => {
        const response: ToolResponse = success('x'.repeat(2000));
        const result = applyEgressGuard(response, 100); // Below minimum

        const text = (result.content[0] as { text: string }).text;
        // Should use 1024 as minimum, not 100
        expect(text).toBeDefined();
    });

    it('should preserve isError flag on truncated responses', () => {
        const bigText = 'x'.repeat(10_000);
        const response: ToolResponse = {
            content: [{ type: 'text', text: bigText }],
            isError: true,
        };
        const result = applyEgressGuard(response, 2048);

        expect(result.isError).toBe(true);
    });

    it('should not set isError when original has no isError', () => {
        const bigText = 'x'.repeat(10_000);
        const response: ToolResponse = {
            content: [{ type: 'text', text: bigText }],
        };
        const result = applyEgressGuard(response, 2048);

        expect(result.isError).toBeUndefined();
    });

    it('should handle multi-byte UTF-8 characters correctly', () => {
        // Japanese characters = 3 bytes each in UTF-8
        const unicodeText = '\u3053\u3093\u306B\u3061\u306F'.repeat(1000); // 5 chars = 15 bytes per repeat
        const response: ToolResponse = success(unicodeText);
        const result = applyEgressGuard(response, 2048);

        const text = (result.content[0] as { text: string }).text;
        // Should not have broken UTF-8 characters
        expect(text).toBeDefined();
        expect(text).toContain('[SYSTEM INTERVENTION');
    });
});

// ============================================================================
// Integration Tests: Builder + ConcurrencyGuard
// ============================================================================

describe('Builder Integration: .concurrency()', () => {
    it('should execute normally when within concurrency limits', async () => {
        const tool = createTool<void>('billing')
            .concurrency({ maxActive: 5 })
            .action({
                name: 'process',
                handler: async () => success('invoiced'),
            });

        const result = await tool.execute(undefined, { action: 'process' });

        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toBe('invoiced');
    });

    it('should load-shed when all slots are occupied', async () => {
        const tool = createTool<void>('stripe')
            .concurrency({ maxActive: 1, maxQueue: 0 })
            .action({
                name: 'charge',
                handler: async () => {
                    // Simulate slow operation
                    await new Promise(r => setTimeout(r, 100));
                    return success('charged');
                },
            });

        // Fire first call (occupies the slot)
        const first = tool.execute(undefined, { action: 'charge' });

        // Fire second call immediately — should be load-shed
        const second = await tool.execute(undefined, { action: 'charge' });

        expect(second.isError).toBe(true);
        const text = (second.content[0] as { text: string }).text;
        expect(text).toContain('SERVER_BUSY');
        expect(text).toContain('capacity');

        // First should still complete
        const firstResult = await first;
        expect(firstResult.isError).toBeUndefined();
    });

    it('should queue and drain when slots become available', async () => {
        const results: string[] = [];

        const tool = createTool<void>('queue')
            .concurrency({ maxActive: 1, maxQueue: 10 })
            .action({
                name: 'work',
                handler: async () => {
                    results.push('executed');
                    return success('ok');
                },
            });

        // Fire 3 calls — only 1 active, 2 queued
        const p1 = tool.execute(undefined, { action: 'work' });
        const p2 = tool.execute(undefined, { action: 'work' });
        const p3 = tool.execute(undefined, { action: 'work' });

        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

        expect(r1.isError).toBeUndefined();
        expect(r2.isError).toBeUndefined();
        expect(r3.isError).toBeUndefined();
        expect(results).toHaveLength(3);
    });

    it('should release slot even when handler throws', async () => {
        const tool = createTool<void>('crasher')
            .concurrency({ maxActive: 1 })
            .action({
                name: 'boom',
                handler: async () => {
                    throw new Error('handler crash');
                },
            });

        // First call: crashes but slot should be released
        const result = await tool.execute(undefined, { action: 'boom' });
        expect(result.isError).toBe(true);

        // Second call: should NOT be load-shed
        const result2 = await tool.execute(undefined, { action: 'boom' });
        expect(result2.isError).toBe(true);
        const text = (result2.content[0] as { text: string }).text;
        expect(text).not.toContain('SERVER_BUSY');
    });

    it('should work without concurrency config (zero overhead)', async () => {
        const tool = createTool<void>('plain')
            .action({
                name: 'run',
                handler: async () => success('fast'),
            });

        const result = await tool.execute(undefined, { action: 'run' });
        expect((result.content[0] as { text: string }).text).toBe('fast');
    });
});

// ============================================================================
// Integration Tests: Builder + EgressGuard
// ============================================================================

describe('Builder Integration: .maxPayloadBytes()', () => {
    it('should truncate large responses', async () => {
        const tool = createTool<void>('logs')
            .maxPayloadBytes(2048)
            .action({
                name: 'search',
                handler: async () => success('x'.repeat(10_000)),
            });

        const result = await tool.execute(undefined, { action: 'search' });
        const text = (result.content[0] as { text: string }).text;

        expect(text.length).toBeLessThan(10_000);
        expect(text).toContain('[SYSTEM INTERVENTION');
    });

    it('should pass through small responses', async () => {
        const tool = createTool<void>('small')
            .maxPayloadBytes(1024 * 1024)
            .action({
                name: 'get',
                handler: async () => success('tiny'),
            });

        const result = await tool.execute(undefined, { action: 'get' });
        expect((result.content[0] as { text: string }).text).toBe('tiny');
    });

    it('should work without egress config (zero overhead)', async () => {
        const tool = createTool<void>('noguard')
            .action({
                name: 'big',
                handler: async () => success('x'.repeat(50_000)),
            });

        const result = await tool.execute(undefined, { action: 'big' });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toHaveLength(50_000);
    });
});

// ============================================================================
// Integration Tests: Both Guards Combined
// ============================================================================

describe('Runtime Guards: Combined', () => {
    it('should apply both concurrency and egress guards', async () => {
        const tool = createTool<void>('protected')
            .concurrency({ maxActive: 2, maxQueue: 5 })
            .maxPayloadBytes(2048)
            .action({
                name: 'process',
                handler: async () => success('x'.repeat(10_000)),
            });

        const result = await tool.execute(undefined, { action: 'process' });
        const text = (result.content[0] as { text: string }).text;

        expect(text.length).toBeLessThan(10_000);
        expect(text).toContain('[SYSTEM INTERVENTION');
    });

    it('should cancel queued waiter when AbortSignal fires', async () => {
        const controller = new AbortController();

        const tool = createTool<void>('abortqueue')
            .concurrency({ maxActive: 1, maxQueue: 5 })
            .action({
                name: 'slow',
                handler: async () => {
                    await new Promise(r => setTimeout(r, 200));
                    return success('done');
                },
            });

        // First call occupies the slot
        const first = tool.execute(undefined, { action: 'slow' });

        // Second call will be queued, then abort
        setTimeout(() => controller.abort(), 10);
        const second = await tool.execute(
            undefined,
            { action: 'slow' },
            undefined,
            controller.signal,
        );

        expect(second.isError).toBe(true);
        const text = (second.content[0] as { text: string }).text;
        expect(text).toContain('cancelled');

        // First should still complete
        const firstResult = await first;
        expect(firstResult.isError).toBeUndefined();
    });
});
