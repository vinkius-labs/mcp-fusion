/**
 * Introspection — Dynamic Manifest & RBAC Filtering Tests
 *
 * Tests for the introspection system:
 *   - ManifestCompiler (payload structure, action/presenter metadata)
 *   - Presenter introspection accessors (getSchemaKeys, getUiBlockTypes, hasContextualRules)
 *   - RBAC manifest filtering (cloneManifest + filter callback)
 *   - ToolRegistry.getBuilders() integration
 *   - IntrospectionConfig defaults
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/core/builder/index.js';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { ui } from '../../src/presenter/ui.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { compileManifest, cloneManifest } from '../../src/introspection/ManifestCompiler.js';
import type {
    ManifestPayload,
    IntrospectionConfig,
} from '../../src/introspection/types.js';

// ── Test Fixtures ────────────────────────────────────────

const InvoicePresenter = createPresenter<{ id: string; total: number; client: string }>('Invoice')
    .schema(z.object({
        id: z.string(),
        total: z.number(),
        client: z.string(),
    }))
    .uiBlocks((item) => [
        ui.summary(`Invoice ${item.id}: $${item.total}`),
    ])
    .systemRules([
        'Always show the invoice total prominently.',
    ]);

const DynamicPresenter = createPresenter<{ name: string }>('DynamicReport')
    .schema(z.object({ name: z.string() }))
    .systemRules((data, ctx) => [
        `Report for ${data.name}`,
    ]);

function buildTestRegistry() {
    const registry = new ToolRegistry<{ role: string }>();

    const projectsTool = createTool<{ role: string }>('projects')
        .description('Manage projects')
        .tags('core', 'projects')
        .discriminator('action')
        .action({
            name: 'list',
            description: 'List all projects',
            schema: z.object({
                status: z.enum(['active', 'archived']).optional(),
            }),
            readOnly: true,
            handler: async () => ({ content: [{ type: 'text' as const, text: '[]' }] }),
        })
        .action({
            name: 'create',
            description: 'Create a new project',
            schema: z.object({
                name: z.string().describe('Project name'),
            }),
            destructive: false,
            handler: async () => ({ content: [{ type: 'text' as const, text: '{}' }] }),
        });

    const invoicesTool = createTool<{ role: string }>('invoices')
        .description('Invoice management')
        .tags('billing', 'invoices')
        .discriminator('action')
        .action({
            name: 'get',
            description: 'Get invoice by ID',
            schema: z.object({ id: z.string() }),
            readOnly: true,
            returns: InvoicePresenter,
            handler: async () => ({ id: '1', total: 100, client: 'Acme' }),
        });

    const adminTool = createTool<{ role: string }>('admin')
        .description('Administration tools')
        .tags('admin', 'internal')
        .discriminator('action')
        .action({
            name: 'delete_user',
            description: 'Delete a user permanently',
            schema: z.object({ user_id: z.string() }),
            destructive: true,
            handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
        });

    registry.registerAll(projectsTool, invoicesTool, adminTool);
    return registry;
}

// ── ManifestCompiler ─────────────────────────────────────

describe('ManifestCompiler', () => {
    it('should compile a complete manifest payload from builders', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        expect(manifest.server).toBe('test-server');
        expect(manifest.mcp_fusion_version).toBe('1.1.0');
        expect(manifest.architecture).toBe('MVA (Model-View-Agent)');
        expect(manifest.capabilities).toBeDefined();
    });

    it('should include all registered tools in the manifest', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const toolNames = Object.keys(manifest.capabilities.tools);
        expect(toolNames).toContain('projects');
        expect(toolNames).toContain('invoices');
        expect(toolNames).toContain('admin');
        expect(toolNames).toHaveLength(3);
    });

    it('should include tool description and tags', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const projects = manifest.capabilities.tools['projects'];
        expect(projects.description).toContain('projects');
        expect(projects.tags).toContain('core');
        expect(projects.tags).toContain('projects');
    });

    it('should include action metadata with correct flags', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const projectActions = manifest.capabilities.tools['projects'].actions;

        // list action
        const listAction = projectActions['list'];
        expect(listAction.description).toBe('List all projects');
        expect(listAction.readOnly).toBe(true);
        expect(listAction.destructive).toBe(false);

        // create action
        const createAction = projectActions['create'];
        expect(createAction.description).toBe('Create a new project');
        expect(createAction.destructive).toBe(false);
    });

    it('should include destructive flag on admin.delete_user', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const deleteAction = manifest.capabilities.tools['admin'].actions['delete_user'];
        expect(deleteAction.destructive).toBe(true);
    });

    it('should include input_schema (JSON Schema) for each tool', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const projectsSchema = manifest.capabilities.tools['projects'].input_schema;
        expect(projectsSchema).toBeDefined();
        expect((projectsSchema as { type: string }).type).toBe('object');
        expect((projectsSchema as { properties: Record<string, unknown> }).properties).toHaveProperty('action');
    });

    it('should populate presenter name for actions using MVA pattern', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const getAction = manifest.capabilities.tools['invoices'].actions['get'];
        expect(getAction.returns_presenter).toBe('Invoice');
    });

    it('should collect unique presenters in the manifest', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const presenterNames = Object.keys(manifest.capabilities.presenters);
        expect(presenterNames).toContain('Invoice');
        expect(presenterNames).toHaveLength(1);
    });

    it('should include presenter schema keys', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const invoicePresenter = manifest.capabilities.presenters['Invoice'];
        expect(invoicePresenter.schema_keys).toContain('id');
        expect(invoicePresenter.schema_keys).toContain('total');
        expect(invoicePresenter.schema_keys).toContain('client');
    });

    it('should include presenter UI block types', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const invoicePresenter = manifest.capabilities.presenters['Invoice'];
        expect(invoicePresenter.ui_blocks_supported).toContain('item');
    });

    it('should detect static vs contextual rules', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test-server', registry.getBuilders());

        const invoicePresenter = manifest.capabilities.presenters['Invoice'];
        // Invoice uses static rules (string array)
        expect(invoicePresenter.has_contextual_rules).toBe(false);
    });

    it('should handle empty registry', () => {
        const emptyRegistry = new ToolRegistry<void>();
        const manifest = compileManifest('empty-server', emptyRegistry.getBuilders());

        expect(manifest.server).toBe('empty-server');
        expect(Object.keys(manifest.capabilities.tools)).toHaveLength(0);
        expect(Object.keys(manifest.capabilities.presenters)).toHaveLength(0);
    });
});

// ── Presenter Introspection Accessors ────────────────────

describe('Presenter Introspection Accessors', () => {
    it('getSchemaKeys returns schema field names', () => {
        expect(InvoicePresenter.getSchemaKeys()).toEqual(['id', 'total', 'client']);
    });

    it('getSchemaKeys returns empty array when no schema', () => {
        const noSchema = createPresenter('NoSchema');
        expect(noSchema.getSchemaKeys()).toEqual([]);
    });

    it('getUiBlockTypes detects item blocks', () => {
        expect(InvoicePresenter.getUiBlockTypes()).toContain('item');
    });

    it('getUiBlockTypes returns empty when no blocks configured', () => {
        const noBlocks = createPresenter('NoBlocks');
        expect(noBlocks.getUiBlockTypes()).toEqual([]);
    });

    it('hasContextualRules returns false for static rules', () => {
        expect(InvoicePresenter.hasContextualRules()).toBe(false);
    });

    it('hasContextualRules returns true for function rules', () => {
        expect(DynamicPresenter.hasContextualRules()).toBe(true);
    });

    it('introspection accessors do NOT seal the Presenter', () => {
        const presenter = createPresenter<{ x: number }>('Unsealed')
            .schema(z.object({ x: z.number() }));

        // Call introspection accessors
        presenter.getSchemaKeys();
        presenter.getUiBlockTypes();
        presenter.hasContextualRules();

        // Should still be configurable (not sealed)
        expect(() => {
            presenter.uiBlocks((item) => [ui.json(item)]);
        }).not.toThrow();
    });
});

// ── cloneManifest ────────────────────────────────────────

describe('cloneManifest', () => {
    it('should produce a deep-equal but independent copy', () => {
        const registry = buildTestRegistry();
        const original = compileManifest('test', registry.getBuilders());
        const cloned = cloneManifest(original);

        expect(cloned).toEqual(original);

        // Mutate clone and verify original is untouched
        delete cloned.capabilities.tools['admin'];
        expect(original.capabilities.tools['admin']).toBeDefined();
    });

    it('should handle empty capabilities', () => {
        const manifest: ManifestPayload = {
            server: 'test',
            mcp_fusion_version: '1.1.0',
            architecture: 'MVA (Model-View-Agent)',
            capabilities: { tools: {}, presenters: {} },
        };
        const cloned = cloneManifest(manifest);
        expect(cloned).toEqual(manifest);
    });
});

// ── RBAC Filtering ───────────────────────────────────────

describe('RBAC Manifest Filtering', () => {
    it('should allow hiding tools from non-admin users', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test', registry.getBuilders());

        const filter = (m: ManifestPayload, ctx: { role: string }) => {
            if (ctx.role !== 'admin') {
                delete m.capabilities.tools['admin'];
            }
            return m;
        };

        const adminManifest = filter(cloneManifest(manifest), { role: 'admin' });
        expect(adminManifest.capabilities.tools['admin']).toBeDefined();

        const userManifest = filter(cloneManifest(manifest), { role: 'viewer' });
        expect(userManifest.capabilities.tools['admin']).toBeUndefined();
    });

    it('should allow hiding specific actions within a tool', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test', registry.getBuilders());

        const filter = (m: ManifestPayload, ctx: { role: string }) => {
            if (ctx.role === 'readonly') {
                for (const tool of Object.values(m.capabilities.tools)) {
                    for (const [key, action] of Object.entries(tool.actions)) {
                        if (action.destructive) {
                            delete tool.actions[key];
                        }
                    }
                }
            }
            return m;
        };

        const filtered = filter(cloneManifest(manifest), { role: 'readonly' });
        expect(filtered.capabilities.tools['admin'].actions['delete_user']).toBeUndefined();
    });

    it('should allow hiding presenters from restricted users', () => {
        const registry = buildTestRegistry();
        const manifest = compileManifest('test', registry.getBuilders());

        const filter = (m: ManifestPayload, ctx: { role: string }) => {
            if (ctx.role !== 'billing') {
                delete m.capabilities.presenters['Invoice'];
            }
            return m;
        };

        const billingManifest = filter(cloneManifest(manifest), { role: 'billing' });
        expect(billingManifest.capabilities.presenters['Invoice']).toBeDefined();

        const devManifest = filter(cloneManifest(manifest), { role: 'developer' });
        expect(devManifest.capabilities.presenters['Invoice']).toBeUndefined();
    });

    it('filter receives a CLONE — original manifest is untouched', () => {
        const registry = buildTestRegistry();
        const original = compileManifest('test', registry.getBuilders());

        const filter = (m: ManifestPayload) => {
            // Destructively remove everything
            m.capabilities.tools = {};
            m.capabilities.presenters = {};
            return m;
        };

        filter(cloneManifest(original));

        // Original should be intact
        expect(Object.keys(original.capabilities.tools).length).toBeGreaterThan(0);
    });
});

// ── ToolRegistry.getBuilders() ───────────────────────────

describe('ToolRegistry.getBuilders', () => {
    it('should return an iterable of all registered builders', () => {
        const registry = buildTestRegistry();
        const builders = [...registry.getBuilders()];
        expect(builders).toHaveLength(3);
    });

    it('each builder should have getName, getTags, getActionMetadata', () => {
        const registry = buildTestRegistry();
        for (const builder of registry.getBuilders()) {
            expect(typeof builder.getName).toBe('function');
            expect(typeof builder.getTags).toBe('function');
            expect(typeof builder.getActionMetadata).toBe('function');
        }
    });
});

// ── ActionMetadata — Presenter Fields ────────────────────

describe('ActionMetadata Presenter Fields', () => {
    it('should populate presenterName when action uses returns: Presenter', () => {
        const tool = createTool<void>('test')
            .discriminator('action')
            .action({
                name: 'get',
                schema: z.object({ id: z.string() }),
                returns: InvoicePresenter,
                handler: async () => ({ id: '1', total: 100, client: 'Acme' }),
            });

        const metadata = tool.getActionMetadata();
        expect(metadata[0].presenterName).toBe('Invoice');
        expect(metadata[0].presenterSchemaKeys).toContain('id');
    });

    it('should have undefined presenter fields when no returns is set', () => {
        const tool = createTool<void>('test')
            .discriminator('action')
            .action({
                name: 'list',
                schema: z.object({}),
                handler: async () => ({ content: [{ type: 'text' as const, text: '[]' }] }),
            });

        const metadata = tool.getActionMetadata();
        expect(metadata[0].presenterName).toBeUndefined();
        expect(metadata[0].presenterSchemaKeys).toBeUndefined();
        expect(metadata[0].presenterUiBlockTypes).toBeUndefined();
        expect(metadata[0].presenterHasContextualRules).toBeUndefined();
    });
});

// ── IntrospectionConfig Defaults ─────────────────────────

describe('IntrospectionConfig', () => {
    it('should define sensible defaults', () => {
        const config: IntrospectionConfig<void> = {
            enabled: false,
        };

        expect(config.enabled).toBe(false);
        expect(config.uri).toBeUndefined(); // defaults to fusion://manifest.json
        expect(config.filter).toBeUndefined(); // no filter by default
    });

    it('configuring without filter should compile without errors', () => {
        const config: IntrospectionConfig<{ role: string }> = {
            enabled: true,
            uri: 'fusion://custom.json',
        };

        expect(config.enabled).toBe(true);
        expect(config.uri).toBe('fusion://custom.json');
    });
});
