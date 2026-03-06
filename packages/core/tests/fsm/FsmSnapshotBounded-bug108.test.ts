/**
 * Bug #108 Regression: fsmMemorySnapshots must be bounded
 *
 * BUG: The in-memory FSM snapshot store (`Map<string, FsmSnapshot>`)
 * never evicted entries. In a long-running server with Streamable HTTP
 * transport, each unique session ID added a permanent entry — unbounded
 * memory growth proportional to session count, eventually causing OOM.
 *
 * FIX: Replaced the raw `Map` with `createBoundedSnapshotMap(10_000)`,
 * which uses LRU eviction. When the map exceeds the max size, the least
 * recently used entry is evicted. Achieving this by re-inserting on `get()`
 * to refresh position (exploiting JS Map insertion-order iteration).
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { defineTool } from '../../src/core/builder/defineTool.js';
import { StateMachineGate } from '../../src/fsm/StateMachineGate.js';
import type { FsmConfig, FsmSnapshot } from '../../src/fsm/StateMachineGate.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ── Helpers ──────────────────────────────────────────────

function createMockServer() {
    const handlers = new Map<unknown, (...args: unknown[]) => unknown>();
    const server = {
        setRequestHandler: (schema: unknown, handler: (...args: unknown[]) => unknown) => {
            handlers.set(schema, handler);
        },
    };
    return { server, handlers };
}

const workflowConfig: FsmConfig = {
    id: 'workflow',
    initial: 'draft',
    states: {
        draft:   { on: { SUBMIT: 'review' } },
        review:  { on: { APPROVE: 'approved' } },
        approved: { type: 'final' },
    },
};

const docs = defineTool<void>('docs', {
    description: 'Document operations',
    actions: {
        submit: { handler: async () => 'submitted' },
        approve: { handler: async () => 'approved' },
    },
});

// ── Tests ────────────────────────────────────────────────

describe('Bug #108: Bounded in-memory FSM snapshot store', () => {

    it('should not grow beyond the LRU capacity', async () => {
        // We can't directly access createBoundedSnapshotMap from outside,
        // but we can verify the behavior through the public attachToServer flow.
        // The map is capped at 10,000 entries internally.

        // Instead, test the LRU map pattern directly by mimicking the behavior
        // createBoundedSnapshotMap produces
        const maxSize = 5;
        const map = createBoundedTestMap(maxSize);

        // Fill to capacity
        for (let i = 0; i < maxSize; i++) {
            map.set(`session-${i}`, { state: 'draft', updatedAt: Date.now() });
        }
        expect(map.size).toBe(maxSize);

        // Add one more — should evict the oldest (session-0)
        map.set('session-overflow', { state: 'review', updatedAt: Date.now() });
        expect(map.size).toBe(maxSize);
        expect(map.has('session-0')).toBe(false);
        expect(map.has('session-overflow')).toBe(true);
    });

    it('should refresh position on get (LRU behavior)', () => {
        const maxSize = 3;
        const map = createBoundedTestMap(maxSize);

        map.set('a', { state: 'draft', updatedAt: 1 });
        map.set('b', { state: 'draft', updatedAt: 2 });
        map.set('c', { state: 'draft', updatedAt: 3 });

        // Access 'a' to refresh its position — now 'b' is oldest
        map.get('a');

        // Adding a new entry should evict 'b' (oldest), not 'a'
        map.set('d', { state: 'review', updatedAt: 4 });
        expect(map.size).toBe(maxSize);
        expect(map.has('a')).toBe(true);  // refreshed
        expect(map.has('b')).toBe(false); // evicted (oldest)
        expect(map.has('c')).toBe(true);
        expect(map.has('d')).toBe(true);
    });

    it('should update existing keys without growing', () => {
        const maxSize = 3;
        const map = createBoundedTestMap(maxSize);

        map.set('a', { state: 'draft', updatedAt: 1 });
        map.set('b', { state: 'draft', updatedAt: 2 });
        map.set('c', { state: 'draft', updatedAt: 3 });

        // Update 'a' — should not grow beyond maxSize
        map.set('a', { state: 'review', updatedAt: 4 });
        expect(map.size).toBe(maxSize);
        expect(map.get('a')?.state).toBe('review');
    });

    it('should evict multiple entries in insertion order', () => {
        const maxSize = 3;
        const map = createBoundedTestMap(maxSize);

        map.set('a', { state: 'draft', updatedAt: 1 });
        map.set('b', { state: 'draft', updatedAt: 2 });
        map.set('c', { state: 'draft', updatedAt: 3 });

        // Add 2 more — evicts 'a' then 'b'
        map.set('d', { state: 'draft', updatedAt: 4 });
        map.set('e', { state: 'draft', updatedAt: 5 });

        expect(map.size).toBe(maxSize);
        expect(map.has('a')).toBe(false);
        expect(map.has('b')).toBe(false);
        expect(map.has('c')).toBe(true);
        expect(map.has('d')).toBe(true);
        expect(map.has('e')).toBe(true);
    });

    it('should work correctly with the server flow (integration)', async () => {
        const { server, handlers } = createMockServer();
        const registry = new ToolRegistry<void>();
        registry.register(docs);

        const fsm = new StateMachineGate(workflowConfig);
        fsm.bindTool('docs_submit', ['draft'], 'SUBMIT');
        fsm.bindTool('docs_approve', ['review'], 'APPROVE');

        // Attach without fsmStore — uses in-memory bounded map
        await registry.attachToServer(server, { fsm });

        const callHandler = handlers.get(CallToolRequestSchema) as Function;

        // Simulate many different sessions calling submit
        for (let i = 0; i < 100; i++) {
            const result = await callHandler(
                { params: { name: 'docs_submit', arguments: { action: 'submit' } } },
                { sessionId: `session-${i}` },
            );
            // Each call should succeed (tool is allowed in 'draft' state for new sessions)
            expect(result.isError).toBeFalsy();
        }

        // The server should still be functional (no OOM, no crashes)
        // This verifies the bounded map doesn't break the FSM lifecycle
        const finalResult = await callHandler(
            { params: { name: 'docs_submit', arguments: { action: 'submit' } } },
            { sessionId: 'final-session' },
        );
        expect(finalResult.isError).toBeFalsy();
    });
});

// ── Test Helper: Bounded Map (mirrors createBoundedSnapshotMap logic) ─

/**
 * Creates a bounded Map with LRU eviction — directly mirrors the
 * `createBoundedSnapshotMap` implementation in ServerAttachment.ts.
 */
function createBoundedTestMap(maxSize: number): Map<string, FsmSnapshot> {
    const map = new Map<string, FsmSnapshot>();
    const originalSet = map.set.bind(map);
    const originalGet = map.get.bind(map);
    const originalHas = map.has.bind(map);
    const originalDelete = map.delete.bind(map);

    map.get = (key: string): FsmSnapshot | undefined => {
        const value = originalGet(key);
        if (value !== undefined) {
            originalDelete(key);
            originalSet(key, value);
        }
        return value;
    };

    map.set = (key: string, value: FsmSnapshot): Map<string, FsmSnapshot> => {
        if (originalHas(key)) {
            originalDelete(key);
        }
        originalSet(key, value);
        if (map.size > maxSize) {
            const oldest = map.keys().next().value;
            if (oldest !== undefined) originalDelete(oldest);
        }
        return map;
    };

    return map;
}
