/**
 * Bug Fix Regressions: BuildPipeline — ToolResponse detection correctness
 *
 * BUG (Shape Heuristic False-Positive): The `wrappedHandler` in BuildPipeline
 * used a shape-based heuristic as a fallback for detecting manually constructed
 * ToolResponse objects. Domain objects that coincidentally matched the shape
 * `{ content: [{type:'text', text:'...'}], isError?: boolean }` would be
 * returned raw instead of being serialized via `success()`.
 *
 * FIX: Removed the shape heuristic entirely. Only the brand symbol
 * `TOOL_RESPONSE_BRAND` (stamped by all framework helpers) is trusted.
 * Domain objects with ToolResponse-like shapes are now correctly wrapped.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { initVurb } from '../../src/core/initVurb.js';
import { success, error, toolError, required, toonSuccess, TOOL_RESPONSE_BRAND } from '../../src/core/response.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';

// Helper to call a tool through the full pipeline
async function callTool(
    registry: ToolRegistry<void>,
    name: string,
    args: Record<string, unknown> = {},
) {
    return registry.routeCall(undefined as never, name, args);
}

describe('Bug Fix Regression: BuildPipeline — ToolResponse brand symbol is the sole detection mechanism', () => {

    it('objects with ToolResponse shape are wrapped by success() (not passed through)', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        // This object matches the OLD shape heuristic exactly:
        // { content: [{type:'text',text:'...'}] } with no extra keys
        const domainObject = {
            content: [{ type: 'text', text: 'I am a content block' }],
        };

        registry.register(
            f.query('domain.getContent')
                .describe('Returns a domain object that looks like ToolResponse')
                .handle(async () => domainObject),
        );

        const result = await callTool(registry, 'domain', { action: 'getContent' });

        // The domain object MUST be JSON-serialized inside a success() wrapper,
        // not returned as-is. The old heuristic would have returned it raw.
        expect(result.isError).toBeFalsy();
        expect(result.content).toHaveLength(1);
        const text = result.content[0]!.text;

        // The text must be the JSON-serialized form of the domain object,
        // NOT the raw "I am a content block" string from the nested text field.
        expect(text).toContain('"content"');
        expect(text).toContain('"type"');
        expect(text).toContain('I am a content block');
        // It's JSON — it should be parseable
        const parsed = JSON.parse(text);
        expect(parsed).toEqual(domainObject);
    });

    it('objects with ToolResponse shape AND isError field are wrapped, not passed through', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        // This matches the old heuristic with isError — could cause data loss
        const domainObject = {
            content: [{ type: 'text', text: 'error log' }],
            isError: false,
        };

        registry.register(
            f.query('domain.getLog')
                .handle(async () => domainObject),
        );

        const result = await callTool(registry, 'domain', { action: 'getLog' });

        // Must be wrapped in success(), not used as ToolResponse
        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed).toEqual(domainObject);
    });

    it('brand-stamped success() response passes through correctly', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('branded.ok')
                .handle(async () => success('everything is fine')),
        );

        const result = await callTool(registry, 'branded', { action: 'ok' });

        expect(result.isError).toBeFalsy();
        expect(result.content[0]!.text).toBe('everything is fine');
    });

    it('brand-stamped error() response passes through with isError=true', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('branded.fail')
                .handle(async () => error('something went wrong')),
        );

        const result = await callTool(registry, 'branded', { action: 'fail' });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('something went wrong');
    });

    it('brand-stamped toolError() response passes through correctly', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('branded.toolError')
                .handle(async () => toolError('NOT_FOUND', { message: 'Record not found' })),
        );

        const result = await callTool(registry, 'branded', { action: 'toolError' });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('NOT_FOUND');
    });

    it('brand-stamped required() response passes through correctly', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('branded.required')
                .handle(async () => required('workspace_id')),
        );

        const result = await callTool(registry, 'branded', { action: 'required' });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('workspace_id');
    });

    it('brand-stamped toonSuccess() response passes through correctly', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('branded.toon')
                .handle(async () => toonSuccess([{ id: 1, name: 'Alice' }])),
        );

        const result = await callTool(registry, 'branded', { action: 'toon' });

        expect(result.isError).toBeFalsy();
        expect(result.content[0]!.text).toContain('Alice');
    });

    it('raw string return is wrapped with success()', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('raw.string')
                .handle(async () => 'just a string'),
        );

        const result = await callTool(registry, 'raw', { action: 'string' });

        expect(result.isError).toBeFalsy();
        expect(result.content[0]!.text).toBe('just a string');
    });

    it('raw object return is JSON-serialized via success()', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('raw.object')
                .handle(async () => ({ id: 1, name: 'Alice' })),
        );

        const result = await callTool(registry, 'raw', { action: 'object' });

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed).toEqual({ id: 1, name: 'Alice' });
    });

    it('null return is mapped to success("OK")', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('raw.null')
                .handle(async () => null),
        );

        const result = await callTool(registry, 'raw', { action: 'null' });

        expect(result.isError).toBeFalsy();
        expect(result.content[0]!.text).toBe('OK');
    });

    it('undefined return is mapped to success("OK")', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.query('raw.undefined')
                .handle(async () => undefined),
        );

        const result = await callTool(registry, 'raw', { action: 'undefined' });

        expect(result.isError).toBeFalsy();
        expect(result.content[0]!.text).toBe('OK');
    });

    it('TOOL_RESPONSE_BRAND is a unique symbol and not enumerable on responses', () => {
        const resp = success('test');

        // Brand must be present
        expect(TOOL_RESPONSE_BRAND in resp).toBe(true);

        // But it must NOT appear in JSON (non-enumerable)
        const json = JSON.stringify(resp);
        expect(json).not.toContain('vurb.ToolResponse');

        // And Object.keys() must only show content (and isError when present)
        const keys = Object.keys(resp);
        expect(keys).toEqual(['content']);
    });

    it('manually constructed ToolResponse lookalike is treated as domain data', async () => {
        // Simulate a developer returning a manually constructed object
        // without using the framework helpers (no brand stamp)
        const f = initVurb<void>();
        const registry = f.registry();

        const manualLookAlike = {
            content: [{ type: 'text' as const, text: 'manual response' }],
        };

        registry.register(
            f.query('manual.response')
                .handle(async () => manualLookAlike),
        );

        const result = await callTool(registry, 'manual', { action: 'response' });

        // Without the brand, it's treated as domain data and JSON-wrapped
        // This is the correct behavior — use success() to avoid wrapping
        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed).toEqual(manualLookAlike);
    });
});
