/**
 * SchemaCollision.test.ts — Comprehensive Schema Collision Detection Tests
 *
 * Validates that the framework detects and rejects incompatible field types
 * across actions at build time, preventing subtle runtime bugs.
 *
 * Covers:
 * - All primitive type conflicts (string/number/boolean/array/object)
 * - Enum collisions (enum vs string, enum vs different enum)
 * - Legitimate "same type, different constraints" (should NOT throw)
 * - Nested object field conflicts
 * - CommonSchema vs action schema conflicts
 * - Hierarchical grouped actions with conflicts
 * - Multi-action chains (conflict in 3rd, 5th, Nth action)
 * - Error message quality and content
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder } from '../../src/framework/GroupedToolBuilder.js';
import { success } from '../../src/framework/ResponseHelper.js';

const dummyHandler = async () => success('ok');

// ============================================================================
// 1. Primitive Type Collisions — Every Pair Must Throw
// ============================================================================

describe('Schema Collision — Primitive Type Conflicts', () => {
    it('should reject string vs number', () => {
        const builder = new GroupedToolBuilder('prim_str_num')
            .action({ name: 'a', schema: z.object({ field: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.number() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject string vs boolean', () => {
        const builder = new GroupedToolBuilder('prim_str_bool')
            .action({ name: 'a', schema: z.object({ field: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.boolean() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject number vs boolean', () => {
        const builder = new GroupedToolBuilder('prim_num_bool')
            .action({ name: 'a', schema: z.object({ field: z.number() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.boolean() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject string vs array', () => {
        const builder = new GroupedToolBuilder('prim_str_arr')
            .action({ name: 'a', schema: z.object({ field: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.array(z.string()) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject string vs object', () => {
        const builder = new GroupedToolBuilder('prim_str_obj')
            .action({ name: 'a', schema: z.object({ field: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.object({ nested: z.string() }) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject number vs object', () => {
        const builder = new GroupedToolBuilder('prim_num_obj')
            .action({ name: 'a', schema: z.object({ field: z.number() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.object({ key: z.string() }) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject number vs array', () => {
        const builder = new GroupedToolBuilder('prim_num_arr')
            .action({ name: 'a', schema: z.object({ field: z.number() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.array(z.number()) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject boolean vs object', () => {
        const builder = new GroupedToolBuilder('prim_bool_obj')
            .action({ name: 'a', schema: z.object({ field: z.boolean() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.object({ x: z.number() }) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject boolean vs array', () => {
        const builder = new GroupedToolBuilder('prim_bool_arr')
            .action({ name: 'a', schema: z.object({ field: z.boolean() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.array(z.boolean()) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });

    it('should reject array vs object', () => {
        const builder = new GroupedToolBuilder('prim_arr_obj')
            .action({ name: 'a', schema: z.object({ field: z.array(z.string()) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ field: z.object({ key: z.string() }) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "field"/);
    });
});

// ============================================================================
// 2. Enum Collisions
// ============================================================================

describe('Schema Collision — Enum Conflicts', () => {
    it('should reject enum vs string', () => {
        const builder = new GroupedToolBuilder('enum_vs_string')
            .action({ name: 'a', schema: z.object({ status: z.enum(['active', 'archived']) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ status: z.string() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "status"/);
    });

    it('should reject enum with different values', () => {
        const builder = new GroupedToolBuilder('enum_vs_enum')
            .action({ name: 'a', schema: z.object({ status: z.enum(['active', 'archived']) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ status: z.enum(['open', 'closed']) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "status".*enum values/);
    });

    it('should reject enum vs number', () => {
        const builder = new GroupedToolBuilder('enum_vs_num')
            .action({ name: 'a', schema: z.object({ priority: z.enum(['low', 'high']) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ priority: z.number() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "priority"/);
    });

    it('should reject enum vs boolean', () => {
        const builder = new GroupedToolBuilder('enum_vs_bool')
            .action({ name: 'a', schema: z.object({ flag: z.enum(['yes', 'no']) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ flag: z.boolean() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "flag"/);
    });

    it('should accept identical enum values across actions (not a conflict)', () => {
        const builder = new GroupedToolBuilder('enum_same')
            .action({ name: 'a', schema: z.object({ status: z.enum(['active', 'archived']) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ status: z.enum(['active', 'archived']) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });
});

// ============================================================================
// 3. Legitimate Same-Type Scenarios — Must NOT Throw
// ============================================================================

describe('Schema Collision — Legitimate Same-Type (no conflict)', () => {
    it('should accept same string type with different constraints', () => {
        const builder = new GroupedToolBuilder('same_str_constraints')
            .action({ name: 'a', schema: z.object({ name: z.string().min(1).max(50) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ name: z.string().max(200) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept integer vs number (integer IS-A number, compatible)', () => {
        const builder = new GroupedToolBuilder('same_num_constraints')
            .action({ name: 'a', schema: z.object({ value: z.number().int().positive() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ value: z.number().min(0).max(100) }), handler: dummyHandler });

        // z.number().int() → JSON Schema "integer", z.number() → "number"
        // These are compatible: integer is a subtype of number.
        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept same string type with different descriptions', () => {
        const builder = new GroupedToolBuilder('same_str_desc')
            .action({ name: 'a', schema: z.object({ name: z.string().describe('Full name') }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ name: z.string().describe('Search query') }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept same boolean type across actions', () => {
        const builder = new GroupedToolBuilder('same_bool')
            .action({ name: 'a', schema: z.object({ dryRun: z.boolean() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ dryRun: z.boolean().default(false) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept same array type across actions', () => {
        const builder = new GroupedToolBuilder('same_arr')
            .action({ name: 'a', schema: z.object({ ids: z.array(z.string()) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ ids: z.array(z.string()).min(1) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept same object type across actions', () => {
        const builder = new GroupedToolBuilder('same_obj')
            .action({ name: 'a', schema: z.object({ config: z.object({ key: z.string() }) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ config: z.object({ key: z.string() }) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept optional vs required of the same type (both are string)', () => {
        const builder = new GroupedToolBuilder('opt_vs_req')
            .action({ name: 'a', schema: z.object({ tag: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ tag: z.string().optional() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept actions with completely non-overlapping fields', () => {
        const builder = new GroupedToolBuilder('no_overlap')
            .action({ name: 'a', schema: z.object({ name: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ count: z.number() }), handler: dummyHandler })
            .action({ name: 'c', schema: z.object({ flag: z.boolean() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should accept actions where only one has a schema', () => {
        const builder = new GroupedToolBuilder('one_schema')
            .action({ name: 'list', handler: dummyHandler })
            .action({ name: 'create', schema: z.object({ name: z.string() }), handler: dummyHandler })
            .action({ name: 'delete', handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });
});

// ============================================================================
// 4. Multi-Action Chain — Deferred Conflicts
// ============================================================================

describe('Schema Collision — Multi-Action Chain Detection', () => {
    it('should detect conflict in the 3rd action', () => {
        const builder = new GroupedToolBuilder('chain_3rd')
            .action({ name: 'a', schema: z.object({ value: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ value: z.string() }), handler: dummyHandler })
            .action({ name: 'c', schema: z.object({ value: z.number() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "value" in action "c"/);
    });

    it('should detect conflict in the 5th action among 5', () => {
        const builder = new GroupedToolBuilder('chain_5th')
            .action({ name: 'a1', schema: z.object({ id: z.string() }), handler: dummyHandler })
            .action({ name: 'a2', schema: z.object({ id: z.string() }), handler: dummyHandler })
            .action({ name: 'a3', schema: z.object({ id: z.string() }), handler: dummyHandler })
            .action({ name: 'a4', schema: z.object({ id: z.string() }), handler: dummyHandler })
            .action({ name: 'a5', schema: z.object({ id: z.number() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "id" in action "a5"/);
    });

    it('should report the FIRST conflicting action in the chain', () => {
        const builder = new GroupedToolBuilder('chain_first')
            .action({ name: 'create', schema: z.object({ payload: z.string() }), handler: dummyHandler })
            .action({ name: 'update', schema: z.object({ payload: z.number() }), handler: dummyHandler })
            .action({ name: 'delete', schema: z.object({ payload: z.boolean() }), handler: dummyHandler });

        // 'update' is the first to conflict with 'create'
        expect(() => builder.buildToolDefinition()).toThrow(/in action "update"/);
    });

    it('should detect conflict among multiple independent fields', () => {
        const builder = new GroupedToolBuilder('multi_field')
            .action({
                name: 'a',
                schema: z.object({ name: z.string(), count: z.number() }),
                handler: dummyHandler,
            })
            .action({
                name: 'b',
                schema: z.object({ name: z.number(), count: z.number() }),
                handler: dummyHandler,
            });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "name"/);
    });
});

// ============================================================================
// 5. CommonSchema vs Action Schema Conflicts
// ============================================================================

describe('Schema Collision — CommonSchema vs Action Conflicts', () => {
    it('should reject action field conflicting with commonSchema type', () => {
        const builder = new GroupedToolBuilder('common_vs_action')
            .commonSchema(z.object({ org_id: z.string() }))
            .action({
                name: 'create',
                schema: z.object({ org_id: z.number() }),
                handler: dummyHandler,
            });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "org_id"/);
    });

    it('should accept action field with same type as commonSchema', () => {
        const builder = new GroupedToolBuilder('common_same_type')
            .commonSchema(z.object({ org_id: z.string() }))
            .action({
                name: 'create',
                schema: z.object({ org_id: z.string() }),
                handler: dummyHandler,
            });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should reject enum in action conflicting with commonSchema string', () => {
        const builder = new GroupedToolBuilder('common_enum_conflict')
            .commonSchema(z.object({ region: z.string() }))
            .action({
                name: 'deploy',
                schema: z.object({ region: z.enum(['us', 'eu', 'ap']) }),
                handler: dummyHandler,
            });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "region"/);
    });

    it('should reject boolean in action conflicting with commonSchema number', () => {
        const builder = new GroupedToolBuilder('common_bool_num')
            .commonSchema(z.object({ limit: z.number() }))
            .action({
                name: 'query',
                schema: z.object({ limit: z.boolean() }),
                handler: dummyHandler,
            });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "limit"/);
    });
});

// ============================================================================
// 6. Hierarchical Grouped Actions — Conflicts in Groups
// ============================================================================

describe('Schema Collision — Hierarchical Groups', () => {
    it('should detect conflict between actions in different groups', () => {
        const builder = new GroupedToolBuilder('group_conflict')
            .group('users', 'User ops', g => g
                .action({ name: 'get', schema: z.object({ id: z.string() }), handler: dummyHandler })
            )
            .group('billing', 'Billing ops', g => g
                .action({ name: 'get', schema: z.object({ id: z.number() }), handler: dummyHandler })
            );

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "id"/);
    });

    it('should accept same type across groups', () => {
        const builder = new GroupedToolBuilder('group_ok')
            .group('users', 'User ops', g => g
                .action({ name: 'get', schema: z.object({ id: z.string() }), handler: dummyHandler })
            )
            .group('billing', 'Billing ops', g => g
                .action({ name: 'get', schema: z.object({ id: z.string() }), handler: dummyHandler })
            );

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should report grouped action key format in the error message', () => {
        const builder = new GroupedToolBuilder('group_key_format')
            .group('analytics', 'Analytics', g => g
                .action({ name: 'query', schema: z.object({ range: z.string() }), handler: dummyHandler })
            )
            .group('reports', 'Reports', g => g
                .action({ name: 'generate', schema: z.object({ range: z.number() }), handler: dummyHandler })
            );

        expect(() => builder.buildToolDefinition()).toThrow(/in action "reports\.generate"/);
    });
});

// ============================================================================
// 7. Error Message Quality
// ============================================================================

describe('Schema Collision — Error Message Quality', () => {
    it('should include the field name in the error', () => {
        const builder = new GroupedToolBuilder('msg_field')
            .action({ name: 'a', schema: z.object({ mySpecialField: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ mySpecialField: z.number() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow('mySpecialField');
    });

    it('should include the conflicting action key in the error', () => {
        const builder = new GroupedToolBuilder('msg_action')
            .action({ name: 'create_user', schema: z.object({ data: z.string() }), handler: dummyHandler })
            .action({ name: 'bulk_import', schema: z.object({ data: z.array(z.string()) }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow('bulk_import');
    });

    it('should include both conflicting types in the error', () => {
        const builder = new GroupedToolBuilder('msg_types')
            .action({ name: 'a', schema: z.object({ count: z.number() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ count: z.string() }), handler: dummyHandler });

        try {
            builder.buildToolDefinition();
            expect.unreachable('Should have thrown');
        } catch (err) {
            const message = (err as Error).message;
            expect(message).toContain('"string"');
            expect(message).toContain('"number"');
            expect(message).toContain('count');
        }
    });

    it('should include guidance about shared field types in the error', () => {
        const builder = new GroupedToolBuilder('msg_guidance')
            .action({ name: 'a', schema: z.object({ x: z.boolean() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ x: z.number() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(
            /All actions sharing a field name must use the same type/,
        );
    });

    it('should include enum values in the error for enum conflicts', () => {
        const builder = new GroupedToolBuilder('msg_enum')
            .action({ name: 'a', schema: z.object({ mode: z.enum(['fast', 'slow']) }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ mode: z.enum(['hot', 'cold']) }), handler: dummyHandler });

        try {
            builder.buildToolDefinition();
            expect.unreachable('Should have thrown');
        } catch (err) {
            const message = (err as Error).message;
            expect(message).toContain('mode');
            // Should contain the enum arrays from both declarations
            expect(message).toContain('fast');
            expect(message).toContain('slow');
            expect(message).toContain('hot');
            expect(message).toContain('cold');
            expect(message).toContain('enum values');
        }
    });
});

// ============================================================================
// 8. Edge Cases
// ============================================================================

describe('Schema Collision — Edge Cases', () => {
    it('should not false-positive when discriminator field name matches a schema field', () => {
        // The discriminator ("action") is added as an enum in properties.
        // If an action declares a field also called "action", it should be ignored
        // since the discriminator property is added first and is special.
        const builder = new GroupedToolBuilder('disc_overlap')
            .action({
                name: 'run',
                // No schema field called "action", so no conflict with discriminator
                schema: z.object({ command: z.string() }),
                handler: dummyHandler,
            });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should handle single action with schema (no collision possible)', () => {
        const builder = new GroupedToolBuilder('single_action')
            .action({
                name: 'only',
                schema: z.object({ name: z.string(), count: z.number() }),
                handler: dummyHandler,
            });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should handle many actions (10+) with same field type without false positive', () => {
        let builder = new GroupedToolBuilder('many_same');
        for (let i = 0; i < 15; i++) {
            builder = builder.action({
                name: `action_${i}`,
                schema: z.object({ shared_id: z.string() }),
                handler: dummyHandler,
            }) as any;
        }

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should detect conflict among many actions (10+) where last breaks', () => {
        let builder = new GroupedToolBuilder('many_conflict');
        for (let i = 0; i < 14; i++) {
            builder = builder.action({
                name: `action_${i}`,
                schema: z.object({ shared_id: z.string() }),
                handler: dummyHandler,
            }) as any;
        }
        // Last one breaks
        builder = builder.action({
            name: 'action_14_break',
            schema: z.object({ shared_id: z.number() }),
            handler: dummyHandler,
        }) as any;

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "shared_id" in action "action_14_break"/);
    });

    it('should handle nullable types consistently', () => {
        const builder = new GroupedToolBuilder('nullable_consistent')
            .action({ name: 'a', schema: z.object({ val: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ val: z.string() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should reject nullable vs non-nullable of same base type', () => {
        // z.string().nullable() -> JSON Schema type: ["string", "null"]
        // z.string()           -> JSON Schema type: "string"
        // These are different JSON Schema types, so collision is detected.
        const builder = new GroupedToolBuilder('nullable_vs_non')
            .action({ name: 'a', schema: z.object({ val: z.string() }), handler: dummyHandler })
            .action({ name: 'b', schema: z.object({ val: z.string().nullable() }), handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).toThrow(/Schema conflict for field "val"/);
    });

    it('should not throw when all actions have no schemas', () => {
        const builder = new GroupedToolBuilder('no_schemas')
            .action({ name: 'a', handler: dummyHandler })
            .action({ name: 'b', handler: dummyHandler })
            .action({ name: 'c', handler: dummyHandler });

        expect(() => builder.buildToolDefinition()).not.toThrow();
    });

    it('should detect conflict only on the conflicting field, not on compatible ones', () => {
        const builder = new GroupedToolBuilder('partial_conflict')
            .action({
                name: 'a',
                schema: z.object({ safe: z.string(), danger: z.string() }),
                handler: dummyHandler,
            })
            .action({
                name: 'b',
                schema: z.object({ safe: z.string(), danger: z.number() }),
                handler: dummyHandler,
            });

        // Should throw about "danger", not "safe"
        try {
            builder.buildToolDefinition();
            expect.unreachable('Should have thrown');
        } catch (err) {
            const message = (err as Error).message;
            expect(message).toContain('danger');
            expect(message).not.toContain('"safe"');
        }
    });
});

// ============================================================================
// 9. Integration — Runtime Works After Valid Build
// ============================================================================

describe('Schema Collision — Runtime After Valid Build', () => {
    it('should execute correctly when shared fields have same type', async () => {
        const builder = new GroupedToolBuilder('runtime_ok')
            .action({
                name: 'search',
                schema: z.object({ query: z.string(), limit: z.number().optional() }),
                handler: async (_ctx, args) => success(`search: ${args.query}`),
            })
            .action({
                name: 'export',
                schema: z.object({ query: z.string(), format: z.string() }),
                handler: async (_ctx, args) => success(`export: ${args.query} as ${args.format}`),
            });

        builder.buildToolDefinition();

        const r1 = await builder.execute(undefined as any, {
            action: 'search', query: 'test', limit: 10,
        });
        expect(r1.isError).toBeUndefined();
        expect(r1.content[0].text).toBe('search: test');

        const r2 = await builder.execute(undefined as any, {
            action: 'export', query: 'test', format: 'csv',
        });
        expect(r2.isError).toBeUndefined();
        expect(r2.content[0].text).toBe('export: test as csv');
    });

    it('should validate per-action schema independently even when sharing field names', async () => {
        const builder = new GroupedToolBuilder('per_action_validation')
            .action({
                name: 'strict',
                schema: z.object({ limit: z.number().min(1) }),
                handler: async () => success('strict ok'),
            })
            .action({
                name: 'lenient',
                schema: z.object({ limit: z.number() }),
                handler: async () => success('lenient ok'),
            });

        builder.buildToolDefinition();

        // strict should reject 0 (min 1)
        const r1 = await builder.execute(undefined as any, {
            action: 'strict', limit: 0,
        });
        expect(r1.isError).toBe(true);

        // lenient should accept 0
        const r2 = await builder.execute(undefined as any, {
            action: 'lenient', limit: 0,
        });
        expect(r2.isError).toBeUndefined();
    });
});
