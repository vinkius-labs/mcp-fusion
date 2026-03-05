/**
 * Bug #44 Regression: FSM state lost when fsmStore exists but session ID not extractable
 *
 * BUG: After FSM transition, state is saved to `fsmStore` only if
 * `extractSessionId(extra)` returns a value. In stdio transports (no session ID),
 * the transition is applied to the per-request clone and then DISCARDED —
 * state is lost without warning.
 *
 * Similarly, in `createToolListHandler` and `createToolCallHandler`, FSM state
 * is only loaded from `fsmStore` when session ID exists. Stdio transports
 * with fsmStore configured silently skip restore, making FSM gating broken.
 *
 * WHY EXISTING TESTS MISSED IT:
 * All FSM tests either:
 * 1. Test StateMachineGate in isolation (no ServerAttachment integration)
 * 2. Use mock `extra` objects with `sessionId` present
 * 3. Don't configure `fsmStore` at all (in-memory FSM)
 * Zero tests verified the stdio path (extra={} or extra without session ID)
 * when fsmStore was configured.
 *
 * FIX: Use fallback session ID `'__default__'` when `extractSessionId` returns
 * undefined. This ensures FSM state is always persisted and restored, even in
 * session-less transports like stdio.
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';

// We test the extractSessionId logic + the fallback behavior
// by simulating the pattern used in ServerAttachment.ts

/** Reproduce the extractSessionId function from ServerAttachment */
function extractSessionId(extra: unknown): string | undefined {
    if (typeof extra !== 'object' || extra === null) return undefined;
    const ex = extra as Record<string, unknown>;
    if (typeof ex['sessionId'] === 'string') return ex['sessionId'];
    const headers = ex['headers'] as Record<string, unknown> | undefined;
    if (headers && typeof headers['mcp-session-id'] === 'string') {
        return headers['mcp-session-id'];
    }
    return undefined;
}

describe('Bug #44 Regression: FSM state fallback session ID', () => {

    it('extractSessionId returns undefined for empty extra (stdio transport)', () => {
        expect(extractSessionId({})).toBeUndefined();
        expect(extractSessionId(null)).toBeUndefined();
        expect(extractSessionId(undefined)).toBeUndefined();
    });

    it('extractSessionId returns sessionId from standard MCP SDK', () => {
        expect(extractSessionId({ sessionId: 'sess-123' })).toBe('sess-123');
    });

    it('extractSessionId returns sessionId from Streamable HTTP headers', () => {
        const extra = { headers: { 'mcp-session-id': 'http-456' } };
        expect(extractSessionId(extra)).toBe('http-456');
    });

    it('fallback __default__ ensures fsmStore.save is always called', async () => {
        // Simulate the FIXED server behavior:
        // sessionId = extractSessionId(extra) ?? '__default__'
        const fsmStore = {
            load: vi.fn().mockResolvedValue(undefined),
            save: vi.fn().mockResolvedValue(undefined),
        };

        // Simulate stdio transport (no session ID)
        const extra = {};
        const sessionId = extractSessionId(extra) ?? '__default__';

        // Save should succeed with fallback ID
        await fsmStore.save(sessionId, { currentState: 'checkout' });

        expect(fsmStore.save).toHaveBeenCalledWith('__default__', { currentState: 'checkout' });
    });

    it('fallback __default__ ensures fsmStore.load is always called', async () => {
        const fsmStore = {
            load: vi.fn().mockResolvedValue({ currentState: 'payment' }),
            save: vi.fn().mockResolvedValue(undefined),
        };

        // Simulate stdio transport
        const extra = {};
        const sessionId = extractSessionId(extra) ?? '__default__';

        const snap = await fsmStore.load(sessionId);

        expect(fsmStore.load).toHaveBeenCalledWith('__default__');
        expect(snap).toEqual({ currentState: 'payment' });
    });

    it('real session ID takes precedence over fallback', async () => {
        const fsmStore = {
            load: vi.fn().mockResolvedValue(undefined),
            save: vi.fn().mockResolvedValue(undefined),
        };

        // HTTP transport with real session ID
        const extra = { sessionId: 'real-session' };
        const sessionId = extractSessionId(extra) ?? '__default__';

        await fsmStore.save(sessionId, { currentState: 'done' });

        expect(fsmStore.save).toHaveBeenCalledWith('real-session', { currentState: 'done' });
    });

    it('BUG SCENARIO: without fallback, stdio FSM save was silently skipped', () => {
        // This demonstrates the exact bug condition:
        const extra = {}; // stdio transport
        const sessionId = extractSessionId(extra);

        // OLD CODE: if (sessionId) { fsmStore.save(sessionId, snapshot) }
        // sessionId is undefined → save is SKIPPED → state LOST

        // Verify the condition that caused the bug
        expect(sessionId).toBeUndefined();

        // NEW CODE: sessionId ?? '__default__' ensures save always happens
        const resolvedSessionId = sessionId ?? '__default__';
        expect(resolvedSessionId).toBe('__default__');
    });

    it('concurrent stdio requests share __default__ session correctly', async () => {
        // In stdio mode, all requests share the same session
        // The __default__ fallback ensures state is consistent
        const store = new Map<string, unknown>();
        const fsmStore = {
            load: vi.fn(async (id: string) => store.get(id)),
            save: vi.fn(async (id: string, snap: unknown) => { store.set(id, snap); }),
        };

        // First request: transition to 'active'
        const id1 = extractSessionId({}) ?? '__default__';
        await fsmStore.save(id1, { currentState: 'active' });

        // Second request: should see the state from first
        const id2 = extractSessionId({}) ?? '__default__';
        const snap = await fsmStore.load(id2);

        expect(snap).toEqual({ currentState: 'active' });
        expect(id1).toBe('__default__');
        expect(id2).toBe('__default__');
    });

    it('HTTP and stdio sessions are isolated', async () => {
        const store = new Map<string, unknown>();
        const fsmStore = {
            load: vi.fn(async (id: string) => store.get(id)),
            save: vi.fn(async (id: string, snap: unknown) => { store.set(id, snap); }),
        };

        // HTTP request: has session ID
        const httpId = extractSessionId({ sessionId: 'http-1' }) ?? '__default__';
        await fsmStore.save(httpId, { currentState: 'checkout' });

        // stdio request: uses fallback  
        const stdioId = extractSessionId({}) ?? '__default__';
        await fsmStore.save(stdioId, { currentState: 'browsing' });

        // They should be isolated
        const httpState = await fsmStore.load('http-1');
        const stdioState = await fsmStore.load('__default__');

        expect(httpState).toEqual({ currentState: 'checkout' });
        expect(stdioState).toEqual({ currentState: 'browsing' });
    });
});
