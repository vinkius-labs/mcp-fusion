/**
 * DescriptionDecorator — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { decorateDescription } from '../../src/state-sync/DescriptionDecorator.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';

const makeTool = (name: string, description?: string): McpTool => ({
    name,
    description,
    inputSchema: { type: 'object' },
});

describe('DescriptionDecorator', () => {
    it('appends [Cache-Control: no-store] to the description', () => {
        const tool = makeTool('sprints.get', 'Get sprint details.');
        const result = decorateDescription(tool, { cacheControl: 'no-store' });

        expect(result.description).toBe('Get sprint details. [Cache-Control: no-store]');
    });

    it('appends [Cache-Control: immutable] to the description', () => {
        const tool = makeTool('countries.list', 'List all countries.');
        const result = decorateDescription(tool, { cacheControl: 'immutable' });

        expect(result.description).toBe('List all countries. [Cache-Control: immutable]');
    });

    it('returns tool unchanged when policy is null', () => {
        const tool = makeTool('something', 'Do something.');
        const result = decorateDescription(tool, null);

        expect(result).toBe(tool); // Same reference — no copy
    });

    it('returns tool unchanged when policy has no cacheControl', () => {
        const tool = makeTool('sprints.update', 'Update sprint.');
        const result = decorateDescription(tool, { invalidates: ['sprints.*'] });

        expect(result).toBe(tool);
    });

    it('is idempotent — calling twice does not duplicate the directive', () => {
        const tool = makeTool('sprints.get', 'Get sprint details.');
        const policy = { cacheControl: 'no-store' as const };

        const first = decorateDescription(tool, policy);
        const second = decorateDescription(first, policy);

        expect(second.description).toBe('Get sprint details. [Cache-Control: no-store]');
    });

    it('replaces an existing directive on re-decoration', () => {
        const tool = makeTool('data.get', 'Fetch data. [Cache-Control: immutable]');
        const result = decorateDescription(tool, { cacheControl: 'no-store' });

        expect(result.description).toBe('Fetch data. [Cache-Control: no-store]');
    });

    it('handles empty description gracefully', () => {
        const tool = makeTool('tool', '');
        const result = decorateDescription(tool, { cacheControl: 'no-store' });

        expect(result.description).toBe(' [Cache-Control: no-store]');
    });

    it('handles undefined description gracefully', () => {
        const tool = makeTool('tool');
        const result = decorateDescription(tool, { cacheControl: 'no-store' });

        expect(result.description).toBe(' [Cache-Control: no-store]');
    });
});
