/**
 * ResponseDecorator — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { decorateResponse } from '../../src/state-sync/ResponseDecorator.js';
import type { ToolResponse } from '../../src/core/response.js';

const makeResult = (text: string, isError?: boolean): ToolResponse => ({
    content: [{ type: 'text', text }],
    ...(isError !== undefined ? { isError } : {}),
});

describe('ResponseDecorator', () => {
    it('prepends a System block at index 0', () => {
        const result = makeResult('{"ok": true}');
        const decorated = decorateResponse(result, ['sprints.*'], 'sprints.update');

        expect(decorated.content).toHaveLength(2);
        expect(decorated.content[0]!.text).toBe(
            '<cache_invalidation cause="sprints.update" domains="sprints.*" />',
        );
        expect(decorated.content[1]!.text).toBe('{"ok": true}');
    });

    it('joins multiple patterns with comma', () => {
        const result = makeResult('{}');
        const decorated = decorateResponse(result, ['sprints.*', 'tasks.*'], 'tasks.update');

        expect(decorated.content[0]!.text).toBe(
            '<cache_invalidation cause="tasks.update" domains="sprints.*, tasks.*" />',
        );
    });

    it('preserves original content untouched', () => {
        const original = makeResult('original data');
        const decorated = decorateResponse(original, ['x.*'], 'x.write');

        // Original is not mutated
        expect(original.content).toHaveLength(1);
        // Decorated has 2 items
        expect(decorated.content).toHaveLength(2);
    });

    it('preserves the isError flag', () => {
        const result = makeResult('data', false);
        const decorated = decorateResponse(result, ['a.*'], 'a.b');
        expect(decorated.isError).toBe(false);
    });
});
