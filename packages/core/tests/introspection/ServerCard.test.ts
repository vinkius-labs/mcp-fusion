/**
 * ServerCard — Unit + Adversarial Tests
 *
 * Validates the MCP Server Card compiler (SEP-1649).
 *
 * Coverage includes:
 * - Happy-path compilation (minimal, full, mixed)
 * - Adversarial inputs (XSS, prototype pollution, unicode, oversized)
 * - Edge cases (empty iterables, generators, duplicate names)
 * - Schema compliance (required fields, JSON round-trip)
 * - Performance (large registries, 10,000+ tools)
 */
import { describe, it, expect } from 'vitest';
import { compileServerCard, SERVER_CARD_PATH } from '../../src/introspection/ServerCard.js';
import type { ServerCardConfig, ServerCardPayload } from '../../src/introspection/types.js';

// ── Test Helpers ─────────────────────────────────────────

function createMockBuilder(name: string, description: string, tags: string[] = []) {
    return {
        getName: () => name,
        buildToolDefinition: () => ({ description, inputSchema: { type: 'object' } }),
        getTags: () => tags,
        getActionNames: () => ['default'],
    };
}

function createMinimalBuilder(name: string) {
    return {
        getName: () => name,
        buildToolDefinition: () => ({ description: `${name} tool` }),
    };
}

/** Generator that yields builders lazily — tests Iterable<T> support */
function* builderGenerator(count: number) {
    for (let i = 0; i < count; i++) {
        yield createMockBuilder(`tool_${i}`, `Description for tool ${i}`, [`tag_${i % 5}`]);
    }
}

/** Validates that a payload conforms to the SEP-1649 required fields */
function assertValidPayload(card: ServerCardPayload) {
    expect(card.$schema).toBeDefined();
    expect(typeof card.$schema).toBe('string');
    expect(card.version).toBeDefined();
    expect(card.protocolVersion).toBeDefined();
    expect(card.serverInfo).toBeDefined();
    expect(card.serverInfo.name).toBeDefined();
    expect(card.serverInfo.version).toBeDefined();
    expect(card.transport).toBeDefined();
    expect(card.transport.type).toBeDefined();
    expect(card.capabilities).toBeDefined();
}

// ── Tests ────────────────────────────────────────────────

describe('ServerCard', () => {
    // ─── Constants ───────────────────────────────────────

    describe('SERVER_CARD_PATH', () => {
        it('exports the well-known path', () => {
            expect(SERVER_CARD_PATH).toBe('/.well-known/mcp/server-card.json');
        });

        it('starts with a forward slash', () => {
            expect(SERVER_CARD_PATH.startsWith('/')).toBe(true);
        });

        it('ends with .json', () => {
            expect(SERVER_CARD_PATH.endsWith('.json')).toBe(true);
        });
    });

    // ─── Happy Path ─────────────────────────────────────

    describe('compileServerCard — happy path', () => {
        it('compiles a minimal card with no tools', () => {
            const card = compileServerCard({ name: 'test-server' }, []);

            assertValidPayload(card);
            expect(card.$schema).toContain('server-card');
            expect(card.version).toBe('1.0');
            expect(card.protocolVersion).toBe('2026-07-28');
            expect(card.serverInfo.name).toBe('test-server');
            expect(card.serverInfo.version).toBe('1.0.0');
            expect(card.tools).toBeUndefined();
            expect(card.prompts).toBeUndefined();
            expect(card.resources).toBeUndefined();
        });

        it('includes server metadata', () => {
            const card = compileServerCard(
                {
                    name: 'billing-api',
                    version: '2.1.0',
                    title: 'Billing API',
                    description: 'Financial operations server',
                    iconUrl: 'https://example.com/icon.png',
                    documentationUrl: 'https://docs.example.com',
                },
                [],
            );

            expect(card.serverInfo.name).toBe('billing-api');
            expect(card.serverInfo.version).toBe('2.1.0');
            expect(card.serverInfo.title).toBe('Billing API');
            expect(card.description).toBe('Financial operations server');
            expect(card.iconUrl).toBe('https://example.com/icon.png');
            expect(card.documentationUrl).toBe('https://docs.example.com');
        });

        it('defaults to streamable-http transport when not specified', () => {
            const card = compileServerCard({ name: 'test' }, []);
            expect(card.transport.type).toBe('streamable-http');
        });

        it('sets streamable-http transport when configured', () => {
            const card = compileServerCard(
                { name: 'test', transport: 'streamable-http' },
                [],
            );

            expect(card.transport.type).toBe('streamable-http');
            expect(card.transport.endpoint).toBe('/mcp');
        });

        it('respects custom endpoint', () => {
            const card = compileServerCard(
                { name: 'test', transport: 'streamable-http', endpoint: '/api/mcp' },
                [],
            );

            expect(card.transport.endpoint).toBe('/api/mcp');
        });

        it('compiles tools from builders', () => {
            const builders = [
                createMockBuilder('projects', 'Project management', ['core']),
                createMockBuilder('billing', 'Invoice operations', ['finance']),
            ];

            const card = compileServerCard({ name: 'test' }, builders);

            expect(card.tools).toHaveLength(2);
            expect(card.tools![0].name).toBe('projects');
            expect(card.tools![0].description).toBe('Project management');
            expect(card.tools![0].tags).toEqual(['core']);
            expect(card.tools![1].name).toBe('billing');
            expect(card.capabilities.tools).toBeDefined();
        });

        it('handles builders without getTags (ToolBuilderLike)', () => {
            const builders = [createMinimalBuilder('simple')];

            const card = compileServerCard({ name: 'test' }, builders);

            expect(card.tools).toHaveLength(1);
            expect(card.tools![0].name).toBe('simple');
            expect(card.tools![0].tags).toEqual([]);
        });

        it('compiles prompts when provided', () => {
            const prompts = [
                { name: 'audit', description: 'Audit workflow' },
                { name: 'summary' },
            ];

            const card = compileServerCard({ name: 'test' }, [], prompts);

            expect(card.prompts).toHaveLength(2);
            expect(card.prompts![0].name).toBe('audit');
            expect(card.prompts![0].description).toBe('Audit workflow');
            expect(card.prompts![1].name).toBe('summary');
            expect(card.prompts![1].description).toBeUndefined();
            expect(card.capabilities.prompts).toBeDefined();
        });

        it('compiles resources when provided', () => {
            const resources = [
                { uri: 'stock://AAPL', name: 'Apple Stock', description: 'Live price', mimeType: 'application/json' },
            ];

            const card = compileServerCard({ name: 'test' }, [], undefined, resources);

            expect(card.resources).toHaveLength(1);
            expect(card.resources![0].uri).toBe('stock://AAPL');
            expect(card.resources![0].mimeType).toBe('application/json');
            expect(card.capabilities.resources).toBeDefined();
        });

        it('does not include empty capabilities', () => {
            const card = compileServerCard({ name: 'test' }, []);

            expect(card.capabilities.tools).toBeUndefined();
            expect(card.capabilities.prompts).toBeUndefined();
            expect(card.capabilities.resources).toBeUndefined();
        });

        it('respects custom protocolVersion', () => {
            const card = compileServerCard(
                { name: 'test', protocolVersion: '2026-01-01' },
                [],
            );

            expect(card.protocolVersion).toBe('2026-01-01');
        });

        it('compiles all primitives together (tools + prompts + resources)', () => {
            const builders = [createMockBuilder('tool_a', 'A tool', ['core'])];
            const prompts = [{ name: 'prompt_a', description: 'A prompt' }];
            const resources = [{ uri: 'data://metrics', name: 'Metrics' }];

            const card = compileServerCard({ name: 'full', version: '3.0.0' }, builders, prompts, resources);

            expect(card.tools).toHaveLength(1);
            expect(card.prompts).toHaveLength(1);
            expect(card.resources).toHaveLength(1);
            expect(card.capabilities.tools).toBeDefined();
            expect(card.capabilities.prompts).toBeDefined();
            expect(card.capabilities.resources).toBeDefined();
        });

        it('sets stdio transport without endpoint', () => {
            const card = compileServerCard({ name: 'test', transport: 'stdio' }, []);

            expect(card.transport.type).toBe('stdio');
            expect(card.transport.endpoint).toBeUndefined();
        });
    });

    // ─── JSON Schema Compliance ─────────────────────────

    describe('compileServerCard — JSON schema compliance', () => {
        it('produces valid JSON-serializable output', () => {
            const builders = [createMockBuilder('projects', 'Manage projects', ['core'])];
            const prompts = [{ name: 'audit', description: 'Run audit' }];
            const resources = [{ uri: 'data://metrics', name: 'Metrics' }];

            const card = compileServerCard(
                { name: 'full-server', version: '3.0.0', title: 'Full Server', description: 'Complete test', transport: 'streamable-http' },
                builders, prompts, resources,
            );

            const json = JSON.stringify(card, null, 2);
            const parsed = JSON.parse(json);
            expect(parsed.serverInfo.name).toBe('full-server');
            expect(parsed.tools).toHaveLength(1);
            expect(parsed.prompts).toHaveLength(1);
            expect(parsed.resources).toHaveLength(1);
        });

        it('JSON round-trip preserves all fields exactly', () => {
            const config: ServerCardConfig = {
                name: 'round-trip',
                version: '1.2.3',
                title: 'Round Trip Server',
                description: 'Ensures JSON serialization fidelity',
                iconUrl: 'https://cdn.example.com/icon.svg',
                documentationUrl: 'https://docs.example.com',
                transport: 'streamable-http',
                endpoint: '/custom/mcp',
                protocolVersion: '2026-07-28',
            };

            const original = compileServerCard(
                config,
                [createMockBuilder('a', 'Alpha', ['x', 'y'])],
                [{ name: 'p1', description: 'Prompt one' }],
                [{ uri: 'file://data', name: 'Data', description: 'Dataset', mimeType: 'text/csv' }],
            );

            const deserialized = JSON.parse(JSON.stringify(original)) as ServerCardPayload;

            expect(deserialized.$schema).toBe(original.$schema);
            expect(deserialized.version).toBe(original.version);
            expect(deserialized.protocolVersion).toBe(original.protocolVersion);
            expect(deserialized.serverInfo).toEqual(original.serverInfo);
            expect(deserialized.description).toBe(original.description);
            expect(deserialized.iconUrl).toBe(original.iconUrl);
            expect(deserialized.documentationUrl).toBe(original.documentationUrl);
            expect(deserialized.transport).toEqual(original.transport);
            expect(deserialized.tools).toEqual(original.tools);
            expect(deserialized.prompts).toEqual(original.prompts);
            expect(deserialized.resources).toEqual(original.resources);
        });

        it('omits optional fields when not provided (no undefined in JSON)', () => {
            const card = compileServerCard({ name: 'minimal' }, []);
            const json = JSON.stringify(card);

            expect(json).not.toContain('"title"');
            expect(json).not.toContain('"description"');
            expect(json).not.toContain('"iconUrl"');
            expect(json).not.toContain('"documentationUrl"');
            expect(json).not.toContain('"tools"');
            expect(json).not.toContain('"prompts"');
            expect(json).not.toContain('"resources"');
        });

        it('prompt entries without description omit the field (not null)', () => {
            const card = compileServerCard({ name: 'test' }, [], [{ name: 'bare' }]);
            const json = JSON.stringify(card);
            const parsed = JSON.parse(json);

            expect(parsed.prompts[0]).toEqual({ name: 'bare' });
            expect('description' in parsed.prompts[0]).toBe(false);
        });

        it('resource entries without optional fields omit them', () => {
            const card = compileServerCard({ name: 'test' }, [], undefined, [{ uri: 'x://y', name: 'R' }]);
            const json = JSON.stringify(card);
            const parsed = JSON.parse(json);

            expect(parsed.resources[0]).toEqual({ uri: 'x://y', name: 'R' });
            expect('description' in parsed.resources[0]).toBe(false);
            expect('mimeType' in parsed.resources[0]).toBe(false);
        });
    });

    // ─── Adversarial Inputs ─────────────────────────────

    describe('compileServerCard — adversarial inputs', () => {
        it('handles XSS in server name', () => {
            const card = compileServerCard(
                { name: '<script>alert("xss")</script>' },
                [],
            );

            expect(card.serverInfo.name).toBe('<script>alert("xss")</script>');
            // JSON.stringify does NOT escape < > — this is safe because
            // the endpoint serves Content-Type: application/json with
            // X-Content-Type-Options: nosniff (browsers won't interpret as HTML)
            const json = JSON.stringify(card);
            expect(json).toContain('alert');
            expect(JSON.parse(json).serverInfo.name).toBe('<script>alert("xss")</script>');
        });

        it('handles XSS in tool description', () => {
            const builder = createMockBuilder(
                'evil',
                '<img src=x onerror="alert(1)">',
                ['<script>'],
            );

            const card = compileServerCard({ name: 'test' }, [builder]);

            // Data preserved verbatim — safe with application/json + nosniff headers
            expect(card.tools![0].description).toBe('<img src=x onerror="alert(1)">');
            // Verify JSON round-trip preserves the value
            const json = JSON.stringify(card);
            const parsed = JSON.parse(json);
            expect(parsed.tools[0].description).toBe('<img src=x onerror="alert(1)">');
        });

        it('handles XSS in prompt names', () => {
            const card = compileServerCard(
                { name: 'test' },
                [],
                [{ name: '"><script>alert(1)</script>', description: 'normal' }],
            );

            expect(card.prompts![0].name).toBe('"><script>alert(1)</script>');
        });

        it('handles prototype pollution attempt in config', () => {
            const maliciousConfig = JSON.parse(
                '{"name":"safe","__proto__":{"polluted":true},"constructor":{"prototype":{"injected":true}}}',
            );

            const card = compileServerCard(maliciousConfig, []);

            expect(card.serverInfo.name).toBe('safe');
            // Verify no prototype pollution occurred
            expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
            expect(({} as Record<string, unknown>)['injected']).toBeUndefined();
        });

        it('handles extremely long server name (10,000 chars)', () => {
            const longName = 'a'.repeat(10_000);
            const card = compileServerCard({ name: longName }, []);

            expect(card.serverInfo.name).toBe(longName);
            expect(card.serverInfo.name.length).toBe(10_000);
        });

        it('handles unicode characters in all fields', () => {
            const card = compileServerCard(
                {
                    name: '日本語サーバー',
                    version: '1.0.0',
                    title: 'Сервер кириллицей',
                    description: '🚀 서버 설명 — descrição em português',
                },
                [createMockBuilder('工具', 'Описание инструмента', ['标签'])],
                [{ name: 'インプット', description: '프롬프트 설명' }],
                [{ uri: 'data://données', name: 'Ресурс' }],
            );

            expect(card.serverInfo.name).toBe('日本語サーバー');
            expect(card.serverInfo.title).toBe('Сервер кириллицей');
            expect(card.tools![0].name).toBe('工具');
            expect(card.tools![0].tags).toEqual(['标签']);
            expect(card.prompts![0].name).toBe('インプット');
            expect(card.resources![0].name).toBe('Ресурс');

            // Verify round-trip through JSON
            const parsed = JSON.parse(JSON.stringify(card));
            expect(parsed.serverInfo.name).toBe('日本語サーバー');
        });

        it('handles emoji-heavy content', () => {
            const card = compileServerCard(
                { name: '🔥server🔥', description: '💻🖥️📱🧠🤖' },
                [createMockBuilder('🛠️', '🔨 hammer tool', ['🏷️'])],
            );

            expect(card.serverInfo.name).toBe('🔥server🔥');
            expect(card.tools![0].name).toBe('🛠️');
        });

        it('handles empty string values gracefully', () => {
            const card = compileServerCard(
                { name: '', version: '', title: '' },
                [createMockBuilder('', '', [])],
            );

            expect(card.serverInfo.name).toBe('');
            expect(card.serverInfo.version).toBe('');
            expect(card.tools![0].name).toBe('');
        });

        it('handles null-byte injection in name', () => {
            const card = compileServerCard(
                { name: 'test\0malicious' },
                [],
            );

            expect(card.serverInfo.name).toBe('test\0malicious');
            // JSON.stringify handles null bytes
            const json = JSON.stringify(card);
            expect(json).toBeDefined();
        });

        it('handles newline injection in description', () => {
            const card = compileServerCard(
                { name: 'test', description: 'line1\nline2\r\nline3' },
                [],
            );

            expect(card.description).toBe('line1\nline2\r\nline3');
        });

        it('handles JSON injection in tool description', () => {
            const evil = '","__proto__":{"polluted":true},"x":"';
            const builder = createMockBuilder('tool', evil);

            const card = compileServerCard({ name: 'test' }, [builder]);
            const json = JSON.stringify(card);
            const parsed = JSON.parse(json);

            expect(parsed.tools[0].description).toBe(evil);
            expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
        });
    });

    // ─── Edge Cases ─────────────────────────────────────

    describe('compileServerCard — edge cases', () => {
        it('accepts generator iterables for builders', () => {
            const card = compileServerCard({ name: 'test' }, builderGenerator(3));

            expect(card.tools).toHaveLength(3);
            expect(card.tools![0].name).toBe('tool_0');
            expect(card.tools![2].name).toBe('tool_2');
        });

        it('handles builder that returns undefined from buildToolDefinition', () => {
            const builder = {
                getName: () => 'broken',
                buildToolDefinition: () => undefined,
            };

            const card = compileServerCard({ name: 'test' }, [builder as never]);

            expect(card.tools).toHaveLength(1);
            expect(card.tools![0].name).toBe('broken');
            expect(card.tools![0].description).toBeUndefined();
        });

        it('handles builder that returns null from buildToolDefinition', () => {
            const builder = {
                getName: () => 'null-def',
                buildToolDefinition: () => null,
            };

            const card = compileServerCard({ name: 'test' }, [builder as never]);

            expect(card.tools).toHaveLength(1);
            expect(card.tools![0].name).toBe('null-def');
            expect(card.tools![0].description).toBeUndefined();
        });

        it('handles duplicate tool names (no deduplication — mirrors registry)', () => {
            const builders = [
                createMockBuilder('tools', 'First'),
                createMockBuilder('tools', 'Second'),
            ];

            const card = compileServerCard({ name: 'test' }, builders);

            // No deduplication — card reflects raw registry state
            expect(card.tools).toHaveLength(2);
            expect(card.tools![0].description).toBe('First');
            expect(card.tools![1].description).toBe('Second');
        });

        it('handles empty prompt array', () => {
            const card = compileServerCard({ name: 'test' }, [], []);

            expect(card.prompts).toBeUndefined();
            expect(card.capabilities.prompts).toBeUndefined();
        });

        it('handles empty resource array', () => {
            const card = compileServerCard({ name: 'test' }, [], undefined, []);

            expect(card.resources).toBeUndefined();
            expect(card.capabilities.resources).toBeUndefined();
        });

        it('handles mixed minimal + full builders in same card', () => {
            const builders = [
                createMockBuilder('full', 'Full builder', ['tag1', 'tag2']),
                createMinimalBuilder('minimal'),
            ];

            const card = compileServerCard({ name: 'test' }, builders);

            expect(card.tools).toHaveLength(2);
            expect(card.tools![0].tags).toEqual(['tag1', 'tag2']);
            expect(card.tools![1].tags).toEqual([]);
        });

        it('handles resource with all optional fields populated', () => {
            const resources = [{
                uri: 'data://full',
                name: 'Full Resource',
                description: 'All fields present',
                mimeType: 'application/octet-stream',
            }];

            const card = compileServerCard({ name: 'test' }, [], undefined, resources);

            expect(card.resources![0]).toEqual({
                uri: 'data://full',
                name: 'Full Resource',
                description: 'All fields present',
                mimeType: 'application/octet-stream',
            });
        });

        it('preserves tool tag ordering', () => {
            const builders = [
                createMockBuilder('tool', 'Test', ['z', 'a', 'm', '0']),
            ];

            const card = compileServerCard({ name: 'test' }, builders);

            expect(card.tools![0].tags).toEqual(['z', 'a', 'm', '0']);
        });

        it('handles Set as iterable for builders', () => {
            const set = new Set([
                createMockBuilder('set_a', 'From set A'),
                createMockBuilder('set_b', 'From set B'),
            ]);

            const card = compileServerCard({ name: 'test' }, set);

            expect(card.tools).toHaveLength(2);
        });
    });

    // ─── Performance / Scale ────────────────────────────

    describe('compileServerCard — scale tests', () => {
        it('handles 1,000 tools without degradation', () => {
            const start = performance.now();
            const card = compileServerCard({ name: 'scale' }, builderGenerator(1_000));
            const duration = performance.now() - start;

            expect(card.tools).toHaveLength(1_000);
            expect(duration).toBeLessThan(500); // 500ms ceiling — generous for CI
        });

        it('handles 10,000 tools (stress test)', () => {
            const card = compileServerCard({ name: 'stress' }, builderGenerator(10_000));

            expect(card.tools).toHaveLength(10_000);
            expect(card.tools![9_999].name).toBe('tool_9999');
            expect(card.capabilities.tools).toBeDefined();
        });

        it('handles 100 prompts + 100 resources', () => {
            const prompts = Array.from({ length: 100 }, (_, i) => ({
                name: `prompt_${i}`,
                description: `Prompt ${i} description`,
            }));
            const resources = Array.from({ length: 100 }, (_, i) => ({
                uri: `data://resource_${i}`,
                name: `Resource ${i}`,
                mimeType: 'application/json',
            }));

            const card = compileServerCard({ name: 'large' }, [], prompts, resources);

            expect(card.prompts).toHaveLength(100);
            expect(card.resources).toHaveLength(100);
        });

        it('JSON.stringify of 1,000 tools produces valid output', () => {
            const card = compileServerCard({ name: 'json-scale' }, builderGenerator(1_000));
            const json = JSON.stringify(card);
            const parsed = JSON.parse(json);

            expect(parsed.tools).toHaveLength(1_000);
            expect(parsed.serverInfo.name).toBe('json-scale');
        });
    });

    // ─── Idempotency ────────────────────────────────────

    describe('compileServerCard — idempotency', () => {
        it('produces identical output for identical input', () => {
            const config: ServerCardConfig = { name: 'idem', version: '1.0.0', transport: 'streamable-http' };
            const builders = [createMockBuilder('t', 'd', ['x'])];
            const prompts = [{ name: 'p', description: 'd' }];
            const resources = [{ uri: 'u://r', name: 'R' }];

            const a = JSON.stringify(compileServerCard(config, builders, prompts, resources));
            const b = JSON.stringify(compileServerCard(config, builders, prompts, resources));

            expect(a).toBe(b);
        });

        it('does not mutate the input config object', () => {
            const config: ServerCardConfig = { name: 'immutable', version: '1.0.0' };
            const frozen = Object.freeze({ ...config });

            // Should not throw when config is frozen
            const card = compileServerCard(frozen, []);
            expect(card.serverInfo.name).toBe('immutable');
        });

        it('does not mutate builder objects', () => {
            const builder = createMockBuilder('safe', 'Original');
            compileServerCard({ name: 'test' }, [builder]);

            expect(builder.getName()).toBe('safe');
            expect(builder.buildToolDefinition().description).toBe('Original');
        });
    });

    // ─── Type Contract ──────────────────────────────────

    describe('compileServerCard — type contract', () => {
        it('serverInfo always has name and version', () => {
            const card = compileServerCard({ name: 'typed' }, []);
            expect(typeof card.serverInfo.name).toBe('string');
            expect(typeof card.serverInfo.version).toBe('string');
        });

        it('transport.type is always a string', () => {
            const card = compileServerCard({ name: 'typed' }, []);
            expect(typeof card.transport.type).toBe('string');
        });

        it('capabilities is always an object (never undefined)', () => {
            const card = compileServerCard({ name: 'typed' }, []);
            expect(card.capabilities).toBeDefined();
            expect(typeof card.capabilities).toBe('object');
        });

        it('$schema is always a URL string', () => {
            const card = compileServerCard({ name: 'typed' }, []);
            expect(card.$schema).toContain('://');
        });

        it('version is always the string "1.0"', () => {
            const card = compileServerCard({ name: 'typed' }, []);
            expect(card.version).toBe('1.0');
        });

        it('tool entries always have name and tags fields', () => {
            const card = compileServerCard({ name: 'test' }, [createMinimalBuilder('t')]);

            for (const tool of card.tools!) {
                expect(typeof tool.name).toBe('string');
                expect(Array.isArray(tool.tags)).toBe(true);
            }
        });
    });
});
