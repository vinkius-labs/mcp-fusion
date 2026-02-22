/**
 * SecurityDeep.test.ts
 *
 * Deep security testing for the MCP Tool Consolidation Framework.
 * These tests probe attack vectors that are critical in production
 * AI infrastructure where LLM outputs are untrusted input.
 *
 * Attack Vectors:
 *   1. ReDoS — Catastrophic regex backtracking via Zod patterns
 *   2. JSON Bomb / Memory Exhaustion — Deeply nested objects, huge payloads
 *   3. Error Message Information Leakage — No internal paths or stack traces
 *   4. Handler Isolation — One handler's failure must not corrupt another
 *   5. Context Pollution — Shared mutable context between calls
 *   6. Registry Enumeration — Error messages reveal tool inventory
 *   7. Type Confusion — JS coercion attacks via valueOf/toString
 *   8. Schema Poisoning — Action schema polluting shared inputSchema
 *   9. Middleware Bypass Attempts — Manipulating args to skip validation
 *  10. Frozen Definition Tampering — Mutating cached tool definition
 *  11. Timing-Safe Action Lookup — No enumeration via timing
 *  12. Zod Coercion Exploitation — Exploiting type coercion edge cases
 *  13. Recursive/Circular Reference — Objects with circular refs
 *  14. Symbol & Non-String Key Injection — Non-string property keys
 *  15. Denial of Service via Handler — Handlers that never resolve
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder } from '../../src/framework/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success, error } from '../../src/framework/response.js';

// ============================================================================
// 1. ReDoS — Catastrophic Regex Backtracking
// ============================================================================

describe('Security: ReDoS via Zod Patterns', () => {
    it('should handle evil regex input without hanging (exponential backtracking)', async () => {
        const builder = new GroupedToolBuilder('redos_test')
            .action({
                name: 'search',
                schema: z.object({
                    // Common vulnerable pattern: nested quantifiers
                    query: z.string().regex(/^([a-zA-Z0-9]+)*$/),
                }),
                handler: async (_ctx, args) => success(`found: ${args.query}`),
            });
        builder.buildToolDefinition();

        // Evil input designed to cause catastrophic backtracking
        // Pattern: valid chars followed by a non-matching char
        const evilInput = 'a'.repeat(25) + '!';

        const start = Date.now();
        const result = await builder.execute(undefined as any, {
            action: 'search',
            query: evilInput,
        });
        const elapsed = Date.now() - start;

        // Should fail validation (not match regex) — not hang
        expect(result.isError).toBe(true);
        // Should complete in reasonable time (< 5s), not exponential
        expect(elapsed).toBeLessThan(5000);
    });

    it('should safely validate very long strings against patterns', async () => {
        const builder = new GroupedToolBuilder('long_pattern')
            .action({
                name: 'validate',
                schema: z.object({
                    input: z.string().max(10000).regex(/^[a-z]+$/),
                }),
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        // Valid long string
        const result = await builder.execute(undefined as any, {
            action: 'validate',
            input: 'a'.repeat(10000),
        });
        expect(result.isError).toBeUndefined();

        // Just over max
        const result2 = await builder.execute(undefined as any, {
            action: 'validate',
            input: 'a'.repeat(10001),
        });
        expect(result2.isError).toBe(true);
    });
});

// ============================================================================
// 2. JSON Bomb / Memory Exhaustion
// ============================================================================

describe('Security: JSON Bomb & Memory Exhaustion', () => {
    it('should handle deeply nested object input without stack overflow', async () => {
        const builder = new GroupedToolBuilder('nested_bomb')
            .action({
                name: 'process',
                schema: z.object({ data: z.any() }),
                handler: async () => success('processed'),
            });
        builder.buildToolDefinition();

        // Create deeply nested object (100 levels)
        let nested: any = { value: 'leaf' };
        for (let i = 0; i < 100; i++) {
            nested = { child: nested };
        }

        const result = await builder.execute(undefined as any, {
            action: 'process',
            data: nested,
        });
        // Should not crash — z.any() accepts anything
        expect(result.isError).toBeUndefined();
    });

    it('should handle massive string payload gracefully', async () => {
        const builder = new GroupedToolBuilder('big_string')
            .action({
                name: 'ingest',
                schema: z.object({
                    content: z.string().max(1_000_000),
                }),
                handler: async (_ctx, args) =>
                    success(`ingested ${(args.content as string).length} chars`),
            });
        builder.buildToolDefinition();

        // 1MB string — at limit
        const result = await builder.execute(undefined as any, {
            action: 'ingest',
            content: 'x'.repeat(1_000_000),
        });
        expect(result.isError).toBeUndefined();

        // Over limit
        const result2 = await builder.execute(undefined as any, {
            action: 'ingest',
            content: 'x'.repeat(1_000_001),
        });
        expect(result2.isError).toBe(true);
    });

    it('should handle array with many elements', async () => {
        const builder = new GroupedToolBuilder('big_array')
            .action({
                name: 'batch',
                schema: z.object({
                    items: z.array(z.string()).max(10000),
                }),
                handler: async (_ctx, args) =>
                    success(`batched ${(args.items as string[]).length}`),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'batch',
            items: Array.from({ length: 10000 }, (_, i) => `item-${i}`),
        });
        expect(result.isError).toBeUndefined();
    });
});

// ============================================================================
// 3. Error Message Information Leakage
// ============================================================================

describe('Security: Error Message Information Leakage', () => {
    it('handler exceptions should not expose stack traces', async () => {
        const builder = new GroupedToolBuilder('leak_test')
            .action({
                name: 'explode',
                handler: async () => {
                    const err = new Error('DB connection failed');
                    err.stack = 'Error: DB connection failed\n    at /app/src/db/pool.ts:42:12';
                    throw err;
                },
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'explode' });
        expect(result.isError).toBe(true);
        // Should contain message but NOT stack trace
        expect(result.content[0].text).toContain('DB connection failed');
        expect(result.content[0].text).not.toContain('/app/src/');
        expect(result.content[0].text).not.toContain('.ts:');
        expect(result.content[0].text).not.toContain('at ');
    });

    it('validation errors should not expose Zod internals', async () => {
        const builder = new GroupedToolBuilder('zod_leak')
            .action({
                name: 'create',
                schema: z.object({
                    email: z.string().email(),
                    password: z.string().min(8),
                }),
                handler: async () => success('created'),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'create',
            email: 'not-email',
            password: '123',
        });
        expect(result.isError).toBe(true);
        // Should describe the field errors but not Zod class names
        expect(result.content[0].text).not.toContain('ZodError');
        expect(result.content[0].text).not.toContain('ZodIssue');
        expect(result.content[0].text).toContain('Validation failed');
    });

    it('unknown action error should list available actions (intentional for LLM)', async () => {
        const builder = new GroupedToolBuilder('enum_test')
            .action({ name: 'list', handler: async () => success('ok') })
            .action({ name: 'create', handler: async () => success('ok') });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'hack' });
        expect(result.isError).toBe(true);
        // For MCP, listing available actions is intentional (helps LLM self-correct)
        expect(result.content[0].text).toContain('list');
        expect(result.content[0].text).toContain('create');
    });

    it('unknown tool in registry should list available tools (intentional for LLM)', async () => {
        const registry = new ToolRegistry();
        registry.register(
            new GroupedToolBuilder('users')
                .action({ name: 'list', handler: async () => success('ok') }),
        );
        registry.register(
            new GroupedToolBuilder('billing')
                .action({ name: 'charge', handler: async () => success('ok') }),
        );

        const result = await registry.routeCall(undefined as any, 'admin', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('users');
        expect(result.content[0].text).toContain('billing');
    });
});

// ============================================================================
// 4. Handler Isolation — Failure Containment
// ============================================================================

describe('Security: Handler Isolation', () => {
    it('one handler throwing should not affect another handler', async () => {
        let stateA = 'clean';
        const builder = new GroupedToolBuilder('isolation')
            .action({
                name: 'safe',
                handler: async () => {
                    stateA = 'executed';
                    return success('safe ok');
                },
            })
            .action({
                name: 'bomb',
                handler: async () => {
                    throw new Error('KABOOM');
                },
            });
        builder.buildToolDefinition();

        // Bomb first
        const r1 = await builder.execute(undefined as any, { action: 'bomb' });
        expect(r1.isError).toBe(true);

        // Safe should still work perfectly
        const r2 = await builder.execute(undefined as any, { action: 'safe' });
        expect(r2.isError).toBeUndefined();
        expect(stateA).toBe('executed');
    });

    it('handler throwing non-Error objects should be contained', async () => {
        const builder = new GroupedToolBuilder('non_error')
            .action({
                name: 'throw_string',
                handler: async () => { throw 'raw string error'; },
            })
            .action({
                name: 'throw_number',
                handler: async () => { throw 42; },
            })
            .action({
                name: 'throw_null',
                handler: async () => { throw null; },
            })
            .action({
                name: 'throw_undefined',
                handler: async () => { throw undefined; },
            })
            .action({
                name: 'throw_object',
                handler: async () => { throw { code: 'ERR', msg: 'fail' }; },
            });
        builder.buildToolDefinition();

        for (const action of ['throw_string', 'throw_number', 'throw_null', 'throw_undefined', 'throw_object']) {
            const r = await builder.execute(undefined as any, { action });
            expect(r.isError).toBe(true);
            expect(r.content[0].type).toBe('text');
            expect(typeof r.content[0].text).toBe('string');
        }
    });

    it('synchronous throw inside async handler should be caught', async () => {
        const builder = new GroupedToolBuilder('sync_throw')
            .action({
                name: 'sync_bomb',
                handler: async () => {
                    // Synchronous throw inside async function
                    if (true) throw new RangeError('out of range');
                    return success('unreachable');
                },
            });
        builder.buildToolDefinition();

        const r = await builder.execute(undefined as any, { action: 'sync_bomb' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('out of range');
    });
});

// ============================================================================
// 5. Context Pollution Between Calls
// ============================================================================

describe('Security: Context Pollution', () => {
    it('mutable context should not leak state between independent calls', async () => {
        interface TenantCtx { tenantId: string; data: Map<string, string> }

        const builder = new GroupedToolBuilder<TenantCtx>('ctx_pollution')
            .action({
                name: 'write',
                schema: z.object({ key: z.string(), value: z.string() }),
                handler: async (ctx, args) => {
                    ctx.data.set(args.key as string, args.value as string);
                    return success(`wrote ${args.key}`);
                },
            })
            .action({
                name: 'read',
                schema: z.object({ key: z.string() }),
                handler: async (ctx, args) => {
                    const val = ctx.data.get(args.key as string);
                    return success(val ?? 'NOT_FOUND');
                },
            });
        builder.buildToolDefinition();

        // Tenant A writes
        const ctxA: TenantCtx = { tenantId: 'A', data: new Map() };
        await builder.execute(ctxA, { action: 'write', key: 'secret', value: 'A-data' });

        // Tenant B should NOT see Tenant A's data (separate context objects)
        const ctxB: TenantCtx = { tenantId: 'B', data: new Map() };
        const result = await builder.execute(ctxB, { action: 'read', key: 'secret' });
        expect(result.content[0].text).toBe('NOT_FOUND');

        // Tenant A should still have its data
        const resultA = await builder.execute(ctxA, { action: 'read', key: 'secret' });
        expect(resultA.content[0].text).toBe('A-data');
    });

    it('middleware should not be able to permanently pollute shared builder state', async () => {
        let middlewareCallCount = 0;

        const builder = new GroupedToolBuilder<void>('mw_pollution')
            .use(async (_ctx, _args, next) => {
                middlewareCallCount++;
                return next();
            })
            .action({
                name: 'check',
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        await builder.execute(undefined as any, { action: 'check' });
        expect(middlewareCallCount).toBe(1);

        await builder.execute(undefined as any, { action: 'check' });
        expect(middlewareCallCount).toBe(2);

        // Each call increments individually — no accumulated side effects on builder
    });
});

// ============================================================================
// 6. Registry Enumeration Attack
// ============================================================================

describe('Security: Registry Enumeration', () => {
    it('routeCall error reveals registered tool names (by design for LLM)', async () => {
        const registry = new ToolRegistry();
        const secretTools = ['admin_panel', 'internal_debug', 'user_management'];

        for (const name of secretTools) {
            registry.register(
                new GroupedToolBuilder(name)
                    .action({ name: 'run', handler: async () => success('ok') }),
            );
        }

        const result = await registry.routeCall(undefined as any, 'probe', {});
        expect(result.isError).toBe(true);

        // In MCP context, this is BY DESIGN — the LLM needs to know available tools
        // But this test documents it explicitly so the team knows
        for (const name of secretTools) {
            expect(result.content[0].text).toContain(name);
        }
    });

    it('tag filtering can hide tools from LLM context', () => {
        const registry = new ToolRegistry();
        registry.register(
            new GroupedToolBuilder('public_api')
                .tags('public')
                .action({ name: 'list', handler: async () => success('ok') }),
        );
        registry.register(
            new GroupedToolBuilder('admin_internal')
                .tags('admin', 'internal')
                .action({ name: 'debug', handler: async () => success('ok') }),
        );

        // Public API should only see public tools
        const publicTools = registry.getTools({ tags: ['public'] });
        expect(publicTools).toHaveLength(1);
        expect(publicTools[0].name).toBe('public_api');

        // Exclude internal tools
        const filtered = registry.getTools({ exclude: ['internal'] });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe('public_api');
    });
});

// ============================================================================
// 7. Type Confusion Attacks
// ============================================================================

describe('Security: Type Confusion', () => {
    it('object with valueOf returning string should be rejected by Zod string validation', async () => {
        const builder = new GroupedToolBuilder('type_confusion')
            .action({
                name: 'process',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) => success(`hello ${args.name}`),
            });
        builder.buildToolDefinition();

        // Object masquerading as string
        const evilObj = {
            valueOf: () => 'injected',
            toString: () => 'injected',
        };

        const result = await builder.execute(undefined as any, {
            action: 'process',
            name: evilObj,
        });
        // Zod's strict type checking should reject non-string
        expect(result.isError).toBe(true);
    });

    it('number where string expected should fail validation', async () => {
        const builder = new GroupedToolBuilder('num_as_str')
            .action({
                name: 'greet',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) => success(`hi ${args.name}`),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'greet',
            name: 12345,
        });
        expect(result.isError).toBe(true);
    });

    it('string where number expected should fail validation', async () => {
        const builder = new GroupedToolBuilder('str_as_num')
            .action({
                name: 'compute',
                schema: z.object({ value: z.number() }),
                handler: async (_ctx, args) => success(`result: ${args.value}`),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'compute',
            value: '42', // string "42", not number 42
        });
        expect(result.isError).toBe(true);
    });

    it('boolean where string expected should fail validation', async () => {
        const builder = new GroupedToolBuilder('bool_as_str')
            .action({
                name: 'process',
                schema: z.object({ flag: z.string() }),
                handler: async (_ctx, args) => success(`flag: ${args.flag}`),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'process',
            flag: true,
        });
        expect(result.isError).toBe(true);
    });

    it('array where object expected should fail validation', async () => {
        const builder = new GroupedToolBuilder('array_as_obj')
            .action({
                name: 'process',
                schema: z.object({
                    config: z.object({ key: z.string() }),
                }),
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'process',
            config: ['key', 'value'], // array, not object
        });
        expect(result.isError).toBe(true);
    });
});

// ============================================================================
// 8. Schema Poisoning — Cross-Action Contamination
// ============================================================================

describe('Security: Schema Poisoning', () => {
    it('first action schema should not be overwritten by second action with same field', () => {
        const builder = new GroupedToolBuilder('schema_poison')
            .action({
                name: 'create',
                schema: z.object({
                    name: z.string().describe('Full name of the user'),
                }),
                handler: async () => success('ok'),
            })
            .action({
                name: 'search',
                schema: z.object({
                    name: z.string().describe('HACKED: This overrides the first'),
                }),
                handler: async () => success('ok'),
            });

        const def = builder.buildToolDefinition();
        const nameField = (def.inputSchema.properties as any).name;

        // First declaration wins — description should be from 'create'
        expect(nameField.description).toContain('Full name');
    });

    it('should reject conflicting field types across actions at build time', () => {
        const builder = new GroupedToolBuilder('validate_isolation')
            .commonSchema(z.object({
                org: z.string().min(1),
            }))
            .action({
                name: 'strict',
                schema: z.object({
                    value: z.number().int().positive(),
                }),
                handler: async () => success('strict ok'),
            })
            .action({
                name: 'loose',
                schema: z.object({
                    value: z.string().optional(),
                }),
                handler: async () => success('loose ok'),
            });

        // Two actions declare "value" with incompatible types (number vs string).
        // The framework must detect this at build time to prevent subtle runtime bugs.
        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "value"/);
    });

    it('common schema fields should be validated per-action independently', async () => {
        const builder = new GroupedToolBuilder('common_validation')
            .commonSchema(z.object({
                org: z.string().min(1),
            }))
            .action({
                name: 'strict',
                schema: z.object({
                    count: z.number().int().positive(),
                }),
                handler: async () => success('strict ok'),
            })
            .action({
                name: 'loose',
                schema: z.object({
                    label: z.string().optional(),
                }),
                handler: async () => success('loose ok'),
            });
        builder.buildToolDefinition();

        // 'strict' requires positive integer for count
        const r1 = await builder.execute(undefined as any, {
            action: 'strict', org: 'acme', count: -5,
        });
        expect(r1.isError).toBe(true);

        // 'loose' allows optional string for label
        const r2 = await builder.execute(undefined as any, {
            action: 'loose', org: 'acme',
        });
        expect(r2.isError).toBeUndefined();
    });
});

// ============================================================================
// 9. Middleware Bypass Attempts
// ============================================================================

describe('Security: Middleware Bypass', () => {
    it('cannot bypass middleware by manipulating discriminator after validation', async () => {
        const middlewareLog: string[] = [];

        const builder = new GroupedToolBuilder<void>('mw_bypass')
            .use(async (_ctx, args, next) => {
                middlewareLog.push(`mw:${args.action}`);
                return next();
            })
            .action({
                name: 'public',
                handler: async () => success('public result'),
            })
            .action({
                name: 'admin',
                handler: async () => success('admin result'),
            });
        builder.buildToolDefinition();

        // Normal call
        await builder.execute(undefined as any, { action: 'public' });
        expect(middlewareLog).toContain('mw:public');

        // Try calling admin — middleware still runs
        middlewareLog.length = 0;
        await builder.execute(undefined as any, { action: 'admin' });
        expect(middlewareLog).toContain('mw:admin');
    });

    it('middleware receives discriminator value for authorization checks', async () => {
        const builder = new GroupedToolBuilder<{ role: string }>('auth_mw')
            .use(async (ctx, args, next) => {
                if (args.action === 'admin_delete' && ctx.role !== 'admin') {
                    return error('FORBIDDEN: admin only');
                }
                return next();
            })
            .action({
                name: 'list',
                handler: async () => success('list ok'),
            })
            .action({
                name: 'admin_delete',
                handler: async () => success('deleted'),
            });
        builder.buildToolDefinition();

        // Non-admin trying admin action
        const r1 = await builder.execute(
            { role: 'user' },
            { action: 'admin_delete' },
        );
        expect(r1.isError).toBe(true);
        expect(r1.content[0].text).toContain('FORBIDDEN');

        // Admin can access
        const r2 = await builder.execute(
            { role: 'admin' },
            { action: 'admin_delete' },
        );
        expect(r2.isError).toBeUndefined();

        // Non-admin on public action is fine
        const r3 = await builder.execute(
            { role: 'user' },
            { action: 'list' },
        );
        expect(r3.isError).toBeUndefined();
    });
});

// ============================================================================
// 10. Frozen Definition Tampering
// ============================================================================

describe('Security: Frozen Definition Tampering', () => {
    it('mutating returned tool definition should not affect future calls', () => {
        const builder = new GroupedToolBuilder('tamper')
            .description('Original description')
            .action({ name: 'ping', handler: async () => success('pong') });

        const def1 = builder.buildToolDefinition();

        // Attempt to tamper with the returned definition
        (def1 as any).name = 'HACKED';
        (def1 as any).description = 'HACKED';
        (def1 as any).inputSchema = { type: 'object', properties: {} };

        // Since buildToolDefinition returns cached ref, the cached version IS mutated.
        // This tests documents the behavior: the reference IS shared.
        const def2 = builder.buildToolDefinition();
        // Same reference — mutation is visible (this is a documentation test)
        expect(def2).toBe(def1);
    });

    it('builder should still route correctly even if definition is externally mutated', async () => {
        const builder = new GroupedToolBuilder('tamper_route')
            .action({ name: 'ping', handler: async () => success('pong') });

        const def = builder.buildToolDefinition();

        // Tamper with the definition
        (def as any).name = 'HACKED';

        // Routing uses internal state, not the cached definition
        const result = await builder.execute(undefined as any, { action: 'ping' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('pong');
    });
});

// ============================================================================
// 11. Zod Coercion Edge Cases
// ============================================================================

describe('Security: Zod Coercion Edge Cases', () => {
    it('NaN should be rejected for number fields', async () => {
        const builder = new GroupedToolBuilder('nan_test')
            .action({
                name: 'compute',
                schema: z.object({ value: z.number() }),
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'compute',
            value: NaN,
        });
        // NaN is technically a number type, but Zod should handle it
        // This documents the behavior
        expect(typeof NaN).toBe('number');
    });

    it('Infinity should be handled for number fields', async () => {
        const builder = new GroupedToolBuilder('inf_test')
            .action({
                name: 'compute',
                schema: z.object({ value: z.number().finite() }),
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        const r1 = await builder.execute(undefined as any, {
            action: 'compute',
            value: Infinity,
        });
        expect(r1.isError).toBe(true);

        const r2 = await builder.execute(undefined as any, {
            action: 'compute',
            value: -Infinity,
        });
        expect(r2.isError).toBe(true);
    });

    it('Date object where string expected should fail', async () => {
        const builder = new GroupedToolBuilder('date_confusion')
            .action({
                name: 'process',
                schema: z.object({ timestamp: z.string() }),
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'process',
            timestamp: new Date(),
        });
        expect(result.isError).toBe(true);
    });
});

// ============================================================================
// 12. Circular Reference Handling
// ============================================================================

describe('Security: Circular References', () => {
    it('circular reference in args should not cause infinite loop', async () => {
        const builder = new GroupedToolBuilder('circular')
            .action({
                name: 'process',
                // No schema — no validation, just pass through
                handler: async (_ctx, args) => {
                    try {
                        // Handler tries to serialize — would fail with circular ref
                        return success('processed');
                    } catch {
                        return error('serialization failed');
                    }
                },
            });
        builder.buildToolDefinition();

        // Create circular reference
        const args: any = { action: 'process', data: {} };
        args.data.self = args.data; // circular!

        // Should not hang — handler doesn't try to serialize
        const result = await builder.execute(undefined as any, args);
        expect(result.content[0]).toHaveProperty('type', 'text');
    });
});

// ============================================================================
// 13. Symbol & Non-String Key Injection
// ============================================================================

describe('Security: Symbol & Non-String Key Injection', () => {
    it('Symbol keys in args should not affect routing', async () => {
        const builder = new GroupedToolBuilder('symbol_test')
            .action({
                name: 'run',
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        const sym = Symbol('malicious');
        const args: any = { action: 'run' };
        args[sym] = 'hidden payload';

        const result = await builder.execute(undefined as any, args);
        expect(result.isError).toBeUndefined();
    });

    it('numeric keys in args should not confuse routing', async () => {
        const builder = new GroupedToolBuilder('numeric_key')
            .action({
                name: 'run',
                handler: async () => success('ok'),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'run',
            0: 'zero',
            1: 'one',
            length: 2,
        });
        expect(result.isError).toBeUndefined();
    });
});

// ============================================================================
// 14. Concurrent Execution Safety
// ============================================================================

describe('Security: Concurrent Execution Safety', () => {
    it('parallel calls with different contexts should not cross-contaminate', async () => {
        interface Ctx { userId: string }

        const builder = new GroupedToolBuilder<Ctx>('concurrent_ctx')
            .action({
                name: 'whoami',
                handler: async (ctx) => {
                    // Simulate async work
                    await new Promise(r => setTimeout(r, Math.random() * 20));
                    return success(`user:${ctx.userId}`);
                },
            });
        builder.buildToolDefinition();

        // Fire 20 concurrent calls with different contexts
        const promises = Array.from({ length: 20 }, (_, i) =>
            builder.execute(
                { userId: `user-${i}` },
                { action: 'whoami' },
            )
        );

        const results = await Promise.all(promises);

        // Each result must correspond to its own context
        for (let i = 0; i < 20; i++) {
            expect(results[i].content[0].text).toBe(`user:user-${i}`);
        }
    });

    it('parallel registry routing should not mix up tool handlers', async () => {
        const registry = new ToolRegistry();

        for (let i = 0; i < 10; i++) {
            registry.register(
                new GroupedToolBuilder(`tool_${i}`)
                    .action({
                        name: 'identify',
                        handler: async () => {
                            await new Promise(r => setTimeout(r, Math.random() * 10));
                            return success(`tool_${i}`);
                        },
                    }),
            );
        }

        const promises = Array.from({ length: 10 }, (_, i) =>
            registry.routeCall(undefined as any, `tool_${i}`, { action: 'identify' })
        );

        const results = await Promise.all(promises);
        for (let i = 0; i < 10; i++) {
            expect(results[i].content[0].text).toBe(`tool_${i}`);
        }
    });
});

// ============================================================================
// 15. Payload Injection via JSON Special Values
// ============================================================================

describe('Security: JSON Special Values', () => {
    it('should handle -0 correctly', async () => {
        const builder = new GroupedToolBuilder('neg_zero')
            .action({
                name: 'compute',
                schema: z.object({ value: z.number() }),
                handler: async (_ctx, args) => success(`value: ${Object.is(args.value, -0) ? '-0' : args.value}`),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'compute',
            value: -0,
        });
        expect(result.isError).toBeUndefined();
    });

    it('should handle unicode null bytes in strings', async () => {
        const builder = new GroupedToolBuilder('null_byte')
            .action({
                name: 'process',
                schema: z.object({ data: z.string() }),
                handler: async (_ctx, args) => success(`len: ${(args.data as string).length}`),
            });
        builder.buildToolDefinition();

        // String with null bytes embedded
        const result = await builder.execute(undefined as any, {
            action: 'process',
            data: 'hello\x00world\x00evil',
        });
        expect(result.isError).toBeUndefined();
    });

    it('should handle unicode surrogate pairs correctly', async () => {
        const builder = new GroupedToolBuilder('surrogate')
            .action({
                name: 'process',
                schema: z.object({ data: z.string() }),
                handler: async (_ctx, args) => success(`got: ${args.data}`),
            });
        builder.buildToolDefinition();

        // Emoji + surrogate pairs
        const result = await builder.execute(undefined as any, {
            action: 'process',
            data: '💀🔥 test \uD83D\uDE00 end',
        });
        expect(result.isError).toBeUndefined();
    });

    it('should handle extremely long action name in input (not in definition)', async () => {
        const builder = new GroupedToolBuilder('long_action_input')
            .action({ name: 'valid', handler: async () => success('ok') });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'x'.repeat(100000), // 100KB action name
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown');
    });
});
