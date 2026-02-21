/**
 * LargeScaleScenarios.test.ts
 *
 * Simulates thousands of MCP endpoints consolidated through the grouping
 * framework, exercising tag-based selective exposure, mass registration,
 * routing, and schema validation at enterprise scale.
 *
 * Domains modeled:
 *   - Project Management (tasks, sprints, boards, labels, epics)
 *   - CRM (contacts, deals, pipelines, activities, companies)
 *   - DevOps (deployments, pipelines, artifacts, environments, monitors)
 *   - Collaboration (channels, messages, threads, reactions, files)
 *   - Analytics (dashboards, reports, metrics, exports, schedules)
 *   - Finance (invoices, payments, subscriptions, refunds, taxes)
 *   - Identity (users, roles, permissions, tokens, sessions)
 *   - Storage (buckets, objects, versions, policies, lifecycles)
 *   - Notifications (templates, channels, preferences, logs, rules)
 *   - Integrations (webhooks, connections, transforms, mappings, syncs)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder } from '../../src/framework/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success } from '../../src/framework/response.js';

// ============================================================================
// Helpers — Factory functions to generate realistic domain builders
// ============================================================================

/** Standard CRUD + 2 extra actions per entity = 7 actions each */
const CRUD_ACTIONS = ['list', 'get', 'create', 'update', 'delete', 'archive', 'export'] as const;

/** Domain definitions: each domain has multiple entities, each entity produces a grouped tool */
interface DomainDef {
    domain: string;
    tags: string[];
    entities: string[];
}

const DOMAINS: DomainDef[] = [
    {
        domain: 'project_management',
        tags: ['pm', 'core'],
        entities: ['tasks', 'sprints', 'boards', 'labels', 'epics', 'milestones', 'comments', 'attachments', 'time_entries', 'checklists'],
    },
    {
        domain: 'crm',
        tags: ['crm', 'sales'],
        entities: ['contacts', 'deals', 'pipelines', 'activities', 'companies', 'emails', 'notes', 'tags', 'segments', 'campaigns'],
    },
    {
        domain: 'devops',
        tags: ['devops', 'infra'],
        entities: ['deployments', 'ci_pipelines', 'artifacts', 'environments', 'monitors', 'alerts', 'logs', 'configs', 'secrets', 'clusters'],
    },
    {
        domain: 'collaboration',
        tags: ['collab', 'core'],
        entities: ['channels', 'messages', 'threads', 'reactions', 'files', 'mentions', 'bookmarks', 'pins', 'polls', 'events'],
    },
    {
        domain: 'analytics',
        tags: ['analytics', 'reporting'],
        entities: ['dashboards', 'reports', 'metrics', 'exports', 'schedules', 'widgets', 'filters', 'datasets', 'annotations', 'alerts'],
    },
    {
        domain: 'finance',
        tags: ['finance', 'billing'],
        entities: ['invoices', 'payments', 'subscriptions', 'refunds', 'taxes', 'credits', 'plans', 'coupons', 'receipts', 'ledger'],
    },
    {
        domain: 'identity',
        tags: ['identity', 'security'],
        entities: ['users', 'roles', 'permissions', 'tokens', 'sessions', 'groups', 'policies', 'audits', 'mfa', 'invitations'],
    },
    {
        domain: 'storage',
        tags: ['storage', 'infra'],
        entities: ['buckets', 'objects', 'versions', 'acl_policies', 'lifecycles', 'transfers', 'archives', 'quotas', 'replications', 'snapshots'],
    },
    {
        domain: 'notifications',
        tags: ['notifications', 'core'],
        entities: ['templates', 'channels', 'preferences', 'delivery_logs', 'rules', 'batches', 'schedules', 'providers', 'suppressions', 'digests'],
    },
    {
        domain: 'integrations',
        tags: ['integrations', 'core'],
        entities: ['webhooks', 'connections', 'transforms', 'mappings', 'syncs', 'oauth_apps', 'api_keys', 'rate_limits', 'event_bus', 'schemas'],
    },
];

// Total endpoints = 10 domains × 10 entities × 7 actions = 700 actions
// Consolidated into 10 domains × 10 entities = 100 grouped tools
// Each tool consolidates 7 REST-equivalent endpoints into 1 MCP tool

/**
 * Build a GroupedToolBuilder for a domain entity.
 * Uses flat mode: entity name as tool name, actions as CRUD verbs.
 */
function buildEntityTool(domain: string, entity: string, domainTags: string[]): GroupedToolBuilder {
    const builder = new GroupedToolBuilder(`${domain}_${entity}`)
        .description(`Manage ${entity} within ${domain}`)
        .tags(...domainTags, entity);

    for (const action of CRUD_ACTIONS) {
        const isWrite = ['create', 'update', 'delete', 'archive'].includes(action);
        const isRead = ['list', 'get', 'export'].includes(action);

        builder.action({
            name: action,
            description: `${action} ${entity}`,
            readOnly: isRead,
            schema: action === 'get'
                ? z.object({ id: z.string().describe(`ID of the ${entity.slice(0, -1)}`) })
                : action === 'create'
                ? z.object({ name: z.string().describe('Name for the new record') })
                : action === 'update'
                ? z.object({
                    id: z.string().describe('ID to update'),
                    data: z.string().describe('JSON payload'),
                })
                : action === 'delete' || action === 'archive'
                ? z.object({ id: z.string().describe('ID to process') })
                : action === 'export'
                ? z.object({ format: z.enum(['csv', 'json', 'xlsx']).describe('Export format') })
                : undefined, // 'list' has no extra params
            handler: async (_ctx, args) => {
                return success(`[${domain}/${entity}] ${action} executed ${JSON.stringify(args)}`);
            },
        });
    }

    return builder;
}

/**
 * Build all entity tools for a domain and return them.
 */
function buildDomainTools(def: DomainDef): GroupedToolBuilder[] {
    return def.entities.map(entity =>
        buildEntityTool(def.domain, entity, def.tags)
    );
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Large-Scale Scenarios — Mass Endpoint Registration', () => {
    const registry = new ToolRegistry();
    const allBuilders: GroupedToolBuilder[] = [];

    // Register all domains
    for (const domain of DOMAINS) {
        const builders = buildDomainTools(domain);
        allBuilders.push(...builders);
    }

    it('should register 100 grouped tools (700 consolidated endpoints)', () => {
        for (const builder of allBuilders) {
            registry.register(builder);
        }

        expect(registry.size).toBe(100); // 10 domains × 10 entities
    });

    it('should expose all 100 tool definitions via getAllTools()', () => {
        const tools = registry.getAllTools();
        expect(tools).toHaveLength(100);

        // Every tool must have a valid JSON schema with the 'action' discriminator
        for (const tool of tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
            expect(tool.inputSchema.properties).toHaveProperty('action');
        }
    });

    it('each tool should enumerate exactly 7 actions in its enum', () => {
        const tools = registry.getAllTools();
        for (const tool of tools) {
            const actionProp = tool.inputSchema.properties!['action'] as Record<string, unknown>;
            const enumValues = actionProp['enum'] as string[];
            expect(enumValues).toHaveLength(CRUD_ACTIONS.length);
            expect(enumValues).toEqual(expect.arrayContaining([...CRUD_ACTIONS]));
        }
    });

    it('should reject duplicate tool registrations', () => {
        const duplicate = buildEntityTool('project_management', 'tasks', ['pm']);
        expect(() => registry.register(duplicate)).toThrow('already registered');
    });
});

// ============================================================================
// Tag-Based Filtering at Scale
// ============================================================================

describe('Large-Scale Scenarios — Tag-Based Selective Exposure', () => {
    let registry: ToolRegistry;

    // Re-create registry for isolation
    beforeAll(() => {
        registry = new ToolRegistry();
        for (const domain of DOMAINS) {
            for (const builder of buildDomainTools(domain)) {
                registry.register(builder);
            }
        }
    });

    it('should filter by single domain tag → 10 tools', () => {
        const pmTools = registry.getTools({ tags: ['pm'] });
        expect(pmTools).toHaveLength(10);
        for (const tool of pmTools) {
            expect(tool.name).toContain('project_management');
        }
    });

    it('should filter by "core" tag → 40 tools (pm + collab + notif + integrations)', () => {
        const coreTools = registry.getTools({ tags: ['core'] });
        // pm(10) + collab(10) + notifications(10) + integrations(10) = 40
        expect(coreTools).toHaveLength(40);
    });

    it('should filter by "infra" tag → 20 tools (devops + storage)', () => {
        const infraTools = registry.getTools({ tags: ['infra'] });
        expect(infraTools).toHaveLength(20);
    });

    it('should intersect multiple tags → narrow selection', () => {
        // "core" AND "tasks" entity tag → only project_management_tasks
        const narrow = registry.getTools({ tags: ['core', 'tasks'] });
        expect(narrow).toHaveLength(1);
        expect(narrow[0].name).toBe('project_management_tasks');
    });

    it('should exclude specific tags', () => {
        // All 100 tools minus finance(10) and identity(10) = 80
        const filtered = registry.getTools({
            exclude: ['finance', 'identity'],
        });
        expect(filtered).toHaveLength(80);
        for (const tool of filtered) {
            expect(tool.name).not.toContain('finance');
            expect(tool.name).not.toContain('identity');
        }
    });

    it('should combine include + exclude tags', () => {
        // "core" tagged (40 tools) minus "notifications" (10) = 30
        const filtered = registry.getTools({
            tags: ['core'],
            exclude: ['notifications'],
        });
        expect(filtered).toHaveLength(30);
    });

    it('should return empty set for non-existent tag', () => {
        const empty = registry.getTools({ tags: ['nonexistent-tag-xyz'] });
        expect(empty).toHaveLength(0);
    });

    it('should return all tools when filter is empty', () => {
        const all = registry.getTools({});
        expect(all).toHaveLength(100);
    });

    it('should handle overlapping domain tags correctly', () => {
        // "infra" appears in both devops and storage
        const devopsOnly = registry.getTools({ tags: ['infra', 'devops'] });
        expect(devopsOnly).toHaveLength(10);
        for (const tool of devopsOnly) {
            expect(tool.name).toContain('devops');
        }
    });
});

// ============================================================================
// Routing at Scale — Dispatch to Correct Tool + Action
// ============================================================================

describe('Large-Scale Scenarios — Routing & Execution', () => {
    let registry: ToolRegistry;

    beforeAll(() => {
        registry = new ToolRegistry();
        for (const domain of DOMAINS) {
            for (const builder of buildDomainTools(domain)) {
                registry.register(builder);
            }
        }
    });

    it('should route to the correct tool and action', async () => {
        const result = await registry.routeCall(
            undefined as any,
            'crm_contacts',
            { action: 'get', id: 'contact-42' }
        );

        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('crm/contacts');
        expect(text).toContain('get');
    });

    it('should validate schema — missing required `id` on get action', async () => {
        const result = await registry.routeCall(
            undefined as any,
            'devops_deployments',
            { action: 'get' } // missing 'id'
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('id');
    });

    it('should return error for unknown tool', async () => {
        const result = await registry.routeCall(
            undefined as any,
            'nonexistent_tool',
            { action: 'list' }
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Unknown tool');
    });

    it('should return error for unknown action within valid tool', async () => {
        const result = await registry.routeCall(
            undefined as any,
            'finance_invoices',
            { action: 'teleport' }
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('teleport');
    });

    it('should successfully execute CRUD actions across different domains', async () => {
        const scenarios = [
            { tool: 'project_management_tasks', action: 'list', args: {} },
            { tool: 'crm_deals', action: 'create', args: { name: 'Big Deal' } },
            { tool: 'devops_ci_pipelines', action: 'get', args: { id: 'pipe-7' } },
            { tool: 'collaboration_messages', action: 'delete', args: { id: 'msg-99' } },
            { tool: 'analytics_reports', action: 'export', args: { format: 'csv' } },
            { tool: 'finance_payments', action: 'archive', args: { id: 'pay-123' } },
            { tool: 'identity_users', action: 'update', args: { id: 'usr-1', data: '{"name":"Alice"}' } },
            { tool: 'storage_buckets', action: 'list', args: {} },
            { tool: 'notifications_templates', action: 'get', args: { id: 'tpl-42' } },
            { tool: 'integrations_webhooks', action: 'create', args: { name: 'My Hook' } },
        ];

        for (const { tool, action, args } of scenarios) {
            const result = await registry.routeCall(
                undefined as any,
                tool,
                { action, ...args }
            );
            expect(result.isError).toBeUndefined();
        }
    });
});

// ============================================================================
// Stress Test — Programmatic Generation of N Builders
// ============================================================================

describe('Large-Scale Scenarios — Stress: 500 Grouped Tools', () => {
    it('should register and query 500 builders (3500 endpoints) efficiently', () => {
        const stressRegistry = new ToolRegistry();

        // Generate 50 synthetic domains × 10 entities each = 500 tools
        for (let d = 0; d < 50; d++) {
            const domainName = `domain_${String(d).padStart(3, '0')}`;
            const domainTag = d < 25 ? 'tier_a' : 'tier_b';

            for (let e = 0; e < 10; e++) {
                const entityName = `entity_${String(e).padStart(2, '0')}`;
                const builder = buildEntityTool(domainName, entityName, [domainTag, `d${d}`]);
                stressRegistry.register(builder);
            }
        }

        expect(stressRegistry.size).toBe(500);

        // All tools
        const all = stressRegistry.getAllTools();
        expect(all).toHaveLength(500);

        // Tag filtering — tier_a has first 25 domains × 10 entities = 250
        const tierA = stressRegistry.getTools({ tags: ['tier_a'] });
        expect(tierA).toHaveLength(250);

        const tierB = stressRegistry.getTools({ tags: ['tier_b'] });
        expect(tierB).toHaveLength(250);

        // Single-domain filter
        const d7 = stressRegistry.getTools({ tags: ['d7'] });
        expect(d7).toHaveLength(10);

        // Exclude tier_b → only tier_a remains
        const noTierB = stressRegistry.getTools({ exclude: ['tier_b'] });
        expect(noTierB).toHaveLength(250);
    });
});

// ============================================================================
// Schema Introspection — Verify Generated Descriptions at Scale
// ============================================================================

describe('Large-Scale Scenarios — Schema Introspection', () => {
    it('should generate meaningful descriptions for every tool', () => {
        const registry = new ToolRegistry();
        for (const domain of DOMAINS) {
            for (const builder of buildDomainTools(domain)) {
                registry.register(builder);
            }
        }

        const tools = registry.getAllTools();
        for (const tool of tools) {
            // Description must mention the entity and domain
            expect(tool.description).toBeTruthy();
            expect(tool.description!.length).toBeGreaterThan(10);
        }
    });

    it('should include workflow lines listing all CRUD actions', () => {
        const builder = buildEntityTool('test', 'widgets', ['test']);
        const def = builder.buildToolDefinition();

        // Description should list all 7 action capabilities
        for (const action of CRUD_ACTIONS) {
            expect(def.description).toContain(action);
        }
    });

    it('should correctly aggregate readOnlyHint across mixed actions', () => {
        const builder = buildEntityTool('test', 'samples', ['test']);
        const def = builder.buildToolDefinition();

        // Since this tool has both read and write actions,
        // readOnlyHint must be false (not all actions are read-only)
        expect(def.annotations?.readOnlyHint).toBe(false);
    });

    it('should produce unique tool names across all domains', () => {
        const registry = new ToolRegistry();
        for (const domain of DOMAINS) {
            for (const builder of buildDomainTools(domain)) {
                registry.register(builder);
            }
        }

        const names = registry.getAllTools().map(t => t.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
    });
});

// ============================================================================
// Grouped Mode at Scale — Hierarchical Actions
// ============================================================================

describe('Large-Scale Scenarios — Grouped Mode Hierarchical', () => {
    it('should support grouped tools with multiple subgroups', () => {
        const builder = new GroupedToolBuilder('enterprise_api')
            .description('Full enterprise API surface')
            .tags('enterprise', 'all')
            .group('users', 'User management', g => g
                .action({ name: 'list', handler: async () => success('users listed') })
                .action({ name: 'create', handler: async () => success('user created') })
                .action({ name: 'delete', handler: async () => success('user deleted') })
            )
            .group('projects', 'Project management', g => g
                .action({ name: 'list', handler: async () => success('projects listed') })
                .action({ name: 'create', handler: async () => success('project created') })
                .action({ name: 'archive', handler: async () => success('project archived') })
            )
            .group('billing', 'Billing operations', g => g
                .action({ name: 'invoices', handler: async () => success('invoices listed') })
                .action({ name: 'payments', handler: async () => success('payments listed') })
            );

        const def = builder.buildToolDefinition();

        // Should produce compound action enum: users.list, users.create, etc.
        const actionProp = def.inputSchema.properties!['action'] as Record<string, unknown>;
        const enumValues = actionProp['enum'] as string[];

        expect(enumValues).toContain('users.list');
        expect(enumValues).toContain('users.create');
        expect(enumValues).toContain('users.delete');
        expect(enumValues).toContain('projects.list');
        expect(enumValues).toContain('projects.create');
        expect(enumValues).toContain('projects.archive');
        expect(enumValues).toContain('billing.invoices');
        expect(enumValues).toContain('billing.payments');
        expect(enumValues).toHaveLength(8);
    });

    it('should correctly route grouped hierarchical actions', async () => {
        const builder = new GroupedToolBuilder('enterprise_api')
            .description('API')
            .group('users', 'Users', g => g
                .action({
                    name: 'get',
                    schema: z.object({ id: z.string() }),
                    handler: async (_ctx, args) => success(`user ${args.id}`),
                })
            )
            .group('billing', 'Billing', g => g
                .action({
                    name: 'charge',
                    schema: z.object({ amount: z.number() }),
                    handler: async (_ctx, args) => success(`charged ${args.amount}`),
                })
            );

        builder.buildToolDefinition();

        const userResult = await builder.execute(undefined as any, {
            action: 'users.get',
            id: 'usr-42',
        });
        expect(userResult.isError).toBeUndefined();
        expect((userResult.content[0] as { text: string }).text).toContain('user usr-42');

        const billingResult = await builder.execute(undefined as any, {
            action: 'billing.charge',
            amount: 99.99,
        });
        expect(billingResult.isError).toBeUndefined();
        expect((billingResult.content[0] as { text: string }).text).toContain('charged 99.99');
    });
});

// ============================================================================
// Edge Cases in Large Registries
// ============================================================================

describe('Large-Scale Scenarios — Edge Cases', () => {
    it('should handle registry clear and re-registration', () => {
        const registry = new ToolRegistry();

        // Register some tools
        for (const builder of buildDomainTools(DOMAINS[0])) {
            registry.register(builder);
        }
        expect(registry.size).toBe(10);

        // Clear
        registry.clear();
        expect(registry.size).toBe(0);
        expect(registry.getAllTools()).toHaveLength(0);

        // Re-register (same names should work after clear)
        for (const builder of buildDomainTools(DOMAINS[0])) {
            registry.register(builder);
        }
        expect(registry.size).toBe(10);
    });

    it('should report has() correctly for all registered tools', () => {
        const registry = new ToolRegistry();
        for (const builder of buildDomainTools(DOMAINS[1])) {
            registry.register(builder);
        }

        expect(registry.has('crm_contacts')).toBe(true);
        expect(registry.has('crm_deals')).toBe(true);
        expect(registry.has('nonexistent_tool')).toBe(false);
    });

    it('should exclude all tools when exclude tag matches all', () => {
        const registry = new ToolRegistry();
        // Register only PM tools (tagged 'pm', 'core')
        for (const builder of buildDomainTools(DOMAINS[0])) {
            registry.register(builder);
        }

        const filtered = registry.getTools({ exclude: ['pm'] });
        expect(filtered).toHaveLength(0);
    });

    it('should handle empty registry gracefully', () => {
        const registry = new ToolRegistry();
        expect(registry.getAllTools()).toHaveLength(0);
        expect(registry.getTools({ tags: ['any'] })).toHaveLength(0);
        expect(registry.size).toBe(0);
    });
});

// ============================================================================
// ENTERPRISE CHAOS SCENARIOS
// These simulate real-world abuse patterns: LLMs sending garbage, malformed
// schemas, injection attempts, handler explosions, race-like registration,
// unicode madness, and middleware chains under pressure.
// ============================================================================

// ── Chaos 1: LLM Sends Garbage ─────────────────────────────────────────────
// Real scenario: LLM hallucinates action names, sends wrong types, injects
// extra fields, omits required params, or sends completely empty payloads.
describe('Enterprise Chaos — LLM Garbage Input', () => {
    let registry: ToolRegistry;

    beforeAll(() => {
        registry = new ToolRegistry();
        const builder = new GroupedToolBuilder('ticket_system')
            .description('Manage support tickets')
            .tags('support')
            .commonSchema(z.object({
                workspace_id: z.string().describe('Workspace identifier'),
            }))
            .action({
                name: 'create',
                description: 'Create a new ticket',
                schema: z.object({
                    title: z.string().min(1).max(500),
                    priority: z.enum(['low', 'medium', 'high', 'critical']),
                    description: z.string().optional(),
                }),
                handler: async (_ctx, args) => success(`ticket created: ${args.title}`),
            })
            .action({
                name: 'list',
                description: 'List tickets',
                readOnly: true,
                handler: async (_ctx, args) => success(`listed for ${args.workspace_id}`),
            })
            .action({
                name: 'close',
                description: 'Close a ticket',
                schema: z.object({
                    ticket_id: z.string(),
                    resolution: z.string().min(10),
                }),
                handler: async (_ctx, args) => success(`closed ${args.ticket_id}`),
            });

        registry.register(builder);
    });

    it('should reject completely empty payload', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {});
        expect(result.isError).toBe(true);
    });

    it('should reject payload with no action field', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            workspace_id: 'ws-1',
            title: 'Bug report',
        });
        expect(result.isError).toBe(true);
    });

    it('should reject hallucinated action name', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            action: 'reopen_and_escalate_to_manager',
            workspace_id: 'ws-1',
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('reopen_and_escalate_to_manager');
    });

    it('should reject wrong types — number instead of string for workspace_id', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            action: 'create',
            workspace_id: 12345, // should be string
            title: 'Test',
            priority: 'high',
        });
        expect(result.isError).toBe(true);
    });

    it('should reject invalid enum value for priority', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            action: 'create',
            workspace_id: 'ws-1',
            title: 'Test',
            priority: 'ULTRA_MEGA_CRITICAL', // not in enum
        });
        expect(result.isError).toBe(true);
    });

    it('should strip unknown fields (LLM adds extra hallucinated params)', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            action: 'list',
            workspace_id: 'ws-1',
            hallucinated_filter: 'open',
            sort_by_moon_phase: true,
            __internal_admin_override: true,
        });
        // Should succeed — extra fields are stripped by .strip()
        expect(result.isError).toBeUndefined();
    });

    it('should reject too-short resolution on close', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            action: 'close',
            workspace_id: 'ws-1',
            ticket_id: 'TKT-42',
            resolution: 'done', // too short, min 10
        });
        expect(result.isError).toBe(true);
    });

    it('should reject empty string title', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            action: 'create',
            workspace_id: 'ws-1',
            title: '', // min 1 char
            priority: 'low',
        });
        expect(result.isError).toBe(true);
    });

    it('should accept valid input after multiple failures', async () => {
        const result = await registry.routeCall(undefined as any, 'ticket_system', {
            action: 'create',
            workspace_id: 'ws-1',
            title: 'Login page returns 500 after OAuth redirect',
            priority: 'critical',
            description: 'Steps to reproduce: ...',
        });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Login page');
    });
});

// ── Chaos 2: Handler Explosions ─────────────────────────────────────────────
// Real scenario: handlers throw sync errors, async rejections, return
// undefined, throw non-Error objects, or timeout.
describe('Enterprise Chaos — Handler Explosions', () => {
    it('should catch sync throw in handler', async () => {
        const builder = new GroupedToolBuilder('exploding_service')
            .action({
                name: 'boom',
                handler: () => { throw new Error('DATABASE_CONNECTION_REFUSED'); },
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'boom' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('DATABASE_CONNECTION_REFUSED');
    });

    it('should catch async rejection in handler', async () => {
        const builder = new GroupedToolBuilder('async_fail')
            .action({
                name: 'fetch',
                handler: async () => { throw new Error('ECONNRESET: connection reset by peer'); },
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'fetch' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('ECONNRESET');
    });

    it('should handle throwing a string (non-Error throw)', async () => {
        const builder = new GroupedToolBuilder('string_throw')
            .action({
                name: 'fail',
                handler: async () => { throw 'RATE_LIMIT_EXCEEDED'; },
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'fail' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toBe('[string_throw/fail] RATE_LIMIT_EXCEEDED');
    });

    it('should handle throwing an object (non-Error throw)', async () => {
        const builder = new GroupedToolBuilder('object_throw')
            .action({
                name: 'process',
                handler: async () => { throw { code: 503, message: 'Service Unavailable' }; },
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'process' });
        expect(result.isError).toBe(true);
    });

    it('should handle throwing null', async () => {
        const builder = new GroupedToolBuilder('null_throw')
            .action({
                name: 'crash',
                handler: async () => { throw null; },
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'crash' });
        expect(result.isError).toBe(true);
    });

    it('should handle throwing undefined', async () => {
        const builder = new GroupedToolBuilder('undef_throw')
            .action({
                name: 'ghost',
                handler: async () => { throw undefined; },
            });
        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'ghost' });
        expect(result.isError).toBe(true);
    });
});

// ── Chaos 3: Deeply Nested Schemas ──────────────────────────────────────────
// Real scenario: enterprise APIs have deeply nested config objects,
// arrays of objects, optional nested blocks, etc.
describe('Enterprise Chaos — Complex Nested Schemas', () => {
    it('should validate deeply nested config objects', async () => {
        const builder = new GroupedToolBuilder('deployment_manager')
            .action({
                name: 'deploy',
                schema: z.object({
                    environment: z.enum(['staging', 'production']),
                    config: z.object({
                        replicas: z.number().int().min(1).max(100),
                        resources: z.object({
                            cpu: z.string().regex(/^\d+m$/),
                            memory: z.string().regex(/^\d+Mi$/),
                        }),
                        env_vars: z.array(z.object({
                            name: z.string(),
                            value: z.string(),
                        })).optional(),
                    }),
                    rollback_on_failure: z.boolean().default(true),
                }),
                handler: async (_ctx, args) =>
                    success(`deploying to ${args.environment} with ${(args.config as any).replicas} replicas`),
            });

        builder.buildToolDefinition();

        // Valid complex nested input
        const result = await builder.execute(undefined as any, {
            action: 'deploy',
            environment: 'staging',
            config: {
                replicas: 3,
                resources: { cpu: '500m', memory: '256Mi' },
                env_vars: [
                    { name: 'NODE_ENV', value: 'staging' },
                    { name: 'LOG_LEVEL', value: 'debug' },
                ],
            },
        });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('3 replicas');
    });

    it('should reject invalid nested resource format', async () => {
        const builder = new GroupedToolBuilder('deploy_v2')
            .action({
                name: 'deploy',
                schema: z.object({
                    config: z.object({
                        resources: z.object({
                            cpu: z.string().regex(/^\d+m$/),
                        }),
                    }),
                }),
                handler: async () => success('ok'),
            });

        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'deploy',
            config: {
                resources: { cpu: '500cores' }, // wrong format
            },
        });
        expect(result.isError).toBe(true);
    });

    it('should handle optional nested blocks as absent', async () => {
        const builder = new GroupedToolBuilder('pipeline_config')
            .action({
                name: 'run',
                schema: z.object({
                    pipeline: z.string(),
                    hooks: z.object({
                        before: z.string().optional(),
                        after: z.string().optional(),
                    }).optional(),
                }),
                handler: async (_ctx, args) => success(`running ${args.pipeline}`),
            });

        builder.buildToolDefinition();

        // No hooks at all — should work
        const result = await builder.execute(undefined as any, {
            action: 'run',
            pipeline: 'ci-main',
        });
        expect(result.isError).toBeUndefined();
    });
});

// ── Chaos 4: Unicode & i18n ─────────────────────────────────────────────────
// Real scenario: international teams use unicode in names, descriptions,
// and field values. Emoji in identifiers. Multi-byte characters everywhere.
describe('Enterprise Chaos — Unicode & i18n', () => {
    it('should handle unicode in tool descriptions and action values', async () => {
        const builder = new GroupedToolBuilder('intl_service')
            .description('Serviço de gerenciamento internacional 🌍')
            .action({
                name: 'create',
                description: 'Criar novo registro — inclui suporte a múltiplos idiomas',
                schema: z.object({
                    nome: z.string().describe('Nome do registro em qualquer idioma'),
                    descrição: z.string().optional().describe('Descrição detalhada'),
                }),
                handler: async (_ctx, args) => success(`criado: ${args.nome}`),
            })
            .action({
                name: 'search',
                description: '検索 — 日本語対応',
                schema: z.object({
                    query: z.string(),
                }),
                handler: async (_ctx, args) => success(`results for: ${args.query}`),
            });

        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'create',
            nome: '项目管理工具 🚀',
            descrição: 'Описание на русском языке с эмодзи 💼',
        });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('项目管理工具');
    });

    it('should handle emoji and special chars in search queries', async () => {
        const builder = new GroupedToolBuilder('emoji_search')
            .action({
                name: 'find',
                schema: z.object({
                    q: z.string(),
                }),
                handler: async (_ctx, args) => success(`found: ${args.q}`),
            });

        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, {
            action: 'find',
            q: '🎯 café résumé naïve über straße 日本語テスト',
        });
        expect(result.isError).toBeUndefined();
    });
});

// ── Chaos 5: Middleware Under Pressure ──────────────────────────────────────
// Real scenario: multiple middleware layers processing security, logging,
// rate limiting, audit trails. Middleware can short-circuit, modify context,
// or throw.
describe('Enterprise Chaos — Middleware Chains Under Pressure', () => {
    it('should execute middleware chain in order with audit trail', async () => {
        const auditLog: string[] = [];

        const builder = new GroupedToolBuilder<{ userId: string }>('audit_service')
            .use(async (ctx, args, next) => {
                auditLog.push(`auth:${ctx.userId}`);
                return next();
            })
            .use(async (_ctx, args, next) => {
                auditLog.push(`validate:${args.action}`);
                return next();
            })
            .use(async (_ctx, _args, next) => {
                auditLog.push('rate_limit:pass');
                return next();
            })
            .action({
                name: 'sensitive_operation',
                handler: async (ctx) => {
                    auditLog.push(`execute:${ctx.userId}`);
                    return success('done');
                },
            });

        builder.buildToolDefinition();

        const result = await builder.execute(
            { userId: 'admin-42' },
            { action: 'sensitive_operation' }
        );

        expect(result.isError).toBeUndefined();
        expect(auditLog).toEqual([
            'auth:admin-42',
            'validate:sensitive_operation',
            'rate_limit:pass',
            'execute:admin-42',
        ]);
    });

    it('should short-circuit middleware when unauthorized', async () => {
        const builder = new GroupedToolBuilder<{ role: string }>('admin_only')
            .use(async (ctx, _args, next) => {
                if (ctx.role !== 'admin') {
                    return { isError: true as const, content: [{ type: 'text' as const, text: 'FORBIDDEN: admin role required' }] };
                }
                return next();
            })
            .action({
                name: 'nuke_database',
                description: 'Delete everything',
                handler: async () => success('kaboom 💥'),
            });

        builder.buildToolDefinition();

        // Non-admin should be blocked
        const blocked = await builder.execute(
            { role: 'viewer' },
            { action: 'nuke_database' }
        );
        expect(blocked.isError).toBe(true);
        expect((blocked.content[0] as { text: string }).text).toContain('FORBIDDEN');

        // Admin should pass
        const allowed = await builder.execute(
            { role: 'admin' },
            { action: 'nuke_database' }
        );
        expect(allowed.isError).toBeUndefined();
    });

    it('should handle middleware that throws', async () => {
        const builder = new GroupedToolBuilder('mw_crash')
            .use(async () => {
                throw new Error('MIDDLEWARE_PANIC: certificate expired');
            })
            .action({
                name: 'any',
                handler: async () => success('unreachable'),
            });

        builder.buildToolDefinition();

        const result = await builder.execute(undefined as any, { action: 'any' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('certificate expired');
    });
});

// ── Chaos 6: Multi-Tenant Context Routing ───────────────────────────────────
// Real scenario: SaaS multi-tenant system where context carries tenant info
// and different tenants have different configurations.
describe('Enterprise Chaos — Multi-Tenant Context', () => {
    interface TenantContext {
        tenantId: string;
        plan: 'free' | 'pro' | 'enterprise';
        region: string;
    }

    it('should route based on tenant context with plan enforcement', async () => {
        const builder = new GroupedToolBuilder<TenantContext>('billing_api')
            .use(async (ctx, _args, next) => {
                // Free plan can only list, not create
                if (ctx.plan === 'free' && _args.action !== 'list') {
                    return {
                        isError: true as const,
                        content: [{ type: 'text' as const, text: `UPGRADE_REQUIRED: ${_args.action} is not available on free plan` }],
                    };
                }
                return next();
            })
            .commonSchema(z.object({
                currency: z.enum(['USD', 'EUR', 'BRL']).default('USD'),
            }))
            .action({
                name: 'list',
                readOnly: true,
                handler: async (ctx) =>
                    success(`${ctx.tenantId}@${ctx.region}: invoices listed`),
            })
            .action({
                name: 'create',
                schema: z.object({
                    amount: z.number().positive(),
                    customer_email: z.string().email(),
                }),
                handler: async (ctx, args) =>
                    success(`${ctx.tenantId}: invoice $${args.amount} for ${args.customer_email}`),
            });

        builder.buildToolDefinition();

        // Free tenant can list
        const freeList = await builder.execute(
            { tenantId: 'acme', plan: 'free', region: 'us-east-1' },
            { action: 'list', currency: 'USD' }
        );
        expect(freeList.isError).toBeUndefined();

        // Free tenant cannot create
        const freeCreate = await builder.execute(
            { tenantId: 'acme', plan: 'free', region: 'us-east-1' },
            { action: 'create', currency: 'BRL', amount: 100, customer_email: 'test@example.com' }
        );
        expect(freeCreate.isError).toBe(true);
        expect((freeCreate.content[0] as { text: string }).text).toContain('UPGRADE_REQUIRED');

        // Enterprise tenant can create
        const entCreate = await builder.execute(
            { tenantId: 'megacorp', plan: 'enterprise', region: 'eu-west-1' },
            { action: 'create', currency: 'EUR', amount: 50000, customer_email: 'cfo@megacorp.com' }
        );
        expect(entCreate.isError).toBeUndefined();
        expect((entCreate.content[0] as { text: string }).text).toContain('megacorp');
    });
});

// ── Chaos 7: Rapid Re-registration & Hot Reload ────────────────────────────
// Real scenario: microservice hot-reloads during deployment, tools
// get cleared and re-registered rapidly. Tests state integrity.
describe('Enterprise Chaos — Hot Reload & Re-registration', () => {
    it('should survive 100 clear+re-register cycles', () => {
        const registry = new ToolRegistry();

        for (let cycle = 0; cycle < 100; cycle++) {
            registry.clear();
            expect(registry.size).toBe(0);

            const builder = new GroupedToolBuilder(`service_v${cycle}`)
                .tags('versioned')
                .action({
                    name: 'health',
                    handler: async () => success(`v${cycle} healthy`),
                });

            registry.register(builder);
            expect(registry.size).toBe(1);
            expect(registry.has(`service_v${cycle}`)).toBe(true);
        }

        // Final state should have only the last version
        expect(registry.size).toBe(1);
        expect(registry.has('service_v99')).toBe(true);
    });

    it('should maintain tag filtering correctness across multiple registrations', () => {
        const registry = new ToolRegistry();

        // Simulate microservices registering one by one
        const services = [
            { name: 'auth_service', tags: ['auth', 'critical'] },
            { name: 'user_service', tags: ['users', 'critical'] },
            { name: 'payment_service', tags: ['payments', 'pci'] },
            { name: 'notification_service', tags: ['notifications'] },
            { name: 'analytics_service', tags: ['analytics'] },
            { name: 'search_service', tags: ['search', 'critical'] },
        ];

        for (const svc of services) {
            const builder = new GroupedToolBuilder(svc.name)
                .tags(...svc.tags)
                .action({ name: 'status', handler: async () => success(`${svc.name} ok`) });
            registry.register(builder);
        }

        expect(registry.size).toBe(6);

        // Critical services
        const critical = registry.getTools({ tags: ['critical'] });
        expect(critical).toHaveLength(3);

        // PCI scope
        const pci = registry.getTools({ tags: ['pci'] });
        expect(pci).toHaveLength(1);
        expect(pci[0].name).toBe('payment_service');

        // Exclude analytics and search
        const core = registry.getTools({ exclude: ['analytics', 'search'] });
        expect(core).toHaveLength(4);
    });
});

// ── Chaos 8: Schema Accumulation & Cross-Action Field Conflicts ─────────────
// Real scenario: different actions define the same field name with
// different types or constraints. The framework must handle this correctly.
describe('Enterprise Chaos — Schema Field Conflicts', () => {
    it('should merge commonSchema + actionSchema correctly', async () => {
        const builder = new GroupedToolBuilder('data_pipeline')
            .commonSchema(z.object({
                pipeline_id: z.string().uuid(),
                dry_run: z.boolean().default(false),
            }))
            .action({
                name: 'trigger',
                schema: z.object({
                    source: z.enum(['s3', 'gcs', 'azure_blob']),
                    partition_key: z.string().optional(),
                }),
                handler: async (_ctx, args: Record<string, unknown>) =>
                    success(`triggered ${args.pipeline_id} from ${args.source}`),
            })
            .action({
                name: 'status',
                readOnly: true,
                handler: async (_ctx, args: Record<string, unknown>) =>
                    success(`pipeline ${args.pipeline_id} status: running`),
            });

        builder.buildToolDefinition();

        // Trigger with all fields
        const triggerResult = await builder.execute(undefined as any, {
            action: 'trigger',
            pipeline_id: '550e8400-e29b-41d4-a716-446655440000',
            source: 's3',
            partition_key: '2024-01-15',
        });
        expect(triggerResult.isError).toBeUndefined();

        // Status with only common fields
        const statusResult = await builder.execute(undefined as any, {
            action: 'status',
            pipeline_id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(statusResult.isError).toBeUndefined();

        // Trigger with invalid UUID
        const badUuid = await builder.execute(undefined as any, {
            action: 'trigger',
            pipeline_id: 'not-a-uuid',
            source: 's3',
        });
        expect(badUuid.isError).toBe(true);

        // Trigger with invalid source enum
        const badSource = await builder.execute(undefined as any, {
            action: 'trigger',
            pipeline_id: '550e8400-e29b-41d4-a716-446655440000',
            source: 'local_disk',
        });
        expect(badSource.isError).toBe(true);
    });
});
