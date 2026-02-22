/**
 * StateSyncLayer — Integration Tests
 *
 * Tests the full orchestration: PolicyEngine → decoration chain.
 */
import { describe, it, expect } from 'vitest';
import { StateSyncLayer } from '../../../src/framework/state-sync/StateSyncLayer.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResponse } from '../../../src/framework/response.js';

const makeTool = (name: string, description: string): McpTool => ({
    name,
    description,
    inputSchema: { type: 'object' },
});

const makeResult = (text: string, isError?: boolean): ToolResponse => ({
    content: [{ type: 'text', text }],
    ...(isError !== undefined ? { isError } : {}),
});

describe('StateSyncLayer', () => {
    const layer = new StateSyncLayer({
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'sprints.update', invalidates: ['sprints.*'] },
            { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
            { match: 'countries.*', cacheControl: 'immutable' },
        ],
    });

    describe('decorateTools', () => {
        it('appends Cache-Control directives to all tool descriptions', () => {
            const tools = [
                makeTool('sprints.get', 'Get sprint details.'),
                makeTool('countries.list', 'List countries.'),
                makeTool('tasks.list', 'List tasks.'),
            ];

            const decorated = layer.decorateTools(tools);

            expect(decorated[0]!.description).toBe('Get sprint details. [Cache-Control: no-store]');
            expect(decorated[1]!.description).toBe('List countries. [Cache-Control: immutable]');
            expect(decorated[2]!.description).toBe('List tasks. [Cache-Control: no-store]');
        });
    });

    describe('decorateResult', () => {
        it('prepends invalidation signal on successful mutation', () => {
            const result = makeResult('{"ok": true}');
            const decorated = layer.decorateResult('sprints.update', result);

            expect(decorated.content).toHaveLength(2);
            expect(decorated.content[0]!.text).toContain('Cache invalidated for sprints.*');
            expect(decorated.content[0]!.text).toContain('caused by sprints.update');
        });

        it('does NOT prepend signal on failed mutation', () => {
            const result = makeResult('Error occurred', true);
            const decorated = layer.decorateResult('sprints.update', result);

            expect(decorated.content).toHaveLength(1);
            expect(decorated).toBe(result); // Same reference — no decoration
        });

        it('does NOT prepend signal on read-only tools', () => {
            const result = makeResult('{"sprints": []}');
            const decorated = layer.decorateResult('sprints.get', result);

            expect(decorated.content).toHaveLength(1);
            expect(decorated).toBe(result);
        });

        it('handles cross-domain invalidation', () => {
            const result = makeResult('{}');
            const decorated = layer.decorateResult('tasks.update', result);

            expect(decorated.content[0]!.text).toContain('tasks.*, sprints.*');
            expect(decorated.content[0]!.text).toContain('caused by tasks.update');
        });
    });

    describe('construction validation', () => {
        it('throws on invalid policy at construction', () => {
            expect(() => new StateSyncLayer({
                policies: [{ match: '' }],
            })).toThrow();
        });

        it('throws on invalid default at construction', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => new StateSyncLayer({
                policies: [],
                defaults: { cacheControl: 'public' as any },
            })).toThrow();
        });
    });
});
