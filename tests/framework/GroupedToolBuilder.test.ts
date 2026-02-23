import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder, success, error } from '../../src/framework/index.js';
import type { ToolResponse } from '../../src/framework/index.js';

// ============================================================================
// Helper: dummy handler
// ============================================================================
const dummyHandler = async (_ctx: unknown, _args: Record<string, unknown>): Promise<ToolResponse> =>
    success('ok');

const echoHandler = async (_ctx: unknown, args: Record<string, unknown>): Promise<ToolResponse> =>
    success(JSON.stringify(args));

// ============================================================================
// Flat Mode
// ============================================================================

describe('GroupedToolBuilder — Flat Mode', () => {
    it('should generate correct enum for flat actions', () => {
        const builder = new GroupedToolBuilder('label')
            .description('Label management')
            .action({ name: 'list', handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler })
            .action({ name: 'delete', handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        expect(tool.name).toBe('label');
        const actionProp = (tool.inputSchema.properties as Record<string, any>).action;
        expect(actionProp.enum).toEqual(['list', 'create', 'delete']);
    });

    it('should auto-generate description with action list', () => {
        const builder = new GroupedToolBuilder('label')
            .description('Label management')
            .action({ name: 'list', handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        expect(tool.description).toContain('Label management');
        expect(tool.description).toContain('Actions: list, create');
    });

    it('should include workflow lines for actions with required params', () => {
        const builder = new GroupedToolBuilder('label')
            .description('Labels')
            .action({
                name: 'list',
                handler: dummyHandler,
            })
            .action({
                name: 'create',
                description: 'Create a new label',
                schema: z.object({
                    title: z.string(),
                    color: z.string(),
                }),
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();

        expect(tool.description).toContain("- 'create': Create a new label. Requires: title, color");
        // 'list' has no required params → no workflow line
        expect(tool.description).not.toContain("- 'list'");
    });

    it('should reject action names containing dots', () => {
        const builder = new GroupedToolBuilder('test');
        expect(() => {
            builder.action({ name: 'v2.list', handler: dummyHandler });
        }).toThrow('must not contain dots');
    });

    it('should reject empty builder (no actions)', () => {
        const builder = new GroupedToolBuilder('empty');
        expect(() => builder.buildToolDefinition()).toThrow('no actions registered');
    });

    it('should store tags correctly', () => {
        const builder = new GroupedToolBuilder('test')
            .tags('authenticated', 'project-context')
            .action({ name: 'list', handler: dummyHandler });

        expect(builder.getTags()).toEqual(['authenticated', 'project-context']);
    });

    it('should support custom discriminator', () => {
        const builder = new GroupedToolBuilder('report')
            .discriminator('method')
            .action({ name: 'generate', handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        expect((tool.inputSchema.properties as Record<string, any>).method).toBeDefined();
        expect((tool.inputSchema.properties as Record<string, any>).action).toBeUndefined();
        expect(tool.inputSchema.required).toContain('method');
    });
});

// ============================================================================
// Group Mode
// ============================================================================

describe('GroupedToolBuilder — Group Mode', () => {
    it('should generate compound enum for grouped actions', () => {
        const builder = new GroupedToolBuilder('project')
            .description('Project management')
            .group('core', 'Core operations', g => g
                .action({ name: 'list', handler: dummyHandler })
                .action({ name: 'create', handler: dummyHandler })
            )
            .group('team', 'Team management', g => g
                .action({ name: 'add', handler: dummyHandler })
            );

        const tool = builder.buildToolDefinition();

        const actionProp = (tool.inputSchema.properties as Record<string, any>).action;
        expect(actionProp.enum).toEqual(['core.list', 'core.create', 'team.add']);
    });

    it('should generate modules-style description', () => {
        const builder = new GroupedToolBuilder('project')
            .description('Project management')
            .group('core', 'Core', g => g
                .action({ name: 'list', handler: dummyHandler })
                .action({ name: 'get', handler: dummyHandler })
            )
            .group('team', 'Team', g => g
                .action({ name: 'members', handler: dummyHandler })
                .action({ name: 'add', handler: dummyHandler })
            );

        const tool = builder.buildToolDefinition();

        expect(tool.description).toContain('Modules: core (list,get) | team (members,add)');
    });

    it('should reject mixed flat + group usage', () => {
        const builder = new GroupedToolBuilder('mixed')
            .action({ name: 'list', handler: dummyHandler });

        expect(() => {
            builder.group('core', 'Core', g => g
                .action({ name: 'get', handler: dummyHandler })
            );
        }).toThrow('Cannot use .group() and .action()');
    });

    it('should reject group names with dots', () => {
        const builder = new GroupedToolBuilder('test');
        expect(() => {
            builder.group('v2.core', 'Core', g => g
                .action({ name: 'list', handler: dummyHandler })
            );
        }).toThrow('must not contain dots');
    });

    it('should reject action names with dots inside a group builder', () => {
        const builder = new GroupedToolBuilder('test');
        expect(() => {
            builder.group('core', 'Core', g => g
                .action({ name: 'v2.list', handler: dummyHandler })
            );
        }).toThrow('must not contain dots');
    });

    it('should reject flat .action() after .group() was used', () => {
        const builder = new GroupedToolBuilder('mixed')
            .group('core', 'Core', g => g
                .action({ name: 'list', handler: dummyHandler })
            );

        expect(() => {
            builder.action({ name: 'create', handler: dummyHandler });
        }).toThrow('Cannot use .action() and .group()');
    });
});

// ============================================================================
// Defense Chain (Zod Validation)
// ============================================================================

describe('GroupedToolBuilder — Defense Chain', () => {
    it('should validate types via Zod and return error on wrong type', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'create',
                schema: z.object({ title: z.string() }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'create',
            title: 123, // wrong type
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('validation_error');
        expect(result.content[0].text).toContain('title');
    });

    it('should reject unknown fields (.strict() security)', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'create',
                schema: z.object({ title: z.string() }),
                handler: echoHandler,
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'create',
            title: 'hello',
            injected_field: 'malicious',
        });

        // .strict() now rejects unknown fields instead of silently stripping them
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('injected_field');
    });

    it('should accumulate ALL validation errors at once', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'create',
                schema: z.object({
                    title: z.string(),
                    color: z.string(),
                    count: z.number(),
                }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'create',
            // Missing: title, color, count
        });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;
        // All 3 errors should be present in a single response
        expect(errorText).toContain('title');
        expect(errorText).toContain('color');
        expect(errorText).toContain('count');
    });

    it('should error on unknown action with available list', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({ name: 'list', handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'delete', // doesn't exist
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('UNKNOWN_ACTION');
        expect(result.content[0].text).toContain('delete');
        expect(result.content[0].text).toContain('list, create');
    });

    it('should error when discriminator is missing', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({ name: 'list', handler: dummyHandler });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('is missing');
    });

    it('should merge commonSchema and action schema', async () => {
        const builder = new GroupedToolBuilder('test')
            .commonSchema(z.object({
                company_slug: z.string(),
            }))
            .action({
                name: 'create',
                schema: z.object({ title: z.string() }),
                handler: echoHandler,
            });

        builder.buildToolDefinition();

        // Missing company_slug → validation error
        const result1 = await builder.execute(undefined as any, {
            action: 'create',
            title: 'hello',
        });
        expect(result1.isError).toBe(true);
        expect(result1.content[0].text).toContain('company_slug');

        // Valid
        const result2 = await builder.execute(undefined as any, {
            action: 'create',
            company_slug: 'acme',
            title: 'hello',
        });
        expect(result2.isError).toBeUndefined();
    });

    it('should freeze builder after buildToolDefinition()', () => {
        const builder = new GroupedToolBuilder('test')
            .action({ name: 'list', handler: dummyHandler });

        builder.buildToolDefinition();

        expect(() => {
            builder.action({ name: 'create', handler: dummyHandler });
        }).toThrow('frozen');
    });

    it('should cache buildToolDefinition result', () => {
        const builder = new GroupedToolBuilder('test')
            .action({ name: 'list', handler: dummyHandler });

        const tool1 = builder.buildToolDefinition();
        const tool2 = builder.buildToolDefinition();

        expect(tool1).toBe(tool2); // Same reference
    });
});

// ============================================================================
// Annotations
// ============================================================================

describe('GroupedToolBuilder — Annotations', () => {
    it('should aggregate readOnlyHint = true when ALL actions are readOnly', () => {
        const builder = new GroupedToolBuilder('query')
            .action({ name: 'list', readOnly: true, handler: dummyHandler })
            .action({ name: 'get', readOnly: true, handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        expect((tool as any).annotations.readOnlyHint).toBe(true);
        expect((tool as any).annotations.destructiveHint).toBe(false);
    });

    it('should aggregate destructiveHint = true when ANY action is destructive', () => {
        const builder = new GroupedToolBuilder('crud')
            .action({ name: 'list', readOnly: true, handler: dummyHandler })
            .action({ name: 'delete', destructive: true, handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        expect((tool as any).annotations.destructiveHint).toBe(true);
        expect((tool as any).annotations.readOnlyHint).toBe(false);
    });

    it('should add [DESTRUCTIVE] in workflow description for destructive actions', () => {
        const builder = new GroupedToolBuilder('crud')
            .description('CRUD')
            .action({ name: 'delete', description: 'Delete permanently', destructive: true, handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        expect(tool.description).toContain('[DESTRUCTIVE]');
    });

    it('should aggregate idempotentHint = true when ALL actions are idempotent', () => {
        const builder = new GroupedToolBuilder('api')
            .action({ name: 'get', idempotent: true, handler: dummyHandler })
            .action({ name: 'put', idempotent: true, handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        expect((tool as any).annotations.idempotentHint).toBe(true);
    });
});

// ============================================================================
// Middleware
// ============================================================================

describe('GroupedToolBuilder — Middleware', () => {
    it('should run middleware before handler', async () => {
        const log: string[] = [];

        const builder = new GroupedToolBuilder('test')
            .use(async (_ctx, _args, next) => {
                log.push('middleware');
                return next();
            })
            .action({
                name: 'list',
                handler: async () => {
                    log.push('handler');
                    return success('ok');
                },
            });

        builder.buildToolDefinition();
        await builder.execute(undefined as any, { action: 'list' });

        expect(log).toEqual(['middleware', 'handler']);
    });

    it('should support multiple middlewares in order', async () => {
        const log: string[] = [];

        const builder = new GroupedToolBuilder('test')
            .use(async (_ctx, _args, next) => {
                log.push('mw1');
                return next();
            })
            .use(async (_ctx, _args, next) => {
                log.push('mw2');
                return next();
            })
            .action({
                name: 'list',
                handler: async () => {
                    log.push('handler');
                    return success('ok');
                },
            });

        builder.buildToolDefinition();
        await builder.execute(undefined as any, { action: 'list' });

        expect(log).toEqual(['mw1', 'mw2', 'handler']);
    });

    it('should allow middleware to short-circuit (skip handler)', async () => {
        const builder = new GroupedToolBuilder('test')
            .use(async (_ctx, _args, _next) => {
                return error('unauthorized');
            })
            .action({
                name: 'list',
                handler: async () => success('should not reach'),
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, { action: 'list' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('unauthorized');
    });

    it('should pass validated args to middleware (not raw args)', async () => {
        const builder = new GroupedToolBuilder('test')
            .use(async (_ctx, args, next) => {
                // injected_field should be stripped by Zod
                expect(args['injected_field']).toBeUndefined();
                expect(args['title']).toBe('hello');
                return next();
            })
            .action({
                name: 'create',
                schema: z.object({ title: z.string() }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();
        await builder.execute(undefined as any, {
            action: 'create',
            title: 'hello',
            injected_field: 'bad',
        });
    });

    it('should catch handler errors and return error response', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'crash',
                handler: async () => { throw new Error('boom'); },
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, { action: 'crash' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('[test/crash] boom');
    });
});

// ============================================================================
// Per-Field Annotations
// ============================================================================

describe('GroupedToolBuilder — Per-Field Annotations', () => {
    it('should annotate common required fields as "(always required)"', () => {
        const builder = new GroupedToolBuilder('test')
            .commonSchema(z.object({
                company_slug: z.string().describe('Workspace ID'),
            }))
            .action({ name: 'list', handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler });

        const tool = builder.buildToolDefinition();
        const companyField = (tool.inputSchema.properties as any).company_slug;

        expect(companyField.description).toContain('Workspace ID');
        expect(companyField.description).toContain('(always required)');
    });

    it('should annotate action-specific fields with "Required for:"', () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'list',
                handler: dummyHandler,
            })
            .action({
                name: 'create',
                schema: z.object({ title: z.string() }),
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const titleField = (tool.inputSchema.properties as any).title;

        expect(titleField.description).toContain('Required for: create');
    });

    it('should annotate fields appearing in multiple actions with "For:"', () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'list',
                schema: z.object({ filter: z.string().optional() }),
                handler: dummyHandler,
            })
            .action({
                name: 'search',
                schema: z.object({ filter: z.string().optional() }),
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const filterField = (tool.inputSchema.properties as any).filter;

        expect(filterField.description).toContain('For: list, search');
    });

    it('should annotate field required in SOME actions and optional in others', () => {
        // "query" is required for "search" but optional for "export"
        // This should produce "Required for: search. For: export"
        const builder = new GroupedToolBuilder('analytics')
            .action({
                name: 'search',
                schema: z.object({ query: z.string() }), // required
                handler: dummyHandler,
            })
            .action({
                name: 'export',
                schema: z.object({ query: z.string().optional() }), // optional
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const queryField = (tool.inputSchema.properties as any).query;

        expect(queryField.description).toContain('Required for: search');
        expect(queryField.description).toContain('For: export');
    });
});

// ============================================================================
// Scenario: DevOps CI/CD Pipeline Tool
// Tests: auto-build on execute(), commonSchema-only validation (no action schema)
// ============================================================================

describe('Scenario — DevOps CI/CD Pipeline Tool', () => {
    it('should auto-build when execute() is called without buildToolDefinition()', async () => {
        // A CI/CD tool where the user calls execute() directly — the builder
        // should lazily build before routing
        const builder = new GroupedToolBuilder<{ user: string }>('ci_pipeline')
            .description('CI/CD pipeline operations')
            .commonSchema(z.object({
                repository: z.string(),
            }))
            .action({
                name: 'trigger',
                handler: async (ctx, args) =>
                    success(`triggered ${args.repository} by ${ctx.user}`),
            })
            .action({
                name: 'status',
                readOnly: true,
                handler: async (_ctx, args) =>
                    success(`status of ${args.repository}: passing`),
            });

        // execute() without calling buildToolDefinition() first
        const result = await builder.execute(
            { user: 'ci-bot' },
            { action: 'trigger', repository: 'org/infra' }
        );

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('triggered org/infra by ci-bot');
    });

    it('should validate common schema even when action has no schema', async () => {
        // The tool requires a "repository" field via commonSchema,
        // but the "status" action defines no per-action schema
        const builder = new GroupedToolBuilder('ci_pipeline')
            .commonSchema(z.object({
                repository: z.string(),
            }))
            .action({
                name: 'status',
                readOnly: true,
                handler: async (_ctx, args) =>
                    success(`status of ${args.repository}`),
            });

        builder.buildToolDefinition();

        // Missing repository → validation error from commonSchema only
        const result = await builder.execute(undefined as any, { action: 'status' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('repository');
    });
});

// ============================================================================
// Scenario: Database Admin Tool
// Tests: explicit annotation override of aggregated hints
// ============================================================================

describe('Scenario — Database Admin Tool', () => {
    it('should let explicit annotations override per-action aggregated hints', () => {
        // Even though all actions are readOnly, the tool author explicitly
        // sets readOnlyHint=false (e.g., because the tool opens connections)
        // Similarly, overrides destructiveHint and idempotentHint
        const builder = new GroupedToolBuilder('db_admin')
            .description('Database inspection')
            .annotations({
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
            })
            .action({
                name: 'list_tables',
                readOnly: true,
                idempotent: true,
                handler: dummyHandler,
            })
            .action({
                name: 'describe_table',
                readOnly: true,
                idempotent: true,
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const annotations = (tool as any).annotations;

        // Explicit overrides take precedence over aggregation
        expect(annotations.readOnlyHint).toBe(false);
        expect(annotations.destructiveHint).toBe(true);
        expect(annotations.idempotentHint).toBe(true);
    });
});

// ============================================================================
// Scenario: IoT Sensor Controller
// Tests: action-schema-only validation (no commonSchema), non-Error throw
// ============================================================================

describe('Scenario — IoT Sensor Controller', () => {
    it('should validate per-action schema when no commonSchema exists', async () => {
        // Each action has its own schema, no shared fields
        const builder = new GroupedToolBuilder('sensor_ctl')
            .description('IoT sensor management')
            .action({
                name: 'read',
                readOnly: true,
                schema: z.object({
                    sensor_id: z.string(),
                    unit: z.enum(['celsius', 'fahrenheit']),
                }),
                handler: async (_ctx, args) =>
                    success(`${args.sensor_id}: 22.5 ${args.unit}`),
            })
            .action({
                name: 'calibrate',
                schema: z.object({
                    sensor_id: z.string(),
                    offset: z.number(),
                }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();

        // Valid request — action-only schema validates correctly
        const result = await builder.execute(undefined as any, {
            action: 'read',
            sensor_id: 'temp-001',
            unit: 'celsius',
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('temp-001');

        // Invalid enum value
        const result2 = await builder.execute(undefined as any, {
            action: 'read',
            sensor_id: 'temp-001',
            unit: 'kelvin', // not in enum
        });
        expect(result2.isError).toBe(true);
        expect(result2.content[0].text).toContain('unit');
    });

    it('should catch non-Error throw values gracefully', async () => {
        // Handler throws a raw string instead of new Error()
        const builder = new GroupedToolBuilder('sensor_ctl')
            .action({
                name: 'reboot',
                handler: async () => { throw 'DEVICE_OFFLINE'; },
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, { action: 'reboot' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('[sensor_ctl/reboot] DEVICE_OFFLINE');
    });
});

// ============================================================================
// Scenario: File System Tool (Grouped Mode)
// Tests: grouped mode with destructive actions, workflow description variants
// ============================================================================

describe('Scenario — File System Tool (Grouped)', () => {
    it('should generate correct workflow for grouped actions with mixed annotations', () => {
        const builder = new GroupedToolBuilder('fs')
            .description('File system operations')
            .group('files', 'File operations', g => g
                .action({
                    name: 'read',
                    description: 'Read file contents',
                    readOnly: true,
                    schema: z.object({ path: z.string() }),
                    handler: dummyHandler,
                })
                .action({
                    name: 'write',
                    description: 'Write to a file',
                    schema: z.object({
                        path: z.string(),
                        content: z.string(),
                    }),
                    handler: dummyHandler,
                })
                .action({
                    name: 'delete',
                    description: 'Permanently delete a file',
                    destructive: true,
                    schema: z.object({ path: z.string() }),
                    handler: dummyHandler,
                })
            )
            .group('dirs', 'Directory operations', g => g
                .action({
                    name: 'list',
                    readOnly: true,
                    schema: z.object({ path: z.string() }),
                    handler: dummyHandler,
                })
            );

        const tool = builder.buildToolDefinition();

        // Grouped enum format
        const actionProp = (tool.inputSchema.properties as any).action;
        expect(actionProp.enum).toEqual([
            'files.read', 'files.write', 'files.delete', 'dirs.list',
        ]);

        // Description includes modules
        expect(tool.description).toContain('Modules:');
        expect(tool.description).toContain('files (read,write,delete)');
        expect(tool.description).toContain('dirs (list)');

        // Workflow includes destructive marker
        expect(tool.description).toContain('[DESTRUCTIVE]');

        // Annotations: not all readOnly (write + delete exist), but delete is destructive
        expect((tool as any).annotations.readOnlyHint).toBe(false);
        expect((tool as any).annotations.destructiveHint).toBe(true);
    });

    it('should execute grouped actions correctly with validation', async () => {
        const builder = new GroupedToolBuilder('fs')
            .group('files', 'Files', g => g
                .action({
                    name: 'read',
                    schema: z.object({ path: z.string() }),
                    handler: async (_ctx, args) =>
                        success(`content of ${args.path}`),
                })
            );

        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'files.read',
            path: '/etc/config.yaml',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('content of /etc/config.yaml');
    });
});

// ============================================================================
// Scenario: E-Commerce Tool
// Tests: workflow "Requires:" without description, introspection methods
// ============================================================================

describe('Scenario — E-Commerce Tool', () => {
    it('should show "Requires:" without description prefix in workflow', () => {
        // Action has required fields but no description — workflow should show
        // "Requires: X" directly without a leading description
        const builder = new GroupedToolBuilder('orders')
            .description('Order management')
            .action({
                name: 'list',
                readOnly: true,
                handler: dummyHandler,
            })
            .action({
                name: 'create',
                // No description — just required fields
                schema: z.object({
                    product_id: z.string(),
                    quantity: z.number(),
                }),
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();

        // Should contain "Requires: product_id, quantity" without a description prefix
        expect(tool.description).toContain("- 'create': Requires: product_id, quantity");
    });

    it('should expose action names via getActionNames()', () => {
        const builder = new GroupedToolBuilder('orders')
            .action({ name: 'list', handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler })
            .action({ name: 'cancel', handler: dummyHandler });

        builder.buildToolDefinition();

        expect(builder.getName()).toBe('orders');
        expect(builder.getActionNames()).toEqual(['list', 'create', 'cancel']);
    });

    it('should use tool name as description fallback when no description set', () => {
        const builder = new GroupedToolBuilder('orders')
            .action({ name: 'list', handler: dummyHandler });

        const tool = builder.buildToolDefinition();

        // Should use name "orders" as fallback since no .description() was set
        expect(tool.description).toContain('orders');
        expect(tool.description).toContain('Actions: list');
    });
});

// ============================================================================
// previewPrompt()
// ============================================================================

describe('GroupedToolBuilder — previewPrompt', () => {
    it('should return a formatted preview with box-drawing characters', () => {
        const builder = new GroupedToolBuilder('projects')
            .description('Manage projects')
            .action({ name: 'list', readOnly: true, handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler });

        const preview = builder.previewPrompt();

        // Box-drawing characters
        expect(preview).toContain('┌');
        expect(preview).toContain('└');
        expect(preview).toContain('├');

        // Sections
        expect(preview).toContain('MCP Tool Preview: projects');
        expect(preview).toContain('Name: projects');
        expect(preview).toContain('Actions: 2 (list, create)');
        expect(preview).toContain('Description');
        expect(preview).toContain('Manage projects');
        expect(preview).toContain('Input Schema');
        expect(preview).toContain('Token Estimate');
    });

    it('should include approximate token count', () => {
        const builder = new GroupedToolBuilder('math')
            .action({ name: 'add', handler: dummyHandler });

        const preview = builder.previewPrompt();

        // Should contain "~N tokens (M chars)"
        expect(preview).toMatch(/~\d+ tokens \(\d[\d,]* chars\)/);
    });

    it('should include annotations when present', () => {
        const builder = new GroupedToolBuilder('admin')
            .annotations({ openWorldHint: true })
            .action({ name: 'reset', destructive: true, handler: dummyHandler });

        const preview = builder.previewPrompt();

        expect(preview).toContain('Annotations');
        expect(preview).toContain('openWorldHint');
        expect(preview).toContain('destructiveHint');
    });

    it('should show tags when present', () => {
        const builder = new GroupedToolBuilder('core')
            .tags('api', 'admin')
            .action({ name: 'status', handler: dummyHandler });

        const preview = builder.previewPrompt();

        expect(preview).toContain('Tags: api, admin');
    });

    it('should auto-call buildToolDefinition if not built', () => {
        const builder = new GroupedToolBuilder('lazy')
            .action({ name: 'ping', handler: dummyHandler });

        // previewPrompt before buildToolDefinition
        const preview = builder.previewPrompt();
        expect(preview).toContain('MCP Tool Preview: lazy');
        expect(preview).toContain('Actions: 1 (ping)');
    });

    it('should be idempotent', () => {
        const builder = new GroupedToolBuilder('stable')
            .action({ name: 'check', handler: dummyHandler });

        const first = builder.previewPrompt();
        const second = builder.previewPrompt();
        expect(first).toBe(second);
    });
});
