/**
 * MCP 2.0 (2026-07-28) Feature Tests
 *
 * Tests the Fluent API MCP 2.0 additions:
 * - withHeaderParam() → x-mcp-header annotation in compiled tool
 * - withOutputSchema() → outputSchema in compiled tool
 * - withTitle() → title in compiled tool
 * - withIcon() → icons in compiled tool
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { initMCPFusion } from '../../src/core/initMCPFusion.js';
import { successStructured } from '../../src/core/response.js';

interface TestContext {
    userId: string;
}

// Helper: build a tool and get its compiled MCP tool definition
function buildTool(builder: ReturnType<ReturnType<typeof initMCPFusion<TestContext>>['query']>) {
    const f = initMCPFusion<TestContext>();
    const registry = f.registry();
    registry.register(builder);
    const tools = registry.getTools();
    return tools[0]!;
}

describe('MCP 2.0: withHeaderParam', () => {
    it('injects x-mcp-header annotation into the compiled inputSchema', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('test.header_param')
                .describe('Test x-mcp-header')
                .withHeaderParam('region', 'X-Region', 'Cloud region')
                .withString('query', 'Search query')
                .handle(async (input) => ({ result: input.query })),
        );

        const props = tool.inputSchema?.properties as Record<string, Record<string, unknown>>;
        expect(props).toBeDefined();
        expect(props!['region']).toBeDefined();
        expect(props!['region']!['x-mcp-header']).toBe('X-Region');
        // Other params should NOT have x-mcp-header
        expect(props!['query']!['x-mcp-header']).toBeUndefined();
    });

    it('supports multiple header params', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('test.multi_header')
                .withHeaderParam('region', 'X-Region', 'Cloud region')
                .withHeaderParam('tenant', 'X-Tenant', 'Tenant ID')
                .withString('query', 'Search query')
                .handle(async (input) => ({ result: input.query })),
        );

        const props = tool.inputSchema?.properties as Record<string, Record<string, unknown>>;
        expect(props!['region']!['x-mcp-header']).toBe('X-Region');
        expect(props!['tenant']!['x-mcp-header']).toBe('X-Tenant');
    });

    it('throws on empty header name', () => {
        expect(() =>
            initMCPFusion<TestContext>().query('test.empty_header')
                .withHeaderParam('region', '', 'Cloud region')
                .handle(async () => ({})),
        ).toThrow();
    });

    it('header param appears in inputSchema properties', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('test.header_required')
                .withHeaderParam('region', 'X-Region', 'Cloud region')
                .handle(async () => ({})),
        );

        const props = tool.inputSchema?.properties as Record<string, Record<string, unknown>>;
        expect(props!['region']).toBeDefined();
        expect(props!['region']!['x-mcp-header']).toBe('X-Region');
    });
});

describe('MCP 2.0: withOutputSchema', () => {
    it('sets outputSchema on the compiled tool definition', () => {
        const outputSchema = {
            type: 'object' as const,
            properties: {
                temperature: { type: 'number' },
                conditions: { type: 'string' },
            },
            required: ['temperature', 'conditions'],
        };

        const tool = buildTool(
            initMCPFusion<TestContext>().query('weather.get')
                .withString('location', 'City name')
                .withOutputSchema(outputSchema)
                .handle(async (input) =>
                    successStructured({ temperature: 22.5, conditions: 'Partly cloudy' }),
                ),
        );

        expect(tool.outputSchema).toBeDefined();
        expect(tool.outputSchema?.type).toBe('object');
        expect(tool.outputSchema?.properties).toHaveProperty('temperature');
        expect(tool.outputSchema?.properties).toHaveProperty('conditions');
    });

    it('tool without withOutputSchema has undefined outputSchema', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('no.output_schema')
                .withString('msg', 'Message')
                .handle(async (input) => ({ echo: input.msg })),
        );

        expect(tool.outputSchema).toBeUndefined();
    });
});

describe('MCP 2.0: withTitle', () => {
    it('sets title on the compiled tool definition', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('test.title')
                .withTitle('My Custom Tool')
                .handle(async () => ({})),
        );

        expect(tool.title).toBe('My Custom Tool');
    });

    it('tool without withTitle has undefined title', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('no.title')
                .handle(async () => ({})),
        );

        expect(tool.title).toBeUndefined();
    });
});

describe('MCP 2.0: withIcon', () => {
    it('sets icons on the compiled tool definition', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('test.icon')
                .withIcon('https://example.com/icon.png', { mimeType: 'image/png' })
                .handle(async () => ({})),
        );

        expect(tool.icons).toBeDefined();
        expect(tool.icons).toHaveLength(1);
        expect(tool.icons![0]!.src).toBe('https://example.com/icon.png');
        expect(tool.icons![0]!.mimeType).toBe('image/png');
    });

    it('supports multiple icons', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('test.multi_icon')
                .withIcon('https://example.com/light.png', { theme: 'light' })
                .withIcon('https://example.com/dark.png', { theme: 'dark' })
                .handle(async () => ({})),
        );

        expect(tool.icons).toHaveLength(2);
        expect(tool.icons![0]!.theme).toBe('light');
        expect(tool.icons![1]!.theme).toBe('dark');
    });

    it('tool without withIcon has undefined icons', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('no.icon')
                .handle(async () => ({})),
        );

        expect(tool.icons).toBeUndefined();
    });
});

describe('MCP 2.0: Combined features', () => {
    it('all MCP 2.0 features can be used together', () => {
        const tool = buildTool(
            initMCPFusion<TestContext>().query('api.query')
                .withTitle('API Query Tool')
                .withIcon('https://example.com/icon.svg', { mimeType: 'image/svg+xml' })
                .withHeaderParam('authorization', 'Authorization', 'Bearer token')
                .withString('endpoint', 'API endpoint to call')
                .withOutputSchema({
                    type: 'object',
                    properties: {
                        status: { type: 'number' },
                        data: { type: 'string' },
                    },
                    required: ['status'],
                })
                .handle(async (input) =>
                    successStructured({ status: 200, data: `Called ${input.endpoint}` }),
                ),
        );

        expect(tool.title).toBe('API Query Tool');
        expect(tool.icons).toHaveLength(1);
        expect(tool.outputSchema).toBeDefined();

        const props = tool.inputSchema?.properties as Record<string, Record<string, unknown>>;
        expect(props!['authorization']!['x-mcp-header']).toBe('Authorization');
    });
});