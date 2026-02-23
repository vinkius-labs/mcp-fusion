import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, GroupedToolBuilder, success } from '../../src/core/index.js';
import type { ToolResponse } from '../../src/core/index.js';

const dummyHandler = async (_ctx: unknown, _args: Record<string, unknown>): Promise<ToolResponse> =>
    success('ok');

const echoHandler = async (_ctx: unknown, args: Record<string, unknown>): Promise<ToolResponse> =>
    success(JSON.stringify(args));

describe('ToolRegistry', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
        registry = new ToolRegistry();
    });

    it('should register and list tools', () => {
        const builder = new GroupedToolBuilder('task')
            .description('Task management')
            .action({ name: 'list', handler: dummyHandler });

        registry.register(builder);

        expect(registry.has('task')).toBe(true);
        expect(registry.size).toBe(1);
        expect(registry.getAllTools()).toHaveLength(1);
        expect(registry.getAllTools()[0].name).toBe('task');
    });

    it('should throw on duplicate registration', () => {
        const b1 = new GroupedToolBuilder('task')
            .action({ name: 'list', handler: dummyHandler });
        const b2 = new GroupedToolBuilder('task')
            .action({ name: 'list', handler: dummyHandler });

        registry.register(b1);
        expect(() => registry.register(b2)).toThrow('already registered');
    });

    it('should route call to correct builder', async () => {
        const taskBuilder = new GroupedToolBuilder('task')
            .action({ name: 'list', handler: async () => success('tasks') });
        const labelBuilder = new GroupedToolBuilder('label')
            .action({ name: 'list', handler: async () => success('labels') });

        registry.registerAll(taskBuilder, labelBuilder);

        const result = await registry.routeCall(undefined as any, 'task', { action: 'list' });
        expect(result.content[0].text).toBe('tasks');
    });

    it('should error on unknown tool with available list', async () => {
        const builder = new GroupedToolBuilder('task')
            .action({ name: 'list', handler: dummyHandler });
        registry.register(builder);

        const result = await registry.routeCall(undefined as any, 'nonexistent', { action: 'list' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('UNKNOWN_TOOL');
        expect(result.content[0].text).toContain('task');
    });

    it('should clear all registrations', () => {
        registry.register(
            new GroupedToolBuilder('task')
                .action({ name: 'list', handler: dummyHandler })
        );
        expect(registry.size).toBe(1);

        registry.clear();
        expect(registry.size).toBe(0);
    });

    // ── Tag Filtering ───────────────────────────────────

    describe('Selective Exposure via Tags', () => {
        beforeEach(() => {
            registry.register(
                new GroupedToolBuilder('auth')
                    .tags('public')
                    .action({ name: 'login', handler: dummyHandler })
            );
            registry.register(
                new GroupedToolBuilder('task')
                    .tags('authenticated', 'project-context')
                    .action({ name: 'list', handler: dummyHandler })
            );
            registry.register(
                new GroupedToolBuilder('admin')
                    .tags('authenticated', 'admin')
                    .action({ name: 'users', handler: dummyHandler })
            );
        });

        it('should filter tools by tags (AND logic)', () => {
            const tools = registry.getTools({ tags: ['authenticated'] });
            const names = tools.map(t => t.name);
            expect(names).toContain('task');
            expect(names).toContain('admin');
            expect(names).not.toContain('auth');
        });

        it('should filter tools by multiple tags (AND)', () => {
            const tools = registry.getTools({ tags: ['authenticated', 'admin'] });
            const names = tools.map(t => t.name);
            expect(names).toEqual(['admin']);
        });

        it('should exclude tools by tags (OR logic)', () => {
            const tools = registry.getTools({ exclude: ['admin'] });
            const names = tools.map(t => t.name);
            expect(names).toContain('auth');
            expect(names).toContain('task');
            expect(names).not.toContain('admin');
        });

        it('should combine tags + exclude filters', () => {
            const tools = registry.getTools({
                tags: ['authenticated'],
                exclude: ['admin'],
            });
            const names = tools.map(t => t.name);
            expect(names).toEqual(['task']);
        });

        it('should return all tools when no filter', () => {
            const tools = registry.getTools({});
            expect(tools).toHaveLength(3);
        });

        it('should filter tools by anyTag (OR logic)', () => {
            const tools = registry.getTools({ anyTag: ['public', 'admin'] });
            const names = tools.map(t => t.name);
            expect(names).toContain('auth');   // has 'public'
            expect(names).toContain('admin');   // has 'admin'
            expect(names).not.toContain('task'); // has neither
        });

        it('should return all matches for single anyTag', () => {
            const tools = registry.getTools({ anyTag: ['authenticated'] });
            const names = tools.map(t => t.name);
            expect(names).toContain('task');
            expect(names).toContain('admin');
            expect(names).not.toContain('auth');
        });

        it('should combine anyTag + exclude', () => {
            const tools = registry.getTools({
                anyTag: ['public', 'authenticated'],
                exclude: ['admin'],
            });
            const names = tools.map(t => t.name);
            expect(names).toContain('auth');
            expect(names).toContain('task');
            expect(names).not.toContain('admin');
        });

        it('should return empty when anyTag matches nothing', () => {
            const tools = registry.getTools({ anyTag: ['nonexistent'] });
            expect(tools).toHaveLength(0);
        });
    });

    // ── Integration ─────────────────────────────────────

    describe('Integration — Multi-Tool Routing', () => {
        it('should handle end-to-end flow with Zod validation', async () => {
            const taskBuilder = new GroupedToolBuilder<void>('task')
                .commonSchema(z.object({ company_slug: z.string() }))
                .action({
                    name: 'create',
                    description: 'Create a task',
                    schema: z.object({ title: z.string() }),
                    handler: echoHandler,
                });

            const labelBuilder = new GroupedToolBuilder<void>('label')
                .group('core', 'Core', g => g
                    .action({
                        name: 'create',
                        schema: z.object({ title: z.string(), color: z.string() }),
                        handler: echoHandler,
                    })
                    .action({
                        name: 'list',
                        readOnly: true,
                        handler: async () => success('[]'),
                    })
                );

            registry.registerAll(taskBuilder, labelBuilder);

            // Valid task call
            const r1 = await registry.routeCall(undefined as any, 'task', {
                action: 'create',
                company_slug: 'acme',
                title: 'Fix bug',
            });
            expect(r1.isError).toBeUndefined();
            const data1 = JSON.parse(r1.content[0].text);
            expect(data1.company_slug).toBe('acme');
            expect(data1.title).toBe('Fix bug');

            // Invalid task call (missing company_slug)
            const r2 = await registry.routeCall(undefined as any, 'task', {
                action: 'create',
                title: 'Fix bug',
            });
            expect(r2.isError).toBe(true);
            expect(r2.content[0].text).toContain('company_slug');

            // Valid label call with compound action
            const r3 = await registry.routeCall(undefined as any, 'label', {
                action: 'core.create',
                title: 'Bug',
                color: '#ff0000',
            });
            expect(r3.isError).toBeUndefined();

            // Tool definitions check
            expect(registry.getAllTools()).toHaveLength(2);
        });
    });
});
