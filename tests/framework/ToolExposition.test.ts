import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    GroupedToolBuilder,
    ToolRegistry,
    success,
} from '../../src/framework/index.js';
import type { ToolResponse } from '../../src/framework/index.js';
import { compileExposition } from '../../src/framework/server/ExpositionCompiler.js';

// ── Shared Fixtures ──────────────────────────────────────

const dummyHandler = async (): Promise<ToolResponse> => success('ok');

function createProjectsBuilder() {
    return new GroupedToolBuilder<void>('projects')
        .description('Manage workspace projects')
        .commonSchema(z.object({ workspace_id: z.string() }))
        .action({
            name: 'list',
            description: 'List all projects',
            readOnly: true,
            handler: async () => success('[]'),
        })
        .action({
            name: 'create',
            description: 'Create a new project',
            schema: z.object({ name: z.string() }),
            handler: async (_ctx, args) => success(JSON.stringify(args)),
        })
        .action({
            name: 'delete',
            description: 'Delete a project',
            destructive: true,
            schema: z.object({ id: z.string() }),
            handler: dummyHandler,
        });
}

// ============================================================================
// ExpositionCompiler — Topology Compiler Engine Tests
// ============================================================================

describe('ExpositionCompiler', () => {

    // ── Flat Strategy ────────────────────────────────────

    describe('flat strategy', () => {
        it('should expand N actions into N independent McpTool artifacts', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder], 'flat', '_');

            expect(result.tools).toHaveLength(3);
            expect(result.isFlat).toBe(true);
        });

        it('should produce deterministic names: {group}{separator}{action}', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder], 'flat', '_');

            const names = result.tools.map(t => t.name);
            expect(names).toEqual(['projects_list', 'projects_create', 'projects_delete']);
        });

        it('should support custom actionSeparator', () => {
            const builder = createProjectsBuilder();

            const dot = compileExposition([builder], 'flat', '.');
            expect(dot.tools.map(t => t.name)).toEqual([
                'projects.list', 'projects.create', 'projects.delete',
            ]);

            const dash = compileExposition([builder], 'flat', '-');
            expect(dash.tools.map(t => t.name)).toEqual([
                'projects-list', 'projects-create', 'projects-delete',
            ]);
        });

        it('should isolate annotations (readOnlyHint, destructiveHint) per action', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder], 'flat', '_');

            const listTool = result.tools.find(t => t.name === 'projects_list')!;
            const createTool = result.tools.find(t => t.name === 'projects_create')!;
            const deleteTool = result.tools.find(t => t.name === 'projects_delete')!;

            // list is read-only and NOT destructive
            expect((listTool as Record<string, unknown>).annotations).toEqual(
                expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
            );

            // create is NOT read-only and NOT destructive
            expect((createTool as Record<string, unknown>).annotations).toEqual(
                expect.objectContaining({ destructiveHint: false }),
            );

            // delete IS destructive and NOT read-only
            expect((deleteTool as Record<string, unknown>).annotations).toEqual(
                expect.objectContaining({ destructiveHint: true }),
            );
        });

        it('should produce isolated schemas without discriminator field', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder], 'flat', '_');

            const listTool = result.tools.find(t => t.name === 'projects_list')!;
            const createTool = result.tools.find(t => t.name === 'projects_create')!;
            const deleteTool = result.tools.find(t => t.name === 'projects_delete')!;

            // No 'action' discriminator field in any flat tool schema
            expect(listTool.inputSchema.properties).not.toHaveProperty('action');
            expect(createTool.inputSchema.properties).not.toHaveProperty('action');
            expect(deleteTool.inputSchema.properties).not.toHaveProperty('action');

            // list: has workspace_id from common schema
            expect(listTool.inputSchema.properties).toHaveProperty('workspace_id');

            // create: has workspace_id + name
            expect(createTool.inputSchema.properties).toHaveProperty('workspace_id');
            expect(createTool.inputSchema.properties).toHaveProperty('name');

            // delete: has workspace_id + id
            expect(deleteTool.inputSchema.properties).toHaveProperty('workspace_id');
            expect(deleteTool.inputSchema.properties).toHaveProperty('id');
        });

        it('should propagate common schema required fields', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder], 'flat', '_');

            const listTool = result.tools.find(t => t.name === 'projects_list')!;
            expect(listTool.inputSchema.required).toContain('workspace_id');

            const createTool = result.tools.find(t => t.name === 'projects_create')!;
            expect(createTool.inputSchema.required).toContain('workspace_id');
            expect(createTool.inputSchema.required).toContain('name');
        });

        it('should produce per-action descriptions', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder], 'flat', '_');

            const listTool = result.tools.find(t => t.name === 'projects_list')!;
            expect(listTool.description).toContain('List all projects');
            expect(listTool.description).toContain('[READ-ONLY]');

            const deleteTool = result.tools.find(t => t.name === 'projects_delete')!;
            expect(deleteTool.description).toContain('Delete a project');
            expect(deleteTool.description).toContain('[DESTRUCTIVE]');
        });

        it('should emit O(1) dispatch routing map', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder], 'flat', '_');

            expect(result.routingMap.size).toBe(3);

            const listRoute = result.routingMap.get('projects_list')!;
            expect(listRoute.builder).toBe(builder);
            expect(listRoute.actionKey).toBe('list');
            expect(listRoute.discriminator).toBe('action');

            const deleteRoute = result.routingMap.get('projects_delete')!;
            expect(deleteRoute.actionKey).toBe('delete');
        });

        it('should handle omitCommon correctly in flat mode', () => {
            const builder = new GroupedToolBuilder<void>('tasks')
                .commonSchema(z.object({
                    workspace_id: z.string(),
                    project_id: z.string(),
                }))
                .action({
                    name: 'list',
                    readOnly: true,
                    handler: dummyHandler,
                })
                .action({
                    name: 'create',
                    schema: z.object({ title: z.string() }),
                    omitCommon: ['project_id'],
                    handler: dummyHandler,
                });

            const result = compileExposition([builder], 'flat', '_');

            const listTool = result.tools.find(t => t.name === 'tasks_list')!;
            expect(listTool.inputSchema.properties).toHaveProperty('workspace_id');
            expect(listTool.inputSchema.properties).toHaveProperty('project_id');

            const createTool = result.tools.find(t => t.name === 'tasks_create')!;
            expect(createTool.inputSchema.properties).toHaveProperty('workspace_id');
            expect(createTool.inputSchema.properties).not.toHaveProperty('project_id');
            expect(createTool.inputSchema.properties).toHaveProperty('title');
        });

        it('should handle grouped tools (with .group()) in flat mode', () => {
            const builder = new GroupedToolBuilder<void>('platform')
                .group('users', 'User management', g => g
                    .action({ name: 'list', readOnly: true, handler: dummyHandler })
                    .action({ name: 'ban', destructive: true, handler: dummyHandler })
                )
                .group('billing', 'Billing management', g => g
                    .action({ name: 'invoices', readOnly: true, handler: dummyHandler })
                );

            const result = compileExposition([builder], 'flat', '_');

            const names = result.tools.map(t => t.name);
            // Grouped actions use compound keys: 'users.list', 'users.ban', 'billing.invoices'
            expect(names).toContain('platform_users.list');
            expect(names).toContain('platform_users.ban');
            expect(names).toContain('platform_billing.invoices');
            expect(result.tools).toHaveLength(3);

            // Verify annotation isolation
            const banTool = result.tools.find(t => t.name === 'platform_users.ban')!;
            expect((banTool as Record<string, unknown>).annotations).toEqual(
                expect.objectContaining({ destructiveHint: true }),
            );

            const listTool = result.tools.find(t => t.name === 'platform_users.list')!;
            expect((listTool as Record<string, unknown>).annotations).toEqual(
                expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
            );
        });

        it('should handle multiple builders', () => {
            const projects = createProjectsBuilder();
            const labels = new GroupedToolBuilder<void>('labels')
                .action({ name: 'list', readOnly: true, handler: dummyHandler })
                .action({ name: 'create', handler: dummyHandler });

            const result = compileExposition([projects, labels], 'flat', '_');

            expect(result.tools).toHaveLength(5); // 3 + 2
            const names = result.tools.map(t => t.name);
            expect(names).toContain('projects_list');
            expect(names).toContain('labels_list');
            expect(names).toContain('labels_create');
        });

        it('should handle idempotent hint', () => {
            const builder = new GroupedToolBuilder<void>('ops')
                .action({
                    name: 'set_config',
                    idempotent: true,
                    handler: dummyHandler,
                });

            const result = compileExposition([builder], 'flat', '_');
            const tool = result.tools[0];
            expect((tool as Record<string, unknown>).annotations).toEqual(
                expect.objectContaining({ idempotentHint: true }),
            );
        });
    });

    // ── Grouped Strategy ─────────────────────────────────

    describe('grouped strategy', () => {
        it('should passthrough grouped definition unchanged', () => {
            const builder = createProjectsBuilder();
            const grouped = compileExposition([builder], 'grouped');
            const direct = builder.buildToolDefinition();

            expect(grouped.tools).toHaveLength(1);
            expect(grouped.isFlat).toBe(false);
            expect(grouped.routingMap.size).toBe(0);

            const tool = grouped.tools[0];
            expect(tool.name).toBe('projects');
            expect(tool.inputSchema).toEqual(direct.inputSchema);
        });

        it('should match byte-for-byte the direct buildToolDefinition output', () => {
            const builder = createProjectsBuilder();
            const grouped = compileExposition([builder], 'grouped');
            const direct = builder.buildToolDefinition();

            expect(JSON.stringify(grouped.tools[0])).toBe(JSON.stringify(direct));
        });
    });

    // ── Default Strategy ─────────────────────────────────

    describe('default strategy', () => {
        it('should default to flat when no strategy specified', () => {
            const builder = createProjectsBuilder();
            const result = compileExposition([builder]);

            expect(result.isFlat).toBe(true);
            expect(result.tools).toHaveLength(3);
        });
    });
});

// ============================================================================
// AST Reflection — GroupedToolBuilder Getters
// ============================================================================

describe('GroupedToolBuilder AST Reflection', () => {
    it('should expose discriminator via getDiscriminator()', () => {
        const builder = new GroupedToolBuilder<void>('test')
            .action({ name: 'a', handler: dummyHandler });
        expect(builder.getDiscriminator()).toBe('action');

        const custom = new GroupedToolBuilder<void>('test2')
            .discriminator('operation')
            .action({ name: 'a', handler: dummyHandler });
        expect(custom.getDiscriminator()).toBe('operation');
    });

    it('should expose actions via getActions()', () => {
        const builder = new GroupedToolBuilder<void>('test')
            .action({ name: 'list', readOnly: true, handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler });

        const actions = builder.getActions();
        expect(actions).toHaveLength(2);
        expect(actions[0].key).toBe('list');
        expect(actions[1].key).toBe('create');
        expect(actions[0].readOnly).toBe(true);
    });

    it('should expose common schema via getCommonSchema()', () => {
        const schema = z.object({ id: z.string() });
        const builder = new GroupedToolBuilder<void>('test')
            .commonSchema(schema)
            .action({ name: 'list', handler: dummyHandler });

        const common = builder.getCommonSchema();
        expect(common).toBe(schema);
    });

    it('should return undefined for getCommonSchema() when not set', () => {
        const builder = new GroupedToolBuilder<void>('test')
            .action({ name: 'list', handler: dummyHandler });

        expect(builder.getCommonSchema()).toBeUndefined();
    });
});

// ============================================================================
// Integration — Flat Routing via Registry
// ============================================================================

describe('Flat Routing Integration', () => {
    it('should route flat tool calls through the dispatch map', async () => {
        const builder = createProjectsBuilder();
        builder.buildToolDefinition();

        const result = compileExposition([builder], 'flat', '_');
        const route = result.routingMap.get('projects_create')!;

        // Simulate the payload hydration that ServerAttachment does
        const enrichedArgs = {
            workspace_id: 'ws-1',
            name: 'My Project',
            [route.discriminator]: route.actionKey,
        };

        const response = await route.builder.execute(
            undefined as unknown as void,
            enrichedArgs,
        );

        expect(response.isError).toBeUndefined();
        const data = JSON.parse(response.content[0].text);
        expect(data.workspace_id).toBe('ws-1');
        expect(data.name).toBe('My Project');
    });

    it('should route grouped tool calls through dispatch map for groups', async () => {
        const builder = new GroupedToolBuilder<void>('platform')
            .group('users', g => g
                .action({
                    name: 'list',
                    readOnly: true,
                    handler: async () => success('user-list'),
                })
            );
        builder.buildToolDefinition();

        const result = compileExposition([builder], 'flat', '_');
        const route = result.routingMap.get('platform_users.list')!;

        const enrichedArgs = { [route.discriminator]: route.actionKey };
        const response = await route.builder.execute(
            undefined as unknown as void,
            enrichedArgs,
        );

        expect(response.content[0].text).toBe('user-list');
    });
});
