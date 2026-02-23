import { describe, it, expect } from 'vitest';
import { toToolName, synthesizeTool } from '../src/ToolSynthesizer.js';
import { inferSchema } from '../src/SchemaInferrer.js';
import { WorkflowDiscovery } from '../src/WorkflowDiscovery.js';
import { N8nClient } from '../src/N8nClient.js';
import { defineN8nTool } from '../src/defineN8nTool.js';
import type { WebhookConfig, N8nWorkflow } from '../src/types.js';

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

const WEBHOOK_WORKFLOW: N8nWorkflow = {
    id: 42,
    name: 'Lead Enrichment',
    active: true,
    tags: [{ id: 1, name: 'sales' }, { id: 2, name: 'crm' }],
    nodes: [
        {
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            parameters: {
                path: 'lead-enrichment',
                httpMethod: 'POST',
                options: {
                    queryParameters: [
                        { name: 'source', type: 'string', required: false },
                    ],
                },
            },
            position: [250, 300],
        },
        {
            name: 'Code',
            type: 'n8n-nodes-base.code',
            parameters: {},
            position: [450, 300],
        },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    meta: { notes: 'Enriches a lead with company data from Clearbit.' },
};

const CRON_WORKFLOW: N8nWorkflow = {
    id: 99,
    name: 'Daily Report',
    active: true,
    tags: [{ id: 3, name: 'internal' }],
    nodes: [
        {
            name: 'Cron',
            type: 'n8n-nodes-base.cron',
            parameters: {},
            position: [250, 300],
        },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
};

const GET_WEBHOOK_WORKFLOW: N8nWorkflow = {
    id: 50,
    name: 'Status Check',
    active: true,
    tags: [],
    nodes: [
        {
            name: 'Webhook',
            type: '@n8n/n8n-nodes-base.webhook',
            parameters: {
                path: 'status',
                httpMethod: 'GET',
            },
            position: [250, 300],
        },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
};

const WEBHOOK_CONFIG: WebhookConfig = {
    workflowId: 42,
    workflowName: 'Lead Enrichment',
    path: '/webhook/lead-enrichment',
    method: 'POST',
    description: 'Enriches a lead with company data from Clearbit.',
    tags: ['sales', 'crm'],
    queryParams: [
        { name: 'source', type: 'string', required: false },
    ],
};

// ═══════════════════════════════════════════════════════════════
// toToolName()
// ═══════════════════════════════════════════════════════════════

describe('toToolName', () => {
    it('should convert spaces to underscores and lowercase', () => {
        expect(toToolName('Lead Enrichment')).toBe('lead_enrichment');
    });

    it('should handle special characters', () => {
        expect(toToolName('My Awesome Workflow (v2)')).toBe('my_awesome_workflow_v2');
    });

    it('should strip leading/trailing separators', () => {
        expect(toToolName('  Deploy Staging  ')).toBe('deploy_staging');
    });

    it('should collapse multiple separators', () => {
        expect(toToolName('a---b___c')).toBe('a_b_c');
    });

    it('should handle single word', () => {
        expect(toToolName('deploy')).toBe('deploy');
    });
});

// ═══════════════════════════════════════════════════════════════
// SchemaInferrer
// ═══════════════════════════════════════════════════════════════

describe('inferSchema', () => {
    it('should create string fields for query params', () => {
        const schema = inferSchema(WEBHOOK_CONFIG);
        expect(schema['source']).toBeDefined();
    });

    it('should add open body field for POST methods', () => {
        const schema = inferSchema(WEBHOOK_CONFIG);
        expect(schema['body']).toBeDefined();
    });

    it('should NOT add body field for GET methods', () => {
        const getConfig: WebhookConfig = {
            ...WEBHOOK_CONFIG,
            method: 'GET',
        };
        const schema = inferSchema(getConfig);
        expect(schema['body']).toBeUndefined();
    });

    it('should NOT add body for HEAD or DELETE', () => {
        const headConfig: WebhookConfig = { ...WEBHOOK_CONFIG, method: 'HEAD' };
        const deleteConfig: WebhookConfig = { ...WEBHOOK_CONFIG, method: 'DELETE' };
        expect(inferSchema(headConfig)['body']).toBeUndefined();
        expect(inferSchema(deleteConfig)['body']).toBeUndefined();
    });

    it('should handle empty query params', () => {
        const config: WebhookConfig = { ...WEBHOOK_CONFIG, queryParams: [] };
        const schema = inferSchema(config);
        // Only body field
        expect(Object.keys(schema)).toEqual(['body']);
    });
});

// ═══════════════════════════════════════════════════════════════
// WorkflowDiscovery
// ═══════════════════════════════════════════════════════════════

describe('WorkflowDiscovery', () => {
    /** Creates a mock N8nClient that returns the given workflows */
    function mockClient(workflows: N8nWorkflow[]) {
        return {
            listWorkflows: async () => workflows,
        } as unknown as N8nClient;
    }

    it('should discover only webhook-triggered workflows', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW, CRON_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(1);
        expect(configs[0]!.workflowId).toBe(42);
    });

    it('should detect both webhook node type variants', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW, GET_WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(2);
    });

    it('should filter by includeTags', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client, { includeTags: ['finance'] });
        const configs = await discovery.discover();
        expect(configs).toHaveLength(0);
    });

    it('should include matching tags', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client, { includeTags: ['sales'] });
        const configs = await discovery.discover();
        expect(configs).toHaveLength(1);
    });

    it('should filter by excludeTags', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client, { excludeTags: ['crm'] });
        const configs = await discovery.discover();
        expect(configs).toHaveLength(0);
    });

    it('should extract webhook path', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.path).toBe('/webhook/lead-enrichment');
    });

    it('should extract HTTP method', async () => {
        const client = mockClient([GET_WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.method).toBe('GET');
    });

    it('should use workflow notes as description (Hack Semântico)', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.description).toBe('Enriches a lead with company data from Clearbit.');
    });

    it('should fallback to workflow name if no notes', async () => {
        const client = mockClient([GET_WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.description).toContain('Status Check');
    });

    it('should extract query params from webhook config', async () => {
        const client = mockClient([WEBHOOK_WORKFLOW]);
        const discovery = new WorkflowDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.queryParams).toHaveLength(1);
        expect(configs[0]!.queryParams[0]!.name).toBe('source');
    });
});

// ═══════════════════════════════════════════════════════════════
// ToolSynthesizer
// ═══════════════════════════════════════════════════════════════

describe('synthesizeTool', () => {
    function mockClient() {
        return {
            callWebhook: async () => ({ status: 200, data: { ok: true } }),
        } as unknown as N8nClient;
    }

    it('should produce a tool with the correct name', () => {
        const tool = synthesizeTool(WEBHOOK_CONFIG, mockClient());
        expect(tool.name).toBe('lead_enrichment');
    });

    it('should include n8n metadata in description', () => {
        const tool = synthesizeTool(WEBHOOK_CONFIG, mockClient());
        expect(tool.config.description).toContain('[n8n Workflow #42]');
        expect(tool.config.description).toContain('Lead Enrichment');
        expect(tool.config.description).toContain('POST /webhook/lead-enrichment');
    });

    it('should include workflow tags', () => {
        const tool = synthesizeTool(WEBHOOK_CONFIG, mockClient());
        expect(tool.config.tags).toEqual(['sales', 'crm']);
    });

    it('should have an "execute" action', () => {
        const tool = synthesizeTool(WEBHOOK_CONFIG, mockClient());
        expect(tool.config.actions['execute']).toBeDefined();
    });

    it('should set readOnlyHint based on HTTP method', () => {
        const getConfig: WebhookConfig = { ...WEBHOOK_CONFIG, method: 'GET' };
        const getTool = synthesizeTool(getConfig, mockClient());
        expect(getTool.config.actions['execute']!.annotations?.readOnlyHint).toBe(true);

        const postTool = synthesizeTool(WEBHOOK_CONFIG, mockClient());
        expect(postTool.config.actions['execute']!.annotations?.readOnlyHint).toBe(false);
    });

    it('should produce a working handler', async () => {
        const tool = synthesizeTool(WEBHOOK_CONFIG, mockClient());
        const result = await tool.config.actions['execute']!.handler(null, { email: 'test@co.com' });
        const content = result as { content: Array<{ text: string }> };
        expect(JSON.parse(content.content[0]!.text)).toEqual({ ok: true });
    });

    it('should handle error responses', async () => {
        const errorClient = {
            callWebhook: async () => ({ status: 500, data: { error: 'boom' } }),
        } as unknown as N8nClient;
        const tool = synthesizeTool(WEBHOOK_CONFIG, errorClient);
        const result = await tool.config.actions['execute']!.handler(null, {});
        const content = result as { isError: boolean };
        expect(content.isError).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// defineN8nTool — Manual mode
// ═══════════════════════════════════════════════════════════════

describe('defineN8nTool', () => {
    function mockClient() {
        return {
            callWebhook: async () => ({ status: 200, data: { deployed: true } }),
        } as unknown as N8nClient;
    }

    it('should create a tool with the given name', () => {
        const tool = defineN8nTool('deploy_staging', mockClient(), {
            workflowId: 15,
            webhookPath: '/webhook/deploy',
        });
        expect(tool.name).toBe('deploy_staging');
    });

    it('should use provided description', () => {
        const tool = defineN8nTool('deploy_staging', mockClient(), {
            workflowId: 15,
            webhookPath: '/webhook/deploy',
            description: 'Deploy to staging environment',
        });
        expect(tool.config.description).toBe('Deploy to staging environment');
    });

    it('should fallback description to workflow id', () => {
        const tool = defineN8nTool('deploy_staging', mockClient(), {
            workflowId: 15,
            webhookPath: '/webhook/deploy',
        });
        expect(tool.config.description).toContain('#15');
    });

    it('should pass annotations through', () => {
        const tool = defineN8nTool('deploy_staging', mockClient(), {
            workflowId: 15,
            webhookPath: '/webhook/deploy',
            annotations: { destructiveHint: true },
        });
        expect(tool.config.actions['execute']!.annotations?.destructiveHint).toBe(true);
    });

    it('should handle string param definitions', () => {
        const tool = defineN8nTool('deploy_staging', mockClient(), {
            workflowId: 15,
            webhookPath: '/webhook/deploy',
            params: { branch: 'string' },
        });
        expect(tool.config.actions['execute']!.params['branch']).toBe('string');
    });

    it('should handle object param definitions with enum', () => {
        const tool = defineN8nTool('deploy_staging', mockClient(), {
            workflowId: 15,
            webhookPath: '/webhook/deploy',
            params: {
                env: { type: 'string', enum: ['staging', 'production'] },
            },
        });
        const param = tool.config.actions['execute']!.params['env'] as { enum: string[] };
        expect(param.enum).toEqual(['staging', 'production']);
    });

    it('should produce a working handler', async () => {
        const tool = defineN8nTool('deploy_staging', mockClient(), {
            workflowId: 15,
            webhookPath: '/webhook/deploy',
        });
        const result = await tool.config.actions['execute']!.handler(null, { branch: 'main' });
        const content = result as { content: Array<{ text: string }> };
        expect(JSON.parse(content.content[0]!.text)).toEqual({ deployed: true });
    });
});

// ═══════════════════════════════════════════════════════════════
// createN8nConnector — Live State Sync
// ═══════════════════════════════════════════════════════════════

describe('createN8nConnector', () => {
    // We can't easily test the full async connector without a real n8n,
    // but we test the building blocks: refresh + change detection.

    it('refresh should return true when tool list changes', async () => {
        let callCount = 0;
        const { createN8nConnector } = await import('../src/createN8nConnector.js');

        // Mock fetch globally for this test
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            callCount++;
            if (url.includes('/api/v1/workflows')) {
                // First call: return workflow, second call: return empty
                const data = callCount <= 1 ? [WEBHOOK_WORKFLOW] : [];
                return new Response(JSON.stringify({ data }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return new Response('{}', { status: 200 });
        };

        try {
            const connector = await createN8nConnector({
                url: 'http://localhost:5678',
                apiKey: 'test',
            });

            expect(connector.tools()).toHaveLength(1);

            // Refresh — workflows changed (now empty)
            const changed = await connector.refresh();
            expect(changed).toBe(true);
            expect(connector.tools()).toHaveLength(0);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('refresh should return false when tool list is the same', async () => {
        const { createN8nConnector } = await import('../src/createN8nConnector.js');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return new Response(JSON.stringify({ data: [WEBHOOK_WORKFLOW] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };

        try {
            const connector = await createN8nConnector({
                url: 'http://localhost:5678',
                apiKey: 'test',
            });

            const changed = await connector.refresh();
            expect(changed).toBe(false);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('stop should clear the polling timer', async () => {
        const { createN8nConnector } = await import('../src/createN8nConnector.js');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return new Response(JSON.stringify({ data: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };

        try {
            const connector = await createN8nConnector({
                url: 'http://localhost:5678',
                apiKey: 'test',
                pollInterval: 60_000,
            });

            // Should not throw
            connector.stop();
            connector.stop(); // idempotent
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
