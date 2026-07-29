/**
 * ServerAttachment — Elicitation Wiring Integration
 *
 * Tests the return-based elicitation pipeline (requireInput + readInput)
 * driven by runWithElicitation:
 * - requireInput() returns InputRequiredResponse when no answers present
 * - runWithElicitation fulfills requests over a mock ElicitSink and re-enters
 * - readInput() returns the answers on re-entry
 * - ELICITATION_UNSUPPORTED when no sink is available
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { initMCPFusion, ask, requireInput, readInput, inputResponse } from '../../src/index.js';
import { runWithElicitation } from '../../src/core/elicitation/runtime.js';
import { isInputRequiredResponse } from '../../src/core/elicitation/requireInput.js';
import type { ElicitSink } from '../../src/core/elicitation/types.js';

describe('ServerAttachment — return-based elicitation wiring (unit)', () => {

    it('requireInput() returns InputRequiredResponse on first call', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('test.elicit')
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

        // First call — no sink, no answers → InputRequiredResponse
        const result = await registry.routeCall(undefined as never, 'test', { action: 'elicit' });

        expect(isInputRequiredResponse(result)).toBe(true);
        const req = result as unknown as { inputRequests: Record<string, { message: string }> };
        expect(req.inputRequests.deploy.message).toBe('Choose region:');
    });

    it('runWithElicitation fulfills requireInput over mock sink and re-enters', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('test.elicit')
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

        // Mock sink that answers the elicitation request
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { region: 'eu' },
        });

        // Drive the handler through the elicitation runtime
        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'test', { action: 'elicit' }),
            mockSink,
        );

        // The sink should have been called with elicitation/create
        expect(mockSink).toHaveBeenCalledOnce();
        const call = vi.mocked(mockSink).mock.calls[0]![0];
        expect(call.method).toBe('elicitation/create');
        expect((call.params as { message: string }).message).toBe('Choose region:');

        // The final response should contain the user's selection
        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.region).toBe('eu');
    });

    it('requireInput without sink returns ELICITATION_UNSUPPORTED error', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('test.nosink')
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

        // Drive without a sink — simulates stateless connection with no channel
        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'test', { action: 'nosink' }),
            undefined,
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('ELICITATION_UNSUPPORTED');
    });

    it('handler that conditionally uses requireInput works in both paths', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('test.conditional')
                .withString('mode', 'Mode')
                .interactive()
                .handle(async (input) => {
                    if (input.mode === 'interactive') {
                        const answers = readInput<{ ok: boolean }>('confirm');
                        if (!answers) {
                            return requireInput({
                                inputRequests: {
                                    confirm: requireInput.elicit('Confirm?', {
                                        ok: ask.boolean('OK'),
                                    }),
                                },
                            });
                        }
                        return { confirmed: answers.ok };
                    }
                    // Non-interactive path — no requireInput() called
                    return { confirmed: true };
                }),
        );

        // Non-interactive path — works without elicitation context
        const r1 = await runWithElicitation(
            () => registry.routeCall(
                undefined as never,
                'test',
                { action: 'conditional', mode: 'batch' },
            ),
            undefined,
        );
        expect(r1.isError).toBeFalsy();
        const parsed1 = JSON.parse((r1.content[0] as { text: string }).text);
        expect(parsed1.confirmed).toBe(true);

        // Interactive path — needs elicitation context
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { ok: true },
        });

        const r2 = await runWithElicitation(
            () => registry.routeCall(
                undefined as never,
                'test',
                { action: 'conditional', mode: 'interactive' },
            ),
            mockSink,
        );
        expect(r2.isError).toBeFalsy();
        const parsed2 = JSON.parse((r2.content[0] as { text: string }).text);
        expect(parsed2.confirmed).toBe(true);
    });

    it('requireInput.url() through full pipeline', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.action('auth.github')
                .interactive()
                .handle(async () => {
                    const view = inputResponse('auth');
                    if (view.kind === 'missing') {
                        return requireInput({
                            inputRequests: {
                                auth: requireInput.url(
                                    'Authenticate with GitHub:',
                                    'https://github.com/login/oauth',
                                ),
                            },
                        });
                    }
                    return { connected: view.action === 'accept' };
                }),
        );

        const mockSink: ElicitSink = vi.fn().mockResolvedValue({ action: 'accept' });

        const result = await runWithElicitation(
            () => registry.routeCall(undefined as never, 'auth', { action: 'github' }),
            mockSink,
        );

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.connected).toBe(true);

        // Verify URL mode request
        const call = mockSink.mock.calls[0]![0];
        const params = call.params as { message: string; url: string };
        expect(params.url).toBe('https://github.com/login/oauth');
    });
});
