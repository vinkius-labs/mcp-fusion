/**
 * ManifestCompiler — Unit Tests
 *
 * Dedicated tests for the dynamic manifest compilation pipeline:
 * - compileManifest: builds structured manifest from builders
 * - cloneManifest: deep clone independence
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { compileManifest, cloneManifest } from '../../src/introspection/ManifestCompiler.js';
import type { ToolBuilder, ActionMetadata } from '../../src/core/types.js';
import type { ManifestPayload } from '../../src/introspection/types.js';

// ============================================================================
// Helpers — Minimal mock builders
// ============================================================================

function createMockBuilder(
    name: string,
    options: {
        tags?: string[];
        actions?: Partial<ActionMetadata>[];
        description?: string;
    } = {},
): ToolBuilder<void> {
    const tags = options.tags ?? [];
    const description = options.description ?? `${name} description`;
    const actions: ActionMetadata[] = (options.actions ?? [
        { key: 'list', actionName: 'list', description: 'List items' },
    ]).map(a => ({
        key: a.key ?? 'default',
        actionName: a.actionName ?? a.key ?? 'default',
        groupName: undefined,
        description: a.description,
        destructive: a.destructive ?? false,
        idempotent: a.idempotent ?? true,
        readOnly: a.readOnly ?? true,
        requiredFields: a.requiredFields ?? [],
        hasMiddleware: a.hasMiddleware ?? false,
        presenterName: a.presenterName,
        presenterSchemaKeys: a.presenterSchemaKeys,
        presenterUiBlockTypes: a.presenterUiBlockTypes,
        presenterHasContextualRules: a.presenterHasContextualRules,
    }));

    return {
        getName: () => name,
        getTags: () => tags,
        getActionNames: () => actions.map(a => a.key),
        getActionMetadata: () => actions,
        buildToolDefinition: () => ({
            name,
            description,
            inputSchema: { type: 'object' as const, properties: {} },
        }),
        execute: async () => ({ content: [] }),
        previewPrompt: () => '',
    };
}

// ============================================================================
// 1 · compileManifest
// ============================================================================

describe('compileManifest', () => {
    it('returns manifest with server name', () => {
        const manifest = compileManifest('test-server', []);
        expect(manifest.server).toBe('test-server');
    });

    it('includes mcp_fusion_version', () => {
        const manifest = compileManifest('srv', []);
        expect(manifest.mcp_fusion_version).toBeTruthy();
        expect(typeof manifest.mcp_fusion_version).toBe('string');
    });

    it('includes architecture field', () => {
        const manifest = compileManifest('srv', []);
        expect(manifest.architecture).toBe('MVA (Model-View-Agent)');
    });

    it('compiles single builder', () => {
        const builder = createMockBuilder('projects');
        const manifest = compileManifest('srv', [builder]);

        expect(manifest.capabilities.tools).toHaveProperty('projects');
        expect(manifest.capabilities.tools['projects']!.description).toBe('projects description');
    });

    it('compiles multiple builders', () => {
        const builders = [
            createMockBuilder('projects'),
            createMockBuilder('tasks'),
            createMockBuilder('users'),
        ];
        const manifest = compileManifest('srv', builders);

        expect(Object.keys(manifest.capabilities.tools)).toHaveLength(3);
        expect(manifest.capabilities.tools).toHaveProperty('projects');
        expect(manifest.capabilities.tools).toHaveProperty('tasks');
        expect(manifest.capabilities.tools).toHaveProperty('users');
    });

    it('empty builders produces empty capabilities', () => {
        const manifest = compileManifest('srv', []);
        expect(Object.keys(manifest.capabilities.tools)).toHaveLength(0);
    });

    it('compiles action metadata correctly', () => {
        const builder = createMockBuilder('projects', {
            actions: [
                {
                    key: 'create',
                    actionName: 'create',
                    description: 'Create a project',
                    destructive: false,
                    idempotent: false,
                    readOnly: false,
                    requiredFields: ['name'],
                },
                {
                    key: 'delete',
                    actionName: 'delete',
                    description: 'Delete a project',
                    destructive: true,
                    idempotent: true,
                    readOnly: false,
                    requiredFields: ['id'],
                },
            ],
        });
        const manifest = compileManifest('srv', [builder]);
        const tool = manifest.capabilities.tools['projects']!;

        expect(tool.actions).toHaveProperty('create');
        expect(tool.actions).toHaveProperty('delete');
        expect(tool.actions['create']!.destructive).toBe(false);
        expect(tool.actions['delete']!.destructive).toBe(true);
        expect(tool.actions['delete']!.idempotent).toBe(true);
        expect(tool.actions['create']!.required_fields).toEqual(['name']);
    });

    it('compiles tags', () => {
        const builder = createMockBuilder('projects', { tags: ['admin', 'core'] });
        const manifest = compileManifest('srv', [builder]);
        const tool = manifest.capabilities.tools['projects']!;
        expect(tool.tags).toEqual(['admin', 'core']);
    });

    it('includes input schema', () => {
        const builder = createMockBuilder('projects');
        const manifest = compileManifest('srv', [builder]);
        const tool = manifest.capabilities.tools['projects']!;
        expect(tool.input_schema).toBeTruthy();
        expect(tool.input_schema.type).toBe('object');
    });

    it('compiles presenter references', () => {
        const builder = createMockBuilder('projects', {
            actions: [{
                key: 'list',
                actionName: 'list',
                presenterName: 'ProjectListPresenter',
                presenterSchemaKeys: ['id', 'name', 'status'],
                presenterUiBlockTypes: ['echarts'],
                presenterHasContextualRules: true,
            }],
        });
        const manifest = compileManifest('srv', [builder]);

        expect(manifest.capabilities.presenters).toHaveProperty('ProjectListPresenter');
        const presenter = manifest.capabilities.presenters['ProjectListPresenter']!;
        expect(presenter.schema_keys).toEqual(['id', 'name', 'status']);
        expect(presenter.ui_blocks_supported).toEqual(['echarts']);
        expect(presenter.has_contextual_rules).toBe(true);
    });

    it('deduplicates presenters across actions', () => {
        const builder = createMockBuilder('projects', {
            actions: [
                { key: 'list', actionName: 'list', presenterName: 'SharedPresenter', presenterSchemaKeys: ['a'] },
                { key: 'get', actionName: 'get', presenterName: 'SharedPresenter', presenterSchemaKeys: ['b'] },
            ],
        });
        const manifest = compileManifest('srv', [builder]);

        // Should only have one entry (first wins)
        const presenterKeys = Object.keys(manifest.capabilities.presenters);
        expect(presenterKeys.filter(k => k === 'SharedPresenter')).toHaveLength(1);
    });
});

// ============================================================================
// 2 · cloneManifest
// ============================================================================

describe('cloneManifest', () => {
    it('produces a deep copy', () => {
        const original: ManifestPayload = {
            server: 'srv',
            mcp_fusion_version: '1.0.0',
            architecture: 'MVA',
            capabilities: {
                tools: {
                    projects: {
                        description: 'desc',
                        tags: ['admin'],
                        actions: {},
                        input_schema: { type: 'object', properties: {} },
                    },
                },
                presenters: {},
            },
        };

        const cloned = cloneManifest(original);

        // Same structure
        expect(cloned).toEqual(original);

        // But different references
        expect(cloned).not.toBe(original);
        expect(cloned.capabilities).not.toBe(original.capabilities);
        expect(cloned.capabilities.tools).not.toBe(original.capabilities.tools);
    });

    it('mutating clone does not affect original', () => {
        const builder = createMockBuilder('projects', { tags: ['admin'] });
        const original = compileManifest('srv', [builder]);
        const cloned = cloneManifest(original);

        // Mutate clone
        cloned.capabilities.tools['projects']!.description = 'mutated';
        delete cloned.capabilities.tools['projects'];

        // Original unchanged
        expect(original.capabilities.tools).toHaveProperty('projects');
        expect(original.capabilities.tools['projects']!.description).toBe('projects description');
    });

    it('preserves all fields through round-trip', () => {
        const builder = createMockBuilder('tool', {
            tags: ['tag1', 'tag2'],
            actions: [{
                key: 'action1',
                actionName: 'action1',
                description: 'Action one',
                destructive: true,
                presenterName: 'presenter1',
                presenterSchemaKeys: ['key1'],
            }],
        });
        const original = compileManifest('my-server', [builder]);
        const cloned = cloneManifest(original);

        expect(cloned.server).toBe('my-server');
        expect(cloned.capabilities.tools['tool']!.tags).toEqual(['tag1', 'tag2']);
        expect(cloned.capabilities.tools['tool']!.actions['action1']!.destructive).toBe(true);
        expect(cloned.capabilities.presenters['presenter1']!.schema_keys).toEqual(['key1']);
    });
});
