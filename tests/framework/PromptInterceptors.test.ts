/**
 * Prompt Interceptors — Test Suite
 *
 * Tests the global Prompt Interceptor mechanism:
 * - prependSystem / prependUser / appendSystem / appendUser / appendAssistant
 * - Multiple interceptors composing in registration order
 * - Conditional interception based on PromptMeta
 * - Async interceptors
 * - Zero overhead when no interceptors registered
 * - Mixed prepend + append
 */
import { describe, it, expect } from 'vitest';
import { definePrompt, PromptMessage } from '../../src/framework/prompt/index.js';
import { PromptRegistry } from '../../src/framework/registry/PromptRegistry.js';

// ── Test Context ─────────────────────────────────────────

interface TestContext {
    user: { role: string; name: string };
    tenant: { id: string };
}

const createCtx = (role = 'editor', tenantId = 'acme-corp'): TestContext => ({
    user: { role, name: 'John' },
    tenant: { id: tenantId },
});

// ── Test Prompts ─────────────────────────────────────────

const simplePrompt = definePrompt<TestContext>('daily_briefing', {
    description: 'Morning briefing for the user',
    tags: ['daily', 'productivity'],
    handler: async (_ctx, _args) => ({
        messages: [
            PromptMessage.system('You are a productivity coach.'),
            PromptMessage.user('What should I focus on today?'),
        ],
    }),
});

const auditPrompt = definePrompt<TestContext>('audit_report', {
    description: 'Generate audit report',
    tags: ['compliance', 'finance'],
    handler: async (_ctx, _args) => ({
        messages: [
            PromptMessage.system('You are a Senior Auditor.'),
            PromptMessage.user('Begin the audit.'),
        ],
    }),
});

// ── Tests ────────────────────────────────────────────────

describe('Prompt Interceptors', () => {
    it('should prepend a compliance header to all prompts', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        registry.useInterceptor(async (ctx, builder) => {
            builder.prependSystem(
                `[COMPLIANCE] Tenant: ${ctx.tenant.id} | User: ${ctx.user.role}`,
            );
        });

        const result = await registry.routeGet(createCtx(), 'daily_briefing', {});

        // First message should be the compliance header
        expect(result.messages).toHaveLength(3);
        expect(result.messages[0]).toEqual({
            role: 'user',
            content: {
                type: 'text',
                text: '[COMPLIANCE] Tenant: acme-corp | User: editor',
            },
        });
        // Original messages follow
        expect(result.messages[1]).toEqual(PromptMessage.system('You are a productivity coach.'));
        expect(result.messages[2]).toEqual(PromptMessage.user('What should I focus on today?'));
    });

    it('should append a footer to all prompts', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        registry.useInterceptor(async (_ctx, builder) => {
            builder.appendUser('--- End of compliance context ---');
        });

        const result = await registry.routeGet(createCtx(), 'daily_briefing', {});

        expect(result.messages).toHaveLength(3);
        // Original messages first
        expect(result.messages[0]).toEqual(PromptMessage.system('You are a productivity coach.'));
        expect(result.messages[1]).toEqual(PromptMessage.user('What should I focus on today?'));
        // Appended footer last
        expect(result.messages[2]).toEqual({
            role: 'user',
            content: { type: 'text', text: '--- End of compliance context ---' },
        });
    });

    it('should compose multiple interceptors in registration order', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        // First interceptor: tenant context
        registry.useInterceptor(async (ctx, builder) => {
            builder.prependSystem(`[TENANT] ${ctx.tenant.id}`);
        });

        // Second interceptor: timestamp
        registry.useInterceptor(async (_ctx, builder) => {
            builder.prependSystem('[TIMESTAMP] 2026-02-23T09:00:00Z');
        });

        const result = await registry.routeGet(createCtx(), 'daily_briefing', {});

        // Both prepends appear BEFORE original messages
        expect(result.messages).toHaveLength(4);
        expect((result.messages[0]!.content as { text: string }).text).toBe('[TENANT] acme-corp');
        expect((result.messages[1]!.content as { text: string }).text).toBe('[TIMESTAMP] 2026-02-23T09:00:00Z');
        // Original messages follow
        expect(result.messages[2]).toEqual(PromptMessage.system('You are a productivity coach.'));
    });

    it('should conditionally intercept based on PromptMeta tags', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);
        registry.register(auditPrompt);

        // Only intercept compliance-tagged prompts
        registry.useInterceptor(async (ctx, builder, meta) => {
            if (meta.tags.includes('compliance')) {
                builder.prependSystem(`[AUDIT TRAIL] User: ${ctx.user.name}`);
            }
        });

        // daily_briefing has tags ['daily', 'productivity'] → no interception
        const briefingResult = await registry.routeGet(createCtx(), 'daily_briefing', {});
        expect(briefingResult.messages).toHaveLength(2); // no prepend

        // audit_report has tags ['compliance', 'finance'] → intercepted
        const auditResult = await registry.routeGet(createCtx(), 'audit_report', {});
        expect(auditResult.messages).toHaveLength(3); // 1 prepend + 2 original
        expect((auditResult.messages[0]!.content as { text: string }).text).toBe('[AUDIT TRAIL] User: John');
    });

    it('should pass correct PromptMeta to interceptors', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(auditPrompt);

        let capturedMeta: unknown;
        registry.useInterceptor(async (_ctx, _builder, meta) => {
            capturedMeta = meta;
        });

        await registry.routeGet(createCtx(), 'audit_report', {});

        expect(capturedMeta).toEqual({
            name: 'audit_report',
            description: 'Generate audit report',
            tags: ['compliance', 'finance'],
        });
    });

    it('should support async interceptors', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        registry.useInterceptor(async (ctx, builder) => {
            // Simulate async operation (e.g., fetching tenant config)
            await new Promise(resolve => setTimeout(resolve, 10));
            builder.prependSystem(`[ASYNC] Loaded config for ${ctx.tenant.id}`);
        });

        const result = await registry.routeGet(createCtx(), 'daily_briefing', {});
        expect(result.messages).toHaveLength(3);
        expect((result.messages[0]!.content as { text: string }).text).toBe('[ASYNC] Loaded config for acme-corp');
    });

    it('should have zero overhead when no interceptors registered', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        // No interceptors registered
        const result = await registry.routeGet(createCtx(), 'daily_briefing', {});

        // Original messages unchanged
        expect(result.messages).toHaveLength(2);
        expect(result.messages[0]).toEqual(PromptMessage.system('You are a productivity coach.'));
        expect(result.messages[1]).toEqual(PromptMessage.user('What should I focus on today?'));
    });

    it('should support mixed prepend + append', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        registry.useInterceptor(async (ctx, builder) => {
            builder.prependSystem(`[HEADER] Tenant: ${ctx.tenant.id}`);
            builder.appendAssistant('I will comply with all tenant policies.');
        });

        const result = await registry.routeGet(createCtx(), 'daily_briefing', {});

        expect(result.messages).toHaveLength(4);
        // Prepend at top
        expect((result.messages[0]!.content as { text: string }).text).toBe('[HEADER] Tenant: acme-corp');
        // Original in middle
        expect(result.messages[1]).toEqual(PromptMessage.system('You are a productivity coach.'));
        expect(result.messages[2]).toEqual(PromptMessage.user('What should I focus on today?'));
        // Append at bottom (assistant role)
        expect(result.messages[3]).toEqual({
            role: 'assistant',
            content: { type: 'text', text: 'I will comply with all tenant policies.' },
        });
    });

    it('should not affect error results from unknown prompts', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        registry.useInterceptor(async (_ctx, builder) => {
            builder.prependSystem('[SHOULD NOT APPEAR]');
        });

        // Route to unknown prompt → returns error directly (no interception)
        const result = await registry.routeGet(createCtx(), 'nonexistent', {});

        expect(result.messages).toHaveLength(1);
        expect((result.messages[0]!.content as { text: string }).text).toContain('Unknown prompt');
    });

    it('should apply interceptors per-request with different contexts', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        registry.useInterceptor(async (ctx, builder) => {
            builder.prependSystem(`[RBAC] Role: ${ctx.user.role}`);
        });

        const adminResult = await registry.routeGet(
            createCtx('admin', 'corp-a'),
            'daily_briefing',
            {},
        );
        const editorResult = await registry.routeGet(
            createCtx('editor', 'corp-b'),
            'daily_briefing',
            {},
        );

        expect((adminResult.messages[0]!.content as { text: string }).text).toBe('[RBAC] Role: admin');
        expect((editorResult.messages[0]!.content as { text: string }).text).toBe('[RBAC] Role: editor');
    });

    it('should support synchronous interceptors (no async)', async () => {
        const registry = new PromptRegistry<TestContext>();
        registry.register(simplePrompt);

        // Synchronous — no async keyword
        registry.useInterceptor((ctx, builder) => {
            builder.prependSystem(`[SYNC] ${ctx.tenant.id}`);
        });

        const result = await registry.routeGet(createCtx(), 'daily_briefing', {});
        expect(result.messages).toHaveLength(3);
        expect((result.messages[0]!.content as { text: string }).text).toBe('[SYNC] acme-corp');
    });

    it('should preserve original result description when interceptors add messages', async () => {
        const promptWithDescription = definePrompt<TestContext>('described', {
            description: 'A prompt with a description',
            handler: async () => ({
                description: 'Result description',
                messages: [PromptMessage.user('Hello')],
            }),
        });

        const registry = new PromptRegistry<TestContext>();
        registry.register(promptWithDescription);

        registry.useInterceptor(async (_ctx, builder) => {
            builder.prependSystem('[HEADER]');
        });

        const result = await registry.routeGet(createCtx(), 'described', {});

        expect(result.description).toBe('Result description');
        expect(result.messages).toHaveLength(2);
    });
});
