/**
 * @vurb/yaml — Comprehensive Test Suite
 *
 * Tests the full YAML engine pipeline: parse → validate → compile → execute.
 * Uses vitest with real YAML fixtures.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseVurbYaml, VurbYamlError } from '../src/parser/VurbYamlParser.js';
import { validateYamlSchema } from '../src/parser/SchemaValidator.js';
import { validateCrossRefs } from '../src/parser/CrossRefValidator.js';
import { resolveAllConnections } from '../src/compiler/ConnectionResolver.js';
import { compileAllTools } from '../src/compiler/ToolCompiler.js';
import { compileAllResources } from '../src/compiler/ResourceCompiler.js';
import { compileAllPrompts, hydratePromptMessages } from '../src/compiler/PromptCompiler.js';
import { extractPath, applyResponseTransform } from '../src/compiler/ResponseTransformer.js';
import { compileParameters } from '../src/schema/ParameterCompiler.js';
import { interpolateSecrets, interpolateSecretsDeep, resolveSecretsFromEnv } from '../src/schema/SecretInterpolator.js';
import { interpolateParams, interpolateDeep, executeYamlTool } from '../src/runtime/BasicToolExecutor.js';
import { loadYamlServer } from '../src/runtime/LocalServer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

// ════════════════════════════════════════════════════════════
// 1. Parser Tests
// ════════════════════════════════════════════════════════════

describe('VurbYamlParser', () => {
    it('parses a valid complete YAML manifest', () => {
        const spec = parseVurbYaml(fixture('valid-complete.yaml'));
        expect(spec.version).toBe('1.0');
        expect(spec.server.name).toBe('test-rh-server');
        expect(spec.server.description).toBe('Test server for HR onboarding');
    });

    it('parses a minimal YAML manifest', () => {
        const spec = parseVurbYaml(fixture('valid-minimal.yaml'));
        expect(spec.version).toBe('1.0');
        expect(spec.server.name).toBe('minimal-server');
        expect(spec.tools).toHaveLength(1);
    });

    it('throws VurbYamlError on invalid version', () => {
        expect(() => parseVurbYaml(fixture('invalid-version.yaml'))).toThrow(VurbYamlError);
    });

    it('throws VurbYamlError on broken cross-references', () => {
        expect(() => parseVurbYaml(fixture('invalid-crossref.yaml'))).toThrow(VurbYamlError);
    });

    it('throws VurbYamlError on duplicate tool names', () => {
        expect(() => parseVurbYaml(fixture('invalid-duplicates.yaml'))).toThrow(VurbYamlError);
    });

    it('throws on empty input', () => {
        expect(() => parseVurbYaml('')).toThrow();
    });

    it('throws on pure garbage', () => {
        expect(() => parseVurbYaml('not: {valid: [yaml manifest')).toThrow();
    });

    it('preserves all tool fields from complete manifest', () => {
        const spec = parseVurbYaml(fixture('valid-complete.yaml'));
        const createTicket = spec.tools!.find(t => t.name === 'create_ticket');
        expect(createTicket).toBeDefined();
        expect(createTicket!.description).toContain('Jira ticket');
        expect(createTicket!.instruction).toContain('IT access');
        expect(createTicket!.rules).toHaveLength(2);
        expect(createTicket!.tag).toBe('tickets');
        expect(createTicket!.annotations?.readOnlyHint).toBe(false);
        expect(createTicket!.annotations?.openWorldHint).toBe(true);
    });

    it('preserves all secrets', () => {
        const spec = parseVurbYaml(fixture('valid-complete.yaml'));
        expect(spec.secrets).toBeDefined();
        expect(Object.keys(spec.secrets!)).toEqual(['API_TOKEN', 'JIRA_EMAIL', 'JIRA_TOKEN']);
        expect(spec.secrets!['API_TOKEN'].sensitive).toBe(true);
    });

    it('preserves all connections', () => {
        const spec = parseVurbYaml(fixture('valid-complete.yaml'));
        expect(spec.connections).toBeDefined();
        expect(Object.keys(spec.connections!)).toEqual(['intranet', 'jira']);
        expect(spec.connections!['jira'].auth?.type).toBe('basic');
    });
});

// ════════════════════════════════════════════════════════════
// 2. Schema Validator Tests
// ════════════════════════════════════════════════════════════

describe('SchemaValidator', () => {
    it('validates a well-formed YAML object', () => {
        const input = {
            version: '1.0',
            server: { name: 'test' },
            tools: [{
                name: 'hello',
                description: 'World',
                execute: { connection: 'api', method: 'GET', path: '/' },
            }],
            connections: {
                api: { type: 'rest', base_url: 'https://api.example.com' },
            },
        };
        const result = validateYamlSchema(input);
        expect(result.version).toBe('1.0');
    });

    it('rejects missing server.name', () => {
        expect(() => validateYamlSchema({
            version: '1.0',
            server: {},
        })).toThrow();
    });

    it('rejects unknown version', () => {
        expect(() => validateYamlSchema({
            version: '99.0',
            server: { name: 'x' },
        })).toThrow();
    });

    it('rejects tool without description', () => {
        expect(() => validateYamlSchema({
            version: '1.0',
            server: { name: 'x' },
            tools: [{
                name: 'bad',
                execute: { connection: 'a', method: 'GET', path: '/' },
            }],
        })).toThrow();
    });
});

// ════════════════════════════════════════════════════════════
// 3. CrossRef Validator Tests
// ════════════════════════════════════════════════════════════

describe('CrossRefValidator', () => {
    it('passes with valid references', () => {
        const spec = validateYamlSchema({
            version: '1.0',
            server: { name: 'x' },
            connections: { api: { type: 'rest', base_url: 'https://x.com' } },
            secrets: { TOKEN: { label: 'Token', type: 'api_key', required: true } },
            tools: [{
                name: 'test',
                description: 'Test',
                execute: { connection: 'api', method: 'GET', path: '/${SECRETS.TOKEN}' },
            }],
        });
        // Should not throw
        expect(() => validateCrossRefs(spec)).not.toThrow();
    });

    it('fails on missing connection reference', () => {
        const spec = validateYamlSchema({
            version: '1.0',
            server: { name: 'x' },
            connections: { api: { type: 'rest', base_url: 'https://x.com' } },
            tools: [{
                name: 'test',
                description: 'Test',
                execute: { connection: 'ghost', method: 'GET', path: '/' },
            }],
        });
        expect(() => validateCrossRefs(spec)).toThrow(/ghost/);
    });

    it('fails on undeclared secret reference', () => {
        const spec = validateYamlSchema({
            version: '1.0',
            server: { name: 'x' },
            connections: {
                api: {
                    type: 'rest',
                    base_url: 'https://x.com',
                    auth: { type: 'bearer', token: '${SECRETS.MISSING}' },
                },
            },
            tools: [{
                name: 'test',
                description: 'Test',
                execute: { connection: 'api', method: 'GET', path: '/' },
            }],
        });
        expect(() => validateCrossRefs(spec)).toThrow(/MISSING/);
    });
});

// ════════════════════════════════════════════════════════════
// 4. SecretInterpolator Tests
// ════════════════════════════════════════════════════════════

describe('SecretInterpolator', () => {
    it('interpolates a single secret', () => {
        const result = interpolateSecrets('Bearer ${SECRETS.TOKEN}', { TOKEN: 'abc123' });
        expect(result).toBe('Bearer abc123');
    });

    it('interpolates multiple secrets', () => {
        const result = interpolateSecrets('${SECRETS.A}:${SECRETS.B}', { A: 'x', B: 'y' });
        expect(result).toBe('x:y');
    });

    it('throws on unresolved secrets', () => {
        expect(() => interpolateSecrets('${SECRETS.MISSING}', {})).toThrow(/MISSING/);
    });

    it('deep interpolates objects', () => {
        const result = interpolateSecretsDeep(
            { auth: { token: '${SECRETS.T}' }, arr: ['${SECRETS.A}'] },
            { T: 'tok', A: 'a' },
        );
        expect(result).toEqual({ auth: { token: 'tok' }, arr: ['a'] });
    });

    it('resolves from process.env', () => {
        process.env['MY_KEY'] = 'env_value';
        const result = resolveSecretsFromEnv(['MY_KEY']);
        expect(result['MY_KEY']).toBe('env_value');
        delete process.env['MY_KEY'];
    });
});

// ════════════════════════════════════════════════════════════
// 5. ParameterCompiler Tests
// ════════════════════════════════════════════════════════════

describe('ParameterCompiler', () => {
    it('compiles string parameters with required', () => {
        const schema = compileParameters({
            name: { type: 'string', required: true, description: 'User name' },
            age: { type: 'number', required: false },
        });
        expect(schema.type).toBe('object');
        expect(schema.required).toContain('name');
        expect(schema.required).not.toContain('age');
        expect(schema.properties['name']).toEqual({
            type: 'string',
            description: 'User name',
        });
    });

    it('handles enum parameters', () => {
        const schema = compileParameters({
            priority: {
                type: 'string',
                required: true,
                enum: ['low', 'medium', 'high'],
            },
        });
        expect(schema.properties['priority']).toEqual({
            type: 'string',
            enum: ['low', 'medium', 'high'],
        });
    });

    it('returns empty schema for empty params', () => {
        const schema = compileParameters({});
        expect(schema.properties).toEqual({});
        expect(schema.required).toEqual([]);
    });
});

// ════════════════════════════════════════════════════════════
// 6. ConnectionResolver Tests
// ════════════════════════════════════════════════════════════

describe('ConnectionResolver', () => {
    it('resolves bearer auth', () => {
        const connections = resolveAllConnections(
            { api: { type: 'rest', base_url: 'https://x.com', auth: { type: 'bearer', token: '${SECRETS.T}' } } },
            { T: 'mytoken' },
        );
        const conn = connections.get('api')!;
        expect(conn.baseUrl).toBe('https://x.com');
        expect(conn.headers['Authorization']).toBe('Bearer mytoken');
    });

    it('resolves basic auth', () => {
        const connections = resolveAllConnections(
            { api: { type: 'rest', base_url: 'https://x.com', auth: { type: 'basic', username: 'u', password: 'p' } } },
            {},
        );
        const conn = connections.get('api')!;
        const encoded = Buffer.from('u:p').toString('base64');
        expect(conn.headers['Authorization']).toBe(`Basic ${encoded}`);
    });

    it('resolves custom headers', () => {
        const connections = resolveAllConnections(
            { api: { type: 'rest', base_url: 'https://x.com', headers: { 'X-Custom': '${SECRETS.H}' } } },
            { H: 'val' },
        );
        const conn = connections.get('api')!;
        expect(conn.headers['X-Custom']).toBe('val');
    });
});

// ════════════════════════════════════════════════════════════
// 7. ToolCompiler Tests
// ════════════════════════════════════════════════════════════

describe('ToolCompiler', () => {
    it('compiles tools with trichotomy (description/instruction/rules)', () => {
        const connections = resolveAllConnections(
            { api: { type: 'rest', base_url: 'https://x.com' } },
            {},
        );
        const tools = compileAllTools([{
            name: 'test',
            description: 'Test tool',
            instruction: 'Do X then Y',
            rules: ['Never do Z'],
            execute: { connection: 'api', method: 'POST', path: '/test' },
        }], connections);

        expect(tools).toHaveLength(1);
        const tool = tools[0]!;
        expect(tool.name).toBe('test');
        expect(tool.description).toBe('Test tool');
        expect(tool.instruction).toBe('Do X then Y');
        expect(tool.rules).toEqual(['Never do Z']);
    });

    it('compiles tool with parameters as JSON Schema', () => {
        const connections = resolveAllConnections(
            { api: { type: 'rest', base_url: 'https://x.com' } },
            {},
        );
        const tools = compileAllTools([{
            name: 'greet',
            description: 'Greet',
            parameters: {
                name: { type: 'string', required: true },
            },
            execute: { connection: 'api', method: 'GET', path: '/greet' },
        }], connections);

        expect(tools[0]!.inputSchema.required).toContain('name');
    });
});

// ════════════════════════════════════════════════════════════
// 8. ResourceCompiler Tests
// ════════════════════════════════════════════════════════════

describe('ResourceCompiler', () => {
    it('compiles static resources', () => {
        const resources = compileAllResources([{
            name: 'Manual',
            uri: 'docs://manual',
            mime_type: 'text/markdown',
            execute: { type: 'static', content: '# Hello' },
        }], new Map(), {});

        expect(resources).toHaveLength(1);
        const res = resources[0]!;
        expect(res.execute.type).toBe('static');
        if (res.execute.type === 'static') {
            expect(res.execute.content).toBe('# Hello');
        }
    });

    it('compiles connection resources', () => {
        const connections = resolveAllConnections(
            { api: { type: 'rest', base_url: 'https://x.com' } },
            {},
        );
        const resources = compileAllResources([{
            name: 'Data',
            uri: 'data://items',
            execute: { type: 'connection', connection: 'api', method: 'GET', path: '/items' },
        }], connections, {});

        const res = resources[0]!;
        expect(res.execute.type).toBe('connection');
    });

    it('detects URI templates', () => {
        const resources = compileAllResources([{
            name: 'Template',
            uri: 'data://items/{id}',
            execute: { type: 'static', content: 'test' },
        }], new Map(), {});

        expect(resources[0]!.isTemplate).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════
// 9. PromptCompiler Tests
// ════════════════════════════════════════════════════════════

describe('PromptCompiler', () => {
    it('compiles prompts with arguments', () => {
        const prompts = compileAllPrompts([{
            name: 'welcome',
            description: 'Welcome email',
            arguments: {
                name: { type: 'string', required: true },
                role: { type: 'string', required: false },
            },
            messages: [{ role: 'user', content: 'Hi {{name}} ({{role}})' }],
        }]);

        expect(prompts).toHaveLength(1);
        const prompt = prompts[0]!;
        expect(prompt.name).toBe('welcome');
        expect(prompt.arguments).toHaveLength(2);
    });

    it('hydrates prompt messages with arguments', () => {
        const prompts = compileAllPrompts([{
            name: 'test',
            messages: [{ role: 'user', content: 'Hello {{name}}' }],
        }]);

        const messages = hydratePromptMessages(prompts[0]!, { name: 'Alice' });
        expect(messages[0]!.content).toEqual({ type: 'text', text: 'Hello Alice' });
    });
});

// ════════════════════════════════════════════════════════════
// 10. ResponseTransformer Tests
// ════════════════════════════════════════════════════════════

describe('ResponseTransformer', () => {
    const data = {
        ticket: { id: 1, key: 'IT-42', details: { status: 'open' } },
        items: [
            { id: 1, name: 'Alice', email: 'a@x.com', salary: 999 },
            { id: 2, name: 'Bob', email: 'b@x.com', salary: 888 },
        ],
    };

    it('extracts simple dot-path', () => {
        expect(extractPath(data, 'ticket.key')).toBe('IT-42');
    });

    it('extracts nested dot-path', () => {
        expect(extractPath(data, 'ticket.details.status')).toBe('open');
    });

    it('returns undefined for missing path', () => {
        expect(extractPath(data, 'ticket.nonexistent')).toBeUndefined();
    });

    it('returns undefined for null input', () => {
        expect(extractPath(null, 'any.path')).toBeUndefined();
    });

    it('performs array projection', () => {
        const result = extractPath(data, 'items[].{id, name, email}') as Array<Record<string, unknown>>;
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1, name: 'Alice', email: 'a@x.com' });
        // salary is NOT included — projection only returns requested fields
        expect(result[0]).not.toHaveProperty('salary');
    });

    it('applies single extract transform', () => {
        const result = applyResponseTransform(data, { extract: ['ticket.key'] });
        expect(result).toBe('IT-42');
    });

    it('applies multiple extract transform', () => {
        const result = applyResponseTransform(data, { extract: ['ticket.id', 'ticket.key'] }) as Record<string, unknown>;
        expect(result['id']).toBe(1);
        expect(result['key']).toBe('IT-42');
    });

    it('returns raw data when no transform', () => {
        expect(applyResponseTransform(data, undefined)).toBe(data);
    });
});

// ════════════════════════════════════════════════════════════
// 11. BasicToolExecutor Tests
// ════════════════════════════════════════════════════════════

describe('BasicToolExecutor', () => {
    describe('interpolateParams', () => {
        it('interpolates named params', () => {
            expect(interpolateParams('/tickets/{{id}}', { id: '42' })).toBe('/tickets/42');
        });

        it('keeps unknown params as-is', () => {
            expect(interpolateParams('{{missing}}', {})).toBe('{{missing}}');
        });

        it('interpolates built-in __REQUEST_ID__', () => {
            const result = interpolateParams('{{__REQUEST_ID__}}', {});
            // UUID format
            expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
        });
    });

    describe('interpolateDeep', () => {
        it('deep-interpolates nested objects', () => {
            const result = interpolateDeep(
                { a: '{{x}}', b: ['{{y}}'], c: { d: '{{z}}' } },
                { x: '1', y: '2', z: '3' },
            );
            expect(result).toEqual({ a: '1', b: ['2'], c: { d: '3' } });
        });
    });

    describe('executeYamlTool', () => {
        it('executes a GET tool and returns content', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(JSON.stringify({ result: 'hello' })),
                status: 200,
            });

            const tool = {
                name: 'test',
                description: 'Test',
                inputSchema: { type: 'object' as const, properties: {}, required: [] },
                connection: { baseUrl: 'https://api.example.com', headers: {} },
                execute: { method: 'GET', pathTemplate: '/ping' },
            };

            const result = await executeYamlTool(tool, {}, mockFetch as unknown as typeof fetch);
            expect(result.isError).toBeFalsy();
            expect(result.content[0]!.text).toContain('hello');
        });

        it('returns error for non-2xx response', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('not found'),
            });

            const tool = {
                name: 'test',
                description: 'Test',
                inputSchema: { type: 'object' as const, properties: {}, required: [] },
                connection: { baseUrl: 'https://api.example.com', headers: {} },
                execute: { method: 'GET', pathTemplate: '/missing' },
            };

            const result = await executeYamlTool(tool, {}, mockFetch as unknown as typeof fetch);
            expect(result.isError).toBe(true);
            expect(result.content[0]!.text).toContain('404');
        });

        it('handles fetch errors gracefully', async () => {
            const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const tool = {
                name: 'test',
                description: 'Test',
                inputSchema: { type: 'object' as const, properties: {}, required: [] },
                connection: { baseUrl: 'https://api.example.com', headers: {} },
                execute: { method: 'GET', pathTemplate: '/fail' },
            };

            const result = await executeYamlTool(tool, {}, mockFetch as unknown as typeof fetch);
            expect(result.isError).toBe(true);
            expect(result.content[0]!.text).toContain('Network error');
        });

        it('interpolates path params and query params', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('{}'),
                status: 200,
            });

            const tool = {
                name: 'search',
                description: 'Search',
                inputSchema: { type: 'object' as const, properties: {}, required: [] },
                connection: { baseUrl: 'https://api.example.com', headers: {} },
                execute: {
                    method: 'GET',
                    pathTemplate: '/employees/{{id}}',
                    queryTemplates: { q: '{{query}}', limit: '10' },
                },
            };

            await executeYamlTool(tool, { id: '42', query: 'alice' }, mockFetch as unknown as typeof fetch);
            const calledUrl = mockFetch.mock.calls[0]![0] as string;
            expect(calledUrl).toContain('/employees/42');
            expect(calledUrl).toContain('q=alice');
            expect(calledUrl).toContain('limit=10');
        });
    });
});

// ════════════════════════════════════════════════════════════
// 12. Full Pipeline Integration Tests (loadYamlServer)
// ════════════════════════════════════════════════════════════

describe('loadYamlServer (integration)', () => {
    it('compiles the complete YAML fixture end-to-end', async () => {
        const yaml = fixture('valid-complete.yaml');
        const server = await loadYamlServer(yaml, {
            API_TOKEN: 'test-token',
            JIRA_EMAIL: 'test@example.com',
            JIRA_TOKEN: 'jira-token',
        });

        // Server metadata
        expect(server.serverMeta.name).toBe('test-rh-server');
        expect(server.serverMeta.capabilities?.tools).toBe(true);

        // Connections: 2 (intranet + jira)
        expect(server.connections.size).toBe(2);
        const intranet = server.connections.get('intranet')!;
        expect(intranet.baseUrl).toBe('https://intranet.example.com/api/v1');
        expect(intranet.headers['Authorization']).toBe('Bearer test-token');

        const jira = server.connections.get('jira')!;
        expect(jira.headers['Authorization']).toContain('Basic');

        // Tools: 2 (create_ticket + search_employee)
        expect(server.tools).toHaveLength(2);
        const ticket = server.tools.find(t => t.name === 'create_ticket');
        expect(ticket).toBeDefined();
        expect(ticket!.instruction).toContain('IT access');
        expect(ticket!.rules).toHaveLength(2);
        expect(ticket!.inputSchema.required).toContain('title');
        expect(ticket!.inputSchema.required).toContain('body');

        const search = server.tools.find(t => t.name === 'search_employee');
        expect(search).toBeDefined();
        expect(search!.annotations?.readOnlyHint).toBe(true);

        // Resources: 2 (manual + benefits)
        expect(server.resources).toHaveLength(2);
        const manual = server.resources.find(r => r.name === 'Employee Manual');
        expect(manual).toBeDefined();
        expect(manual!.execute.type).toBe('static');

        // Prompts: 1 (welcome_email)
        expect(server.prompts).toHaveLength(1);
        expect(server.prompts[0]!.name).toBe('welcome_email');

        // Settings (parsed but not enforced by open-source)
        expect(server.settings?.dlp?.enabled).toBe(true);
        expect(server.settings?.finops?.max_array_items).toBe(25);
    });

    it('compiles the minimal YAML fixture', async () => {
        const yaml = fixture('valid-minimal.yaml');
        const server = await loadYamlServer(yaml, {});

        expect(server.serverMeta.name).toBe('minimal-server');
        expect(server.tools).toHaveLength(1);
        expect(server.resources).toHaveLength(0);
        expect(server.prompts).toHaveLength(0);
    });

    it('rejects invalid YAML in the pipeline', async () => {
        await expect(loadYamlServer(fixture('invalid-version.yaml'))).rejects.toThrow();
    });
});
