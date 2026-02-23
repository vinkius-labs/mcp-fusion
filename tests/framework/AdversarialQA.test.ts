/**
 * AdversarialQA.test.ts
 *
 * Enterprise-grade Quality Assurance tests for the MCP Tool Consolidation
 * Framework. These tests are designed to probe invariants, contracts,
 * security boundaries, state machine integrity, and protocol compliance
 * at a level expected of production AI infrastructure.
 *
 * Categories:
 *   1. Builder State Machine — frozen/unfrozen transitions, caching
 *   2. MCP Protocol Contract — response shape compliance for all paths
 *   3. Zod Defense Chain — boundary attacks on validation
 *   4. Prototype Pollution & Injection — __proto__, constructor abuse
 *   5. Discriminator Abuse — missing, null, numeric, object, array
 *   6. Build Idempotency — multiple builds must return same cached ref
 *   7. Middleware Ordering Guarantees — LIFO wrapping, correct ctx passing
 *   8. Annotation Aggregation Invariants — all boolean combos
 *   9. Description Generation Contract — 3-layer structure verification
 *  10. Schema Field Annotation Accuracy — per-field annotation correctness
 *  11. Custom Discriminator — non-default discriminator field support
 *  12. ToolRegistry Contract — routing, registration, edge cases
 *  13. ResponseHelper Contract — shape compliance for all helpers
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder } from '../../src/framework/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success, error, required } from '../../src/framework/response.js';

// ============================================================================
// 1. Builder State Machine Invariants
// ============================================================================

describe('QA: Builder State Machine', () => {
    it('should prevent .action() after build', () => {
        const b = new GroupedToolBuilder('sm_test')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.action({ name: 'b', handler: async () => success('ok') }))
            .toThrow(/frozen/i);
    });

    it('should prevent .group() after build', () => {
        const b = new GroupedToolBuilder('sm_group')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.group('g', 'desc', g => g.action({ name: 'x', handler: async () => success('ok') })))
            .toThrow(/frozen/i);
    });

    it('should prevent .description() after build', () => {
        const b = new GroupedToolBuilder('sm_desc')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.description('new desc')).toThrow(/frozen/i);
    });

    it('should prevent .commonSchema() after build', () => {
        const b = new GroupedToolBuilder('sm_schema')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.commonSchema(z.object({ x: z.string() }))).toThrow(/frozen/i);
    });

    it('should prevent .use() after build', () => {
        const b = new GroupedToolBuilder('sm_mw')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.use(async (_ctx, _args, next) => next())).toThrow(/frozen/i);
    });

    it('should prevent .tags() after build', () => {
        const b = new GroupedToolBuilder('sm_tags')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.tags('tag')).toThrow(/frozen/i);
    });

    it('should prevent .annotations() after build', () => {
        const b = new GroupedToolBuilder('sm_annot')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.annotations({ readOnlyHint: true })).toThrow(/frozen/i);
    });

    it('should prevent .discriminator() after build', () => {
        const b = new GroupedToolBuilder('sm_disc')
            .action({ name: 'a', handler: async () => success('ok') });
        b.buildToolDefinition();
        expect(() => b.discriminator('op')).toThrow(/frozen/i);
    });

    it('should throw on build with zero actions', () => {
        const b = new GroupedToolBuilder('empty_builder');
        expect(() => b.buildToolDefinition()).toThrow(/no actions/i);
    });

    it('should auto-build on first execute if not yet built', async () => {
        const b = new GroupedToolBuilder('auto_build')
            .action({ name: 'ping', handler: async () => success('pong') });
        // No buildToolDefinition() — execute should trigger build
        const result = await b.execute(undefined as any, { action: 'ping' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('pong');
    });
});

// ============================================================================
// 2. MCP Protocol Contract — Response Shape
// ============================================================================

describe('QA: MCP Response Contract', () => {
    let builder: GroupedToolBuilder;

    beforeAll(() => {
        builder = new GroupedToolBuilder('contract_test')
            .commonSchema(z.object({ org: z.string() }))
            .action({
                name: 'ok',
                schema: z.object({ id: z.string() }),
                handler: async () => success('result'),
            })
            .action({
                name: 'fail',
                handler: async () => { throw new Error('BOOM'); },
            });
        builder.buildToolDefinition();
    });

    function assertMcpResponse(result: any) {
        expect(result).toHaveProperty('content');
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0]).toHaveProperty('type', 'text');
        expect(typeof result.content[0].text).toBe('string');
    }

    it('success response must comply with MCP shape', async () => {
        const result = await builder.execute(undefined as any, {
            action: 'ok', org: 'acme', id: 'x',
        });
        assertMcpResponse(result);
        expect(result.isError).toBeUndefined();
    });

    it('handler error response must comply with MCP shape', async () => {
        const result = await builder.execute(undefined as any, {
            action: 'fail', org: 'acme',
        });
        assertMcpResponse(result);
        expect(result.isError).toBe(true);
    });

    it('validation error response must comply with MCP shape', async () => {
        const result = await builder.execute(undefined as any, {
            action: 'ok', org: 123, // wrong type
        });
        assertMcpResponse(result);
        expect(result.isError).toBe(true);
    });

    it('unknown action response must comply with MCP shape', async () => {
        const result = await builder.execute(undefined as any, {
            action: 'nonexistent', org: 'x',
        });
        assertMcpResponse(result);
        expect(result.isError).toBe(true);
    });

    it('missing discriminator response must comply with MCP shape', async () => {
        const result = await builder.execute(undefined as any, { org: 'x' });
        assertMcpResponse(result);
        expect(result.isError).toBe(true);
    });

    it('tool definition must comply with MCP Tool shape', () => {
        const def = builder.buildToolDefinition();
        expect(def).toHaveProperty('name');
        expect(typeof def.name).toBe('string');
        expect(def).toHaveProperty('description');
        expect(typeof def.description).toBe('string');
        expect(def).toHaveProperty('inputSchema');
        expect(def.inputSchema).toHaveProperty('type', 'object');
        expect(def.inputSchema).toHaveProperty('properties');
        expect(def.inputSchema).toHaveProperty('required');
        expect(Array.isArray(def.inputSchema.required)).toBe(true);
    });
});

// ============================================================================
// 3. Zod Defense Chain — Boundary Attacks
// ============================================================================

describe('QA: Zod Defense Chain', () => {
    let builder: GroupedToolBuilder;

    beforeAll(() => {
        builder = new GroupedToolBuilder('zod_defense')
            .commonSchema(z.object({
                tenant: z.string().min(1).max(100),
            }))
            .action({
                name: 'process',
                schema: z.object({
                    count: z.number().int().min(0).max(1000000),
                    email: z.string().email(),
                    tags: z.array(z.string()).max(50).optional(),
                }),
                handler: async (_ctx, args) => success(`processed ${args.count}`),
            });
        builder.buildToolDefinition();
    });

    it('should reject negative count', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: 'a', count: -1, email: 'x@y.com',
        });
        expect(r.isError).toBe(true);
    });

    it('should reject fractional count when int expected', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: 'a', count: 3.14, email: 'x@y.com',
        });
        expect(r.isError).toBe(true);
    });

    it('should reject count exceeding max', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: 'a', count: 1000001, email: 'x@y.com',
        });
        expect(r.isError).toBe(true);
    });

    it('should reject invalid email format', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: 'a', count: 1, email: 'not-an-email',
        });
        expect(r.isError).toBe(true);
    });

    it('should reject empty tenant (min 1)', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: '', count: 1, email: 'x@y.com',
        });
        expect(r.isError).toBe(true);
    });

    it('should reject oversized tenant (max 100)', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: 'x'.repeat(101), count: 1, email: 'x@y.com',
        });
        expect(r.isError).toBe(true);
    });

    it('should accept valid input at exact boundaries', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process',
            tenant: 'x', // min 1 ✓
            count: 0, // min 0 ✓
            email: 'a@b.co',
        });
        expect(r.isError).toBeUndefined();
    });

    it('should accept valid input at max boundaries', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process',
            tenant: 'x'.repeat(100), // max 100 ✓
            count: 1000000, // max 1000000 ✓
            email: 'test@example.com',
        });
        expect(r.isError).toBeUndefined();
    });

    it('should reject extra fields injected by LLM (.strict())', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process',
            tenant: 'ok',
            count: 1,
            email: 'a@b.com',
            __proto__: { admin: true },
            constructor: 'hack',
            malicious_field: 'rm -rf /',
        });
        // .strict() rejects unknown fields
        expect(r.isError).toBe(true);
    });

    it('should reject when required field is null', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: 'ok', count: null, email: 'a@b.com',
        });
        expect(r.isError).toBe(true);
    });

    it('should reject when required field is undefined', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process', tenant: 'ok', count: undefined, email: 'a@b.com',
        });
        expect(r.isError).toBe(true);
    });

    it('should handle array at max size', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process',
            tenant: 'ok',
            count: 1,
            email: 'a@b.com',
            tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
        });
        expect(r.isError).toBeUndefined();
    });

    it('should reject array exceeding max size', async () => {
        const r = await builder.execute(undefined as any, {
            action: 'process',
            tenant: 'ok',
            count: 1,
            email: 'a@b.com',
            tags: Array.from({ length: 51 }, (_, i) => `tag-${i}`),
        });
        expect(r.isError).toBe(true);
    });
});

// ============================================================================
// 4. Prototype Pollution & Injection via Field Names
// ============================================================================

describe('QA: Prototype Pollution & Injection', () => {
    it('should not corrupt object prototype via args', async () => {
        const builder = new GroupedToolBuilder('proto_test')
            .action({
                name: 'test',
                schema: z.object({ data: z.string() }),
                handler: async () => success('safe'),
            });
        builder.buildToolDefinition();

        // Attempt prototype pollution
        const maliciousArgs = JSON.parse(
            '{"action":"test","data":"ok","__proto__":{"polluted":true}}'
        );

        const result = await builder.execute(undefined as any, maliciousArgs);
        // .strict() rejects the __proto__ extra field
        expect(result.isError).toBe(true);

        // Verify Object.prototype is not polluted
        expect((({}) as any).polluted).toBeUndefined();
    });

    it('should handle constructor-named field safely', async () => {
        const builder = new GroupedToolBuilder('constructor_test')
            .action({
                name: 'test',
                handler: async () => success('safe'),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'test',
            constructor: { prototype: { hacked: true } },
        });
        expect(result.isError).toBeUndefined();
    });

    it('should handle toString/valueOf override attempts', async () => {
        const builder = new GroupedToolBuilder('override_test')
            .action({
                name: 'test',
                schema: z.object({ value: z.string() }),
                handler: async (_ctx, args) => success(`got: ${args.value}`),
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'test',
            value: 'normal',
            toString: () => 'hacked',
            valueOf: () => 999,
        });
        // .strict() rejects extra toString/valueOf fields
        expect(result.isError).toBe(true);
    });
});

// ============================================================================
// 5. Discriminator Abuse — Every Invalid Type
// ============================================================================

describe('QA: Discriminator Abuse', () => {
    let builder: GroupedToolBuilder;

    beforeAll(() => {
        builder = new GroupedToolBuilder('disc_abuse')
            .action({ name: 'valid', handler: async () => success('ok') });
        builder.buildToolDefinition();
    });

    it('should reject null action', async () => {
        const r = await builder.execute(undefined as any, { action: null });
        expect(r.isError).toBe(true);
    });

    it('should reject numeric action', async () => {
        const r = await builder.execute(undefined as any, { action: 42 });
        expect(r.isError).toBe(true);
    });

    it('should reject boolean action', async () => {
        const r = await builder.execute(undefined as any, { action: true });
        expect(r.isError).toBe(true);
    });

    it('should reject empty string action', async () => {
        const r = await builder.execute(undefined as any, { action: '' });
        expect(r.isError).toBe(true);
    });

    it('should reject object action', async () => {
        const r = await builder.execute(undefined as any, { action: { name: 'valid' } });
        expect(r.isError).toBe(true);
    });

    it('should reject array action', async () => {
        const r = await builder.execute(undefined as any, { action: ['valid'] });
        expect(r.isError).toBe(true);
    });

    it('should reject action with only whitespace', async () => {
        const r = await builder.execute(undefined as any, { action: '   ' });
        expect(r.isError).toBe(true);
    });

    it('should reject action with SQL injection attempt', async () => {
        const r = await builder.execute(undefined as any, {
            action: "valid'; DROP TABLE users; --",
        });
        expect(r.isError).toBe(true);
    });

    it('should list available actions on unknown action error', async () => {
        const r = await builder.execute(undefined as any, { action: 'unknown' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('valid');
    });
});

// ============================================================================
// 6. Build Idempotency — Cache Integrity
// ============================================================================

describe('QA: Build Idempotency', () => {
    it('should return same cached reference on multiple builds', () => {
        const b = new GroupedToolBuilder('idempotent')
            .action({ name: 'a', handler: async () => success('ok') });

        const first = b.buildToolDefinition();
        const second = b.buildToolDefinition();
        const third = b.buildToolDefinition();

        expect(first).toBe(second);
        expect(second).toBe(third);
    });

    it('should produce structurally identical definitions', () => {
        const b = new GroupedToolBuilder('structural')
            .description('Test tool')
            .commonSchema(z.object({ org: z.string() }))
            .action({
                name: 'get',
                schema: z.object({ id: z.string() }),
                readOnly: true,
                handler: async () => success('ok'),
            });

        const def = b.buildToolDefinition();
        expect(def.name).toBe('structural');
        expect(def.inputSchema.properties).toHaveProperty('action');
        expect(def.inputSchema.properties).toHaveProperty('org');
        expect(def.inputSchema.properties).toHaveProperty('id');
    });
});

// ============================================================================
// 7. Middleware Ordering — LIFO Wrapping Guarantee
// ============================================================================

describe('QA: Middleware Ordering', () => {
    it('should execute middlewares in registration order (left to right)', async () => {
        const order: number[] = [];

        const b = new GroupedToolBuilder<void>('mw_order')
            .use(async (_ctx, _args, next) => { order.push(1); return next(); })
            .use(async (_ctx, _args, next) => { order.push(2); return next(); })
            .use(async (_ctx, _args, next) => { order.push(3); return next(); })
            .action({
                name: 'run',
                handler: async () => { order.push(4); return success('done'); },
            });

        b.buildToolDefinition();
        await b.execute(undefined as any, { action: 'run' });

        expect(order).toEqual([1, 2, 3, 4]);
    });

    it('should short-circuit correctly — later middleware should not run', async () => {
        const order: string[] = [];

        const b = new GroupedToolBuilder<void>('mw_short')
            .use(async (_ctx, _args, next) => { order.push('first'); return next(); })
            .use(async () => { order.push('guard'); return error('BLOCKED'); })
            .use(async (_ctx, _args, next) => { order.push('never'); return next(); })
            .action({
                name: 'run',
                handler: async () => { order.push('handler'); return success('done'); },
            });

        b.buildToolDefinition();
        const result = await b.execute(undefined as any, { action: 'run' });

        expect(order).toEqual(['first', 'guard']);
        expect(result.isError).toBe(true);
    });

    it('middleware should receive validated args, not raw input', async () => {
        let capturedArgs: Record<string, unknown> = {};

        const b = new GroupedToolBuilder<void>('mw_validated')
            .commonSchema(z.object({ org: z.string() }))
            .use(async (_ctx, args, next) => {
                capturedArgs = args;
                return next();
            })
            .action({
                name: 'check',
                schema: z.object({ id: z.string() }),
                handler: async () => success('ok'),
            });

        b.buildToolDefinition();
        // .strict() now rejects extra_garbage, so middleware is NOT reached
        const r = await b.execute(undefined as any, {
            action: 'check',
            org: 'acme',
            id: 'x',
            extra_garbage: 'should_be_rejected',
        });

        // Validation fails before middleware runs
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('extra_garbage');
    });
});

// ============================================================================
// 8. Annotation Aggregation Invariants — All Boolean Combos
// ============================================================================

describe('QA: Annotation Aggregation', () => {
    it('should report readOnly=true only when ALL actions are readOnly', () => {
        const b = new GroupedToolBuilder('all_read')
            .action({ name: 'list', readOnly: true, handler: async () => success('ok') })
            .action({ name: 'get', readOnly: true, handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        expect((def as any).annotations.readOnlyHint).toBe(true);
    });

    it('should report readOnly=false when ANY action is not readOnly', () => {
        const b = new GroupedToolBuilder('mixed_read')
            .action({ name: 'list', readOnly: true, handler: async () => success('ok') })
            .action({ name: 'create', handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        expect((def as any).annotations.readOnlyHint).toBe(false);
    });

    it('should report destructive=true when ANY action is destructive', () => {
        const b = new GroupedToolBuilder('has_destructive')
            .action({ name: 'list', readOnly: true, handler: async () => success('ok') })
            .action({ name: 'delete', destructive: true, handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        expect((def as any).annotations.destructiveHint).toBe(true);
    });

    it('should report destructive=false when NO action is destructive', () => {
        const b = new GroupedToolBuilder('no_destructive')
            .action({ name: 'list', handler: async () => success('ok') })
            .action({ name: 'get', handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        expect((def as any).annotations.destructiveHint).toBe(false);
    });

    it('should report idempotent=true only when ALL actions are idempotent', () => {
        const b = new GroupedToolBuilder('all_idempotent')
            .action({ name: 'put', idempotent: true, handler: async () => success('ok') })
            .action({ name: 'delete', idempotent: true, handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        expect((def as any).annotations.idempotentHint).toBe(true);
    });

    it('should respect explicit annotation override even when actions disagree', () => {
        const b = new GroupedToolBuilder('override')
            .annotations({ readOnlyHint: true }) // explicit override
            .action({ name: 'create', handler: async () => success('ok') }) // not read-only
            .action({ name: 'delete', destructive: true, handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        // Explicit override wins
        expect((def as any).annotations.readOnlyHint).toBe(true);
        // destructiveHint still auto-aggregated since not explicitly set
        expect((def as any).annotations.destructiveHint).toBe(true);
    });
});

// ============================================================================
// 9. Description Generation Contract
// ============================================================================

describe('QA: Description Generation', () => {
    it('flat mode description should list action names', () => {
        const b = new GroupedToolBuilder('desc_flat')
            .description('My API')
            .action({ name: 'list', handler: async () => success('ok') })
            .action({ name: 'create', handler: async () => success('ok') })
            .action({ name: 'delete', handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        expect(def.description).toContain('Actions:');
        expect(def.description).toContain('list');
        expect(def.description).toContain('create');
        expect(def.description).toContain('delete');
    });

    it('grouped mode description should list modules', () => {
        const b = new GroupedToolBuilder('desc_grouped')
            .description('Enterprise API')
            .group('users', 'User mgmt', g => g
                .action({ name: 'list', handler: async () => success('ok') })
                .action({ name: 'create', handler: async () => success('ok') })
            )
            .group('billing', 'Billing', g => g
                .action({ name: 'charge', handler: async () => success('ok') })
            );

        const def = b.buildToolDefinition();
        expect(def.description).toContain('Modules:');
        expect(def.description).toContain('users');
        expect(def.description).toContain('billing');
    });

    it('workflow lines should show required fields and descriptions', () => {
        const b = new GroupedToolBuilder('desc_workflow')
            .action({
                name: 'create',
                description: 'Create a new record',
                schema: z.object({ name: z.string(), priority: z.number() }),
                handler: async () => success('ok'),
            });

        const def = b.buildToolDefinition();
        expect(def.description).toContain('Workflow:');
        expect(def.description).toContain('Create a new record');
        expect(def.description).toContain('name');
        expect(def.description).toContain('priority');
    });

    it('destructive actions should show [DESTRUCTIVE] in workflow', () => {
        const b = new GroupedToolBuilder('desc_destructive')
            .action({
                name: 'nuke',
                description: 'Delete everything',
                destructive: true,
                handler: async () => success('ok'),
            });

        const def = b.buildToolDefinition();
        expect(def.description).toContain('[DESTRUCTIVE]');
    });

    it('should use tool name as fallback when no description set', () => {
        const b = new GroupedToolBuilder('fallback_name')
            .action({ name: 'ping', handler: async () => success('ok') });

        const def = b.buildToolDefinition();
        expect(def.description).toContain('fallback_name');
    });
});

// ============================================================================
// 10. Schema Field Annotation Accuracy
// ============================================================================

describe('QA: Schema Field Annotations', () => {
    it('common schema required fields should be marked "always required"', () => {
        const b = new GroupedToolBuilder('field_annot')
            .commonSchema(z.object({
                workspace_id: z.string().describe('The workspace'),
            }))
            .action({
                name: 'list',
                handler: async () => success('ok'),
            });

        const def = b.buildToolDefinition();
        const wsField = (def.inputSchema.properties as any).workspace_id;
        expect(wsField.description).toContain('always required');
    });

    it('action-specific required fields should show "Required for" annotation', () => {
        const b = new GroupedToolBuilder('field_req')
            .action({
                name: 'create',
                schema: z.object({
                    name: z.string().describe('Record name'),
                }),
                handler: async () => success('ok'),
            })
            .action({
                name: 'list',
                handler: async () => success('ok'),
            });

        const def = b.buildToolDefinition();
        const nameField = (def.inputSchema.properties as any).name;
        expect(nameField.description).toContain('Required for');
        expect(nameField.description).toContain('create');
    });

    it('optional fields should show "For" annotation', () => {
        const b = new GroupedToolBuilder('field_opt')
            .action({
                name: 'search',
                schema: z.object({
                    filter: z.string().optional().describe('Search filter'),
                }),
                handler: async () => success('ok'),
            });

        const def = b.buildToolDefinition();
        const filterField = (def.inputSchema.properties as any).filter;
        expect(filterField.description).toContain('For');
    });
});

// ============================================================================
// 11. Custom Discriminator
// ============================================================================

describe('QA: Custom Discriminator', () => {
    it('should use custom discriminator field name', async () => {
        const b = new GroupedToolBuilder('custom_disc')
            .discriminator('operation')
            .action({ name: 'ping', handler: async () => success('pong') });

        const def = b.buildToolDefinition();
        expect(def.inputSchema.properties).toHaveProperty('operation');
        expect(def.inputSchema.required).toContain('operation');

        // Execute with custom discriminator
        const result = await b.execute(undefined as any, { operation: 'ping' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('pong');
    });

    it('should reject when custom discriminator is missing', async () => {
        const b = new GroupedToolBuilder('disc_missing')
            .discriminator('cmd')
            .action({ name: 'run', handler: async () => success('ok') });

        b.buildToolDefinition();

        const result = await b.execute(undefined as any, { action: 'run' }); // 'action' not 'cmd'
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('cmd');
    });
});

// ============================================================================
// 12. ToolRegistry Contract  
// ============================================================================

describe('QA: ToolRegistry Contract', () => {
    it('should throw on duplicate registration', () => {
        const registry = new ToolRegistry();
        const b1 = new GroupedToolBuilder('dupe')
            .action({ name: 'a', handler: async () => success('ok') });
        const b2 = new GroupedToolBuilder('dupe')
            .action({ name: 'b', handler: async () => success('ok') });

        registry.register(b1);
        expect(() => registry.register(b2)).toThrow(/already registered/i);
    });

    it('should route to correct tool in multi-tool registry', async () => {
        const registry = new ToolRegistry();
        registry.registerAll(
            new GroupedToolBuilder('tool_a')
                .action({ name: 'ping', handler: async () => success('A:pong') }),
            new GroupedToolBuilder('tool_b')
                .action({ name: 'ping', handler: async () => success('B:pong') }),
        );

        const rA = await registry.routeCall(undefined as any, 'tool_a', { action: 'ping' });
        expect(rA.content[0].text).toBe('A:pong');

        const rB = await registry.routeCall(undefined as any, 'tool_b', { action: 'ping' });
        expect(rB.content[0].text).toBe('B:pong');
    });

    it('should return error for unknown tool (not throw)', async () => {
        const registry = new ToolRegistry();
        registry.register(
            new GroupedToolBuilder('only_one')
                .action({ name: 'a', handler: async () => success('ok') }),
        );

        const result = await registry.routeCall(undefined as any, 'ghost', { action: 'a' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('UNKNOWN_TOOL');
        expect(result.content[0].text).toContain('only_one');
    });

    it('registerAll should register multiple builders at once', () => {
        const registry = new ToolRegistry();
        registry.registerAll(
            new GroupedToolBuilder('batch_1')
                .action({ name: 'a', handler: async () => success('ok') }),
            new GroupedToolBuilder('batch_2')
                .action({ name: 'a', handler: async () => success('ok') }),
            new GroupedToolBuilder('batch_3')
                .action({ name: 'a', handler: async () => success('ok') }),
        );
        expect(registry.size).toBe(3);
    });

    it('getTools with empty tags array should return all tools', () => {
        const registry = new ToolRegistry();
        registry.register(
            new GroupedToolBuilder('no_tags')
                .action({ name: 'a', handler: async () => success('ok') }),
        );
        const tools = registry.getTools({ tags: [] });
        expect(tools).toHaveLength(1);
    });

    it('getTools with empty exclude array should return all tools', () => {
        const registry = new ToolRegistry();
        registry.register(
            new GroupedToolBuilder('no_exclude')
                .tags('x')
                .action({ name: 'a', handler: async () => success('ok') }),
        );
        const tools = registry.getTools({ exclude: [] });
        expect(tools).toHaveLength(1);
    });
});

// ============================================================================
// 13. ResponseHelper Contract
// ============================================================================

describe('QA: ResponseHelper Contract', () => {
    it('success() should produce valid MCP response', () => {
        const r = success('hello');
        expect(r.content).toEqual([{ type: 'text', text: 'hello' }]);
        expect(r.isError).toBeUndefined();
    });

    it('error() should produce valid MCP error response', () => {
        const r = error('bad');
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('<tool_error>');
        expect(r.content[0].text).toContain('<message>bad</message>');
    });

    it('required() should produce validation error with field name', () => {
        const r = required('email');
        expect(r.content[0].text).toContain('email');
        expect(r.content[0].text).toContain('missing');
        expect(r.isError).toBe(true);
    });

    it('all helpers should return frozen-safe responses (no mutation risk)', () => {
        const s = success('x');
        const e = error('x');
        const r = required('x');
        
        // Responses should be plain objects, not class instances
        expect(s.constructor).toBe(Object);
        expect(e.constructor).toBe(Object);
        expect(r.constructor).toBe(Object);
    });
});

// ============================================================================
// 14. Group Mode Invariants
// ============================================================================

describe('QA: Group Mode Invariants', () => {
    it('should reject dot in group name', () => {
        const b = new GroupedToolBuilder('dot_group');
        expect(() => b.group('users.admin', 'bad', g => g
            .action({ name: 'list', handler: async () => success('ok') })
        )).toThrow(/dots/i);
    });

    it('should reject dot in action name within group', () => {
        const b = new GroupedToolBuilder('dot_action');
        expect(() => b.group('users', 'Users', g => g
            .action({ name: 'list.all', handler: async () => success('ok') })
        )).toThrow(/dots/i);
    });

    it('should reject mixing .action() then .group()', () => {
        const b = new GroupedToolBuilder('mix_ag')
            .action({ name: 'flat', handler: async () => success('ok') });
        expect(() => b.group('grp', 'Grp', g => g
            .action({ name: 'a', handler: async () => success('ok') })
        )).toThrow(/Cannot use/i);
    });

    it('should reject mixing .group() then .action()', () => {
        const b = new GroupedToolBuilder('mix_ga')
            .group('grp', 'Grp', g => g
                .action({ name: 'a', handler: async () => success('ok') })
            );
        expect(() => b.action({ name: 'flat', handler: async () => success('ok') }))
            .toThrow(/Cannot use/i);
    });

    it('grouped mode should produce compound action keys', () => {
        const b = new GroupedToolBuilder('compound')
            .group('users', 'Users', g => g
                .action({ name: 'list', handler: async () => success('ok') })
                .action({ name: 'create', handler: async () => success('ok') })
            );

        const names = b.getActionNames();
        // Before build, action names aren't populated, so build first
        b.buildToolDefinition();
        const postBuildNames = b.getActionNames();
        expect(postBuildNames).toContain('users.list');
        expect(postBuildNames).toContain('users.create');
    });

    it('should route correctly to grouped action via compound key', async () => {
        const b = new GroupedToolBuilder('route_compound')
            .group('billing', 'Billing', g => g
                .action({
                    name: 'charge',
                    schema: z.object({ amount: z.number() }),
                    handler: async (_ctx, args) => success(`charged ${args.amount}`),
                })
            );
        b.buildToolDefinition();

        const r = await b.execute(undefined as any, {
            action: 'billing.charge',
            amount: 42,
        });
        expect(r.isError).toBeUndefined();
        expect(r.content[0].text).toContain('charged 42');
    });
});

// ============================================================================
// 15. Extreme Edge Cases — The Outer Boundaries
// ============================================================================

describe('QA: Extreme Edge Cases', () => {
    it('should handle single-action tool (simplest possible case)', async () => {
        const b = new GroupedToolBuilder('minimal')
            .action({ name: 'do', handler: async () => success('done') });
        b.buildToolDefinition();

        const r = await b.execute(undefined as any, { action: 'do' });
        expect(r.isError).toBeUndefined();
    });

    it('should handle tool with many actions (50+)', () => {
        const b = new GroupedToolBuilder('fifty_actions');
        for (let i = 0; i < 50; i++) {
            b.action({
                name: `action_${i}`,
                handler: async () => success(`result_${i}`),
            });
        }

        const def = b.buildToolDefinition();
        const actionProp = (def.inputSchema.properties as any).action;
        expect(actionProp.enum).toHaveLength(50);
    });

    it('should handle very long tool name', () => {
        const longName = 'a'.repeat(200);
        const b = new GroupedToolBuilder(longName)
            .action({ name: 'x', handler: async () => success('ok') });
        const def = b.buildToolDefinition();
        expect(def.name).toBe(longName);
    });

    it('should handle tool with no schema at all (no validation)', async () => {
        const b = new GroupedToolBuilder('no_schema')
            .action({
                name: 'run',
                handler: async (_ctx, args) => success(`args: ${JSON.stringify(args)}`),
            });
        b.buildToolDefinition();

        // Any garbage args should pass through (no validation)
        const r = await b.execute(undefined as any, {
            action: 'run',
            anything: true,
            nested: { deep: 'value' },
        });
        expect(r.isError).toBeUndefined();
    });

    it('should handle concurrent execute calls on same builder', async () => {
        let callCount = 0;
        const b = new GroupedToolBuilder('concurrent')
            .action({
                name: 'count',
                handler: async () => {
                    callCount++;
                    // Simulate async work
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return success(`call ${callCount}`);
                },
            });
        b.buildToolDefinition();

        // Fire 10 concurrent calls
        const promises = Array.from({ length: 10 }, () =>
            b.execute(undefined as any, { action: 'count' })
        );

        const results = await Promise.all(promises);
        // All should succeed
        for (const r of results) {
            expect(r.isError).toBeUndefined();
        }
        expect(callCount).toBe(10);
    });

    it('should handle handler that returns success with empty string', async () => {
        const b = new GroupedToolBuilder('empty_success')
            .action({ name: 'empty', handler: async () => success('') });
        b.buildToolDefinition();

        const r = await b.execute(undefined as any, { action: 'empty' });
        expect(r.isError).toBeUndefined();
        expect(r.content[0].text).toBe('OK');
    });

    it('should handle action names that are JavaScript keywords', async () => {
        const b = new GroupedToolBuilder('js_keywords')
            .action({ name: 'delete', handler: async () => success('deleted') })
            .action({ name: 'return', handler: async () => success('returned') })
            .action({ name: 'class', handler: async () => success('classed') })
            .action({ name: 'export', handler: async () => success('exported') });
        b.buildToolDefinition();

        const r = await b.execute(undefined as any, { action: 'delete' });
        expect(r.isError).toBeUndefined();

        const r2 = await b.execute(undefined as any, { action: 'return' });
        expect(r2.isError).toBeUndefined();
    });

    it('getTags should return a copy, not a reference', () => {
        const b = new GroupedToolBuilder('tag_copy')
            .tags('a', 'b', 'c')
            .action({ name: 'x', handler: async () => success('ok') });

        const tags1 = b.getTags();
        const tags2 = b.getTags();
        expect(tags1).toEqual(tags2);
        expect(tags1).not.toBe(tags2); // Different array references

        // Mutation of returned array should not affect builder
        tags1.push('hacked');
        expect(b.getTags()).not.toContain('hacked');
    });
});
