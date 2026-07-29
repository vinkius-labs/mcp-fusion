/**
 * Regression: Return-based elicitation (requireInput) end-to-end
 *
 * CRITICAL: The return-based elicitation model replaces the removed
 * imperative `ask()`. This test suite verifies the full MRTR flow:
 *
 * 1. Handler returns requireInput() → InputRequiredResponse
 * 2. runWithElicitation fulfills over mock sink → re-enters handler
 * 3. readInput() returns answers on re-entry
 * 4. inputResponse() discriminated view works correctly
 * 5. Multi-round flows via requestState
 * 6. URL mode (requireInput.url) works end-to-end
 * 7. ELICITATION_UNSUPPORTED when no sink available
 * 8. ELICITATION_ROUNDS_EXCEEDED when max rounds exceeded
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { initMCPFusion, ask, requireInput, readInput, inputResponse, readRequestState } from '../../src/index.js';
import { runWithElicitation } from '../../src/core/elicitation/runtime.js';
import { isInputRequiredResponse } from '../../src/core/elicitation/requireInput.js';
import type { ElicitSink } from '../../src/core/elicitation/types.js';

// ── Basic requireInput flow ──────────────────────────────

describe('Regression: requireInput basic flow', () => {

    it('handler returns InputRequiredResponse on first call (no answers)', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('deploy.run')
                .interactive()
                .handle(async () => {
                    const answers = readInput<{ region: string }>('deploy');
                    if (!answers) {
                        return requireInput({
                            inputRequests: {
                                deploy: requireInput.elicit('Choose region:', {
                                    region: ask.enum(['us', 'eu'] as const, 'Region'),
                                }),
                            },
                        });
                    }
                    return { region: answers.region };
                }),
        );

        const result = await registry.routeCall(undefined as never, 'deploy', { action: 'run' });
        expect(isInputRequiredResponse(result)).toBe(true);
    });

    it('runWithElicitation fulfills over sink and re-enters with answers', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('deploy.run')
                .interactive()
                .handle(async () => {
                    const answers = readInput<{ region: string }>('deploy');
                    if (!answers) {
                        return requireInput({
                            inputRequests: {
                                deploy: requireInput.elicit('Choose region:', {
                                    region: ask.enum(['us', 'eu'] as const, 'Region'),
                                }),
                            },
                        });
                    }
                    return { region: answers.region };
                }),
        );

        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { region: 'eu' },
        });

        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'deploy', { action: 'run' }),
            mockSink,
        );

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.region).toBe('eu');
        expect(mockSink).toHaveBeenCalledOnce();
    });

    it('readInput returns undefined on first call, answers on re-entry', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        let firstCallResult: unknown;
        let reentryResult: unknown;

        registry.register(
            f.action('form.test')
                .interactive()
                .handle(async () => {
                    const answers = readInput<{ name: string }>('form');
                    if (!answers) {
                        firstCallResult = 'first';
                        return requireInput({
                            inputRequests: {
                                form: requireInput.elicit('Name:', { name: ask.string('Name') }),
                            },
                        });
                    }
                    reentryResult = answers.name;
                    return { name: answers.name };
                }),
        );

        // First call — no answers
        const r1 = await registry.routeCall(undefined as never, 'form', { action: 'test' });
        expect(firstCallResult).toBe('first');
        expect(isInputRequiredResponse(r1)).toBe(true);

        // Re-entry with answers via sink
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { name: 'Alice' },
        });

        const r2 = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'form', { action: 'test' }),
            mockSink,
        );

        expect(reentryResult).toBe('Alice');
        expect(r2.isError).toBeFalsy();
    });
});

// ── inputResponse discriminated view ─────────────────────

describe('Regression: inputResponse discriminated view', () => {

    it('returns { kind: "missing" } on first call', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.action('view.test')
                .interactive()
                .handle(async () => {
                    const view = inputResponse('form');
                    if (view.kind === 'missing') {
                        return requireInput({
                            inputRequests: {
                                form: requireInput.elicit('Test:', { x: ask.string('X') }),
                            },
                        });
                    }
                    return { action: view.action };
                }),
        );

        const result = await registry.routeCall(undefined as never, 'view', { action: 'test' });
        expect(isInputRequiredResponse(result)).toBe(true);
    });

    it('returns { kind: "elicit", action: "accept" } on re-entry with accepted answer', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.action('view.accept')
                .interactive()
                .handle(async () => {
                    const view = inputResponse('form');
                    if (view.kind === 'missing') {
                        return requireInput({
                            inputRequests: {
                                form: requireInput.elicit('Test:', { x: ask.string('X') }),
                            },
                        });
                    }
                    return { kind: view.kind, action: view.action };
                }),
        );

        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { x: 'hello' },
        });

        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'view', { action: 'accept' }),
            mockSink,
        );

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.kind).toBe('elicit');
        expect(parsed.action).toBe('accept');
    });

    it('returns { kind: "elicit", action: "decline" } when user declines', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.action('view.decline')
                .interactive()
                .handle(async () => {
                    const view = inputResponse('form');
                    if (view.kind === 'missing') {
                        return requireInput({
                            inputRequests: {
                                form: requireInput.elicit('Test:', { x: ask.string('X') }),
                            },
                        });
                    }
                    return { kind: view.kind, action: view.action };
                }),
        );

        const mockSink: ElicitSink = vi.fn().mockResolvedValue({ action: 'decline' });

        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'view', { action: 'decline' }),
            mockSink,
        );

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.action).toBe('decline');
    });
});

// ── URL mode (requireInput.url) ──────────────────────────

describe('Regression: requireInput.url end-to-end', () => {

    it('URL mode works with inputResponse', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.action('auth.oauth')
                .interactive()
                .handle(async () => {
                    const view = inputResponse('auth');
                    if (view.kind === 'missing') {
                        return requireInput({
                            inputRequests: {
                                auth: requireInput.url('Authenticate:', 'https://oauth.example.com'),
                            },
                        });
                    }
                    return { connected: view.action === 'accept' };
                }),
        );

        const mockSink: ElicitSink = vi.fn().mockResolvedValue({ action: 'accept' });

        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'auth', { action: 'oauth' }),
            mockSink,
        );

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.connected).toBe(true);

        // Verify URL mode was sent correctly
        const call = mockSink.mock.calls[0]![0];
        const params = call.params as { message: string; url: string };
        expect(params.url).toBe('https://oauth.example.com');
    });
});

// ── Error cases ──────────────────────────────────────────

describe('Regression: elicitation error cases', () => {

    it('ELICITATION_UNSUPPORTED when no sink available', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('nosink.test')
                .interactive()
                .handle(async () => {
                    const answers = readInput<{ x: string }>('form');
                    if (!answers) {
                        return requireInput({
                            inputRequests: {
                                form: requireInput.elicit('Test:', { x: ask.string('X') }),
                            },
                        });
                    }
                    return { x: answers.x };
                }),
        );

        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'nosink', { action: 'test' }),
            undefined,
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('ELICITATION_UNSUPPORTED');
    });

    it('ELICITATION_ROUNDS_EXCEEDED when handler never completes', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        // Handler that ALWAYS returns requireInput (never terminates)
        registry.register(
            f.action('loop.test')
                .interactive()
                .handle(async () => {
                    return requireInput({
                        inputRequests: {
                            form: requireInput.elicit('Never ends:', { x: ask.string('X') }),
                        },
                    });
                }),
        );

        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { x: 'value' },
        });

        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'loop', { action: 'test' }),
            mockSink,
            { maxRounds: 3 },
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('ELICITATION_ROUNDS_EXCEEDED');
    });
});

// ── requestState threading ───────────────────────────────

describe('Regression: requestState threading', () => {

    it('readRequestState returns undefined on first call', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.action('state.test')
                .interactive()
                .handle(async () => {
                    const state = readRequestState<string>();
                    if (!state) {
                        return requireInput({
                            inputRequests: {
                                step: requireInput.elicit('Step 1:', { x: ask.string('X') }),
                            },
                            requestState: 'phase-2',
                        });
                    }
                    return { state };
                }),
        );

        const result = await registry.routeCall(undefined as never, 'state', { action: 'test' });
        expect(isInputRequiredResponse(result)).toBe(true);
        // The requestState should be set on the response
        const req = result as unknown as { requestState?: string };
        expect(req.requestState).toBe('phase-2');
    });
});