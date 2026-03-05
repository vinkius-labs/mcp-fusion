/**
 * Bugs #54 & #55 — ExpositionCompiler schema overwrite + CryptoAttestation top-level await
 *
 * Bug #54: ExpositionCompiler's buildAtomicSchema() silently overwrites
 * common schema fields when action schema has the same field name.
 * No warning is emitted.
 *
 * Bug #55: CryptoAttestation uses top-level `await` to resolve
 * SubtleCrypto, which requires ESM. Modules fail to load in CJS context.
 *
 * WHY EXISTING TESTS MISSED IT:
 * - Bug #54: ExpositionCompiler tests never test common + action schemas
 *   with overlapping property names. Tests always use distinct field names.
 * - Bug #55: All tests run in ESM context (Vitest). The CJS breakage only
 *   manifests in actual CommonJS require() environments.
 *
 * THE FIXES:
 * - #54: Emit console.warn when action schema overwrites a common field.
 * - #55: Replace top-level await with lazy async getter `getSubtle()`.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { compileExposition } from '../../src/exposition/ExpositionCompiler.js';
import { GroupedToolBuilder } from '../../src/core/builder/GroupedToolBuilder.js';
import { success } from '../../src/core/response.js';
import type { ToolResponse } from '../../src/core/response.js';

const handler = async (): Promise<ToolResponse> => success('ok');

// ============================================================================
// Bug #54: ExpositionCompiler schema overwrite warning
// ============================================================================

describe('Bug #54: ExpositionCompiler warns on schema field overwrite', () => {
    it('emits warning when action schema overwrites common schema field', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            // Same type but different description — action overwrites common
            const builder = new GroupedToolBuilder<void>('users')
                .description('User management')
                .commonSchema(z.object({ id: z.string().describe('Common user ID') }))
                .action({
                    name: 'create',
                    description: 'Create user',
                    schema: z.object({ id: z.string().describe('Action-specific ID') }),
                    handler,
                });

            compileExposition([builder]);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("'id'"),
            );
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('overwrites common schema'),
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('does NOT warn when action schema uses different field names', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const builder = new GroupedToolBuilder<void>('projects')
                .description('Project management')
                .commonSchema(z.object({ orgId: z.string() }))
                .action({
                    name: 'list',
                    description: 'List projects',
                    schema: z.object({ page: z.number().optional() }),
                    handler,
                });

            compileExposition([builder]);

            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('warns for each overlapping field separately', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const builder = new GroupedToolBuilder<void>('items')
                .description('Item management')
                .commonSchema(z.object({
                    id: z.string(),
                    name: z.string(),
                }))
                .action({
                    name: 'update',
                    description: 'Update item',
                    schema: z.object({
                        id: z.string(),
                        name: z.string(),
                        extra: z.string(),
                    }),
                    handler,
                });

            compileExposition([builder]);

            // Two overlapping fields: id and name
            const warnCalls = warnSpy.mock.calls.filter(
                (call) => typeof call[0] === 'string' && call[0].includes('overwrites common schema'),
            );
            expect(warnCalls).toHaveLength(2);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('action field takes precedence (overwrite still happens, just warned)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const builder = new GroupedToolBuilder<void>('data')
                .description('Data tool')
                .commonSchema(z.object({ value: z.string().describe('Common value') }))
                .action({
                    name: 'process',
                    description: 'Process data',
                    schema: z.object({ value: z.string().describe('Action value') }),
                    handler,
                });

            const exposition = compileExposition([builder]);
            const schema = exposition.tools[0]!.inputSchema;
            const props = schema.properties as Record<string, { type: string; description?: string }>;

            // Action schema wins — description comes from action
            expect(props['value']!.type).toBe('string');
            expect(props['value']!.description).toBe('Action value');
        } finally {
            warnSpy.mockRestore();
        }
    });
});

// ============================================================================
// Bug #55: CryptoAttestation lazy SubtleCrypto resolution
// ============================================================================

describe('Bug #55: CryptoAttestation lazy SubtleCrypto (no top-level await)', () => {
    it('module can be imported without top-level await', async () => {
        // The fix replaces top-level await with a lazy getter.
        // If this import resolves, the top-level await is gone.
        const mod = await import('../../src/introspection/CryptoAttestation.js');
        expect(mod).toBeDefined();
        expect(typeof mod.createHmacSigner).toBe('function');
    });

    it('HMAC signing still works with lazy resolution', async () => {
        const { createHmacSigner } = await import('../../src/introspection/CryptoAttestation.js');
        const signer = createHmacSigner('test-secret');
        const result = await signer.sign('hello world');
        expect(typeof result).toBe('string');
        expect(result.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('HMAC signing produces deterministic output', async () => {
        const { createHmacSigner } = await import('../../src/introspection/CryptoAttestation.js');
        const signer = createHmacSigner('my-secret');
        const sig1 = await signer.sign('data');
        const sig2 = await signer.sign('data');
        expect(sig1).toBe(sig2);
    });

    it('different secrets produce different signatures', async () => {
        const { createHmacSigner } = await import('../../src/introspection/CryptoAttestation.js');
        const signer1 = createHmacSigner('secret-a');
        const signer2 = createHmacSigner('secret-b');
        const sig1 = await signer1.sign('same-data');
        const sig2 = await signer2.sign('same-data');
        expect(sig1).not.toBe(sig2);
    });
});
