/**
 * ToolContract + BehaviorDigest + ContractDiff Tests
 *
 * Verifies the contract materialization, behavioral fingerprinting,
 * and diffing engine in isolation.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder } from '../../src/core/builder/GroupedToolBuilder.js';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { success } from '../../src/core/response.js';
import {
    materializeContract,
    compileContracts,
    sha256,
    canonicalize,
} from '../../src/introspection/ToolContract.js';
import type { ToolContract } from '../../src/introspection/ToolContract.js';
import {
    diffContracts,
    formatDiffReport,
    formatDeltasAsXml,
} from '../../src/introspection/ContractDiff.js';
import {
    computeDigest,
    computeServerDigest,
    compareServerDigests,
} from '../../src/introspection/BehaviorDigest.js';

// ============================================================================
// Helpers
// ============================================================================

const UserPresenter = createPresenter('UserPresenter')
    .schema(z.object({ id: z.number(), name: z.string(), email: z.string() }))
    .systemRules(['Always format emails in lowercase']);

function createTestBuilder() {
    return new GroupedToolBuilder<void>('users')
        .description('Manage users')
        .tags('crud', 'admin')
        .action({
            name: 'list',
            description: 'List all users',
            readOnly: true,
            schema: z.object({ limit: z.number().optional() }),
            returns: UserPresenter,
            handler: async () => success({ data: [{ id: 1, name: 'Alice', email: 'alice@test.com' }] }),
        })
        .action({
            name: 'create',
            description: 'Create a user',
            destructive: false,
            schema: z.object({ name: z.string(), email: z.string() }),
            handler: async () => success({ data: { id: 2, name: 'Bob', email: 'bob@test.com' } }),
        })
        .action({
            name: 'delete',
            description: 'Delete a user',
            destructive: true,
            schema: z.object({ id: z.number() }),
            handler: async () => success({ data: { deleted: true } }),
        });
}

// ============================================================================
// ToolContract — Materialization
// ============================================================================

describe('ToolContract', () => {
    it('materializes a contract from a builder', async () => {
        const builder = createTestBuilder();
        const contract = await materializeContract(builder);

        expect(contract.surface.name).toBe('users');
        expect(contract.surface.description).toContain('Manage users');
        expect(contract.surface.tags).toEqual(['crud', 'admin']);
        expect(contract.surface.inputSchemaDigest).toBeTruthy();
    });

    it('captures per-action contracts', async () => {
        const builder = createTestBuilder();
        const contract = await materializeContract(builder);

        expect(Object.keys(contract.surface.actions)).toContain('list');
        expect(Object.keys(contract.surface.actions)).toContain('create');
        expect(Object.keys(contract.surface.actions)).toContain('delete');

        const listAction = contract.surface.actions['list']!;
        expect(listAction.readOnly).toBe(true);
        expect(listAction.destructive).toBe(false);

        const deleteAction = contract.surface.actions['delete']!;
        expect(deleteAction.destructive).toBe(true);
    });

    it('captures Presenter metadata in behavior', async () => {
        const builder = createTestBuilder();
        const contract = await materializeContract(builder);

        // The list action uses UserPresenter
        expect(contract.behavior.egressSchemaDigest).toBeTruthy();
    });

    it('computes token economics profile', async () => {
        const builder = createTestBuilder();
        const contract = await materializeContract(builder);

        expect(contract.tokenEconomics.schemaFieldCount).toBeGreaterThan(0);
        expect(contract.tokenEconomics.inflationRisk).toBeDefined();
    });

    it('compileContracts produces a record keyed by tool name', async () => {
        const builder = createTestBuilder();
        const contracts = await compileContracts([builder]);

        expect(contracts).toHaveProperty('users');
        expect(contracts['users']!.surface.name).toBe('users');
    });

    it('produces deterministic contracts for identical builders', async () => {
        const builder1 = createTestBuilder();
        const builder2 = createTestBuilder();

        const contract1 = await materializeContract(builder1);
        const contract2 = await materializeContract(builder2);

        expect(contract1.surface.inputSchemaDigest).toBe(contract2.surface.inputSchemaDigest);
    });
});

// ============================================================================
// sha256 + canonicalize
// ============================================================================

describe('sha256 / canonicalize', () => {
    it('produces 64-character hex digests', async () => {
        const hash = await sha256('hello');
        expect(hash).toHaveLength(64);
        expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it('produces deterministic hashes', async () => {
        expect(await sha256('test')).toBe(await sha256('test'));
    });

    it('canonicalizes object key order', async () => {
        const obj1 = { b: 2, a: 1 };
        const obj2 = { a: 1, b: 2 };
        expect(canonicalize(obj1)).toBe(canonicalize(obj2));
    });

    it('canonicalizes nested objects', async () => {
        const obj1 = { z: { b: 2, a: 1 }, y: 1 };
        const obj2 = { y: 1, z: { a: 1, b: 2 } };
        expect(canonicalize(obj1)).toBe(canonicalize(obj2));
    });
});

// ============================================================================
// ContractDiff
// ============================================================================

describe('ContractDiff', () => {
    async function createBaseContract(): ToolContract {
        return {
            surface: {
                name: 'users',
                description: 'Manage users',
                tags: ['crud'],
                inputSchemaDigest: await sha256('schema-v1'),
                actions: {
                    list: {
                        description: 'List users',
                        destructive: false,
                        idempotent: true,
                        readOnly: true,
                        requiredFields: [],
                        presenterName: 'UserPresenter',
                        inputSchemaDigest: await sha256('list-schema'),
                        hasMiddleware: false,
                    },
                    create: {
                        description: 'Create user',
                        destructive: false,
                        idempotent: false,
                        readOnly: false,
                        requiredFields: ['name', 'email'],
                        presenterName: undefined,
                        inputSchemaDigest: await sha256('create-schema'),
                        hasMiddleware: false,
                    },
                },
            },
            behavior: {
                egressSchemaDigest: await sha256('egress-v1'),
                systemRulesFingerprint: 'static:abc',
                cognitiveGuardrails: { agentLimitMax: 50, egressMaxBytes: null },
                middlewareChain: [],
                stateSyncFingerprint: null,
                concurrencyFingerprint: null,
                affordanceTopology: [],
                embeddedPresenters: [],
            },
            tokenEconomics: {
                schemaFieldCount: 3,
                unboundedCollection: false,
                baseOverheadTokens: 50,
                inflationRisk: 'low',
            },
            entitlements: {
                filesystem: false,
                network: false,
                subprocess: false,
                crypto: false,
                codeEvaluation: false,
                raw: [],
            },
        };
    }

    it('detects no changes for identical contracts', async () => {
        const base = await createBaseContract();
        const result = diffContracts(base, base);

        expect(result.deltas).toHaveLength(0);
        expect(result.maxSeverity).toBe('COSMETIC');
        expect(result.isBackwardsCompatible).toBe(true);
    });

    it('detects BREAKING changes — input schema', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            surface: { ...before.surface, inputSchemaDigest: await sha256('schema-v2') },
        };

        const result = diffContracts(before, after);
        const schemaDeltas = result.deltas.filter(d => d.field === 'inputSchemaDigest');
        expect(schemaDeltas).toHaveLength(1);
        expect(schemaDeltas[0]!.severity).toBe('BREAKING');
    });

    it('detects BREAKING changes — egress schema', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            behavior: { ...before.behavior, egressSchemaDigest: await sha256('egress-v2') },
        };

        const result = diffContracts(before, after);
        expect(result.maxSeverity).toBe('BREAKING');
        expect(result.digestChanged).toBe(true);
    });

    it('detects BREAKING changes — action removed', async () => {
        const before = await createBaseContract();
        const { create: _, ...remainingActions } = before.surface.actions;
        const after: ToolContract = {
            ...before,
            surface: { ...before.surface, actions: remainingActions },
        };

        const result = diffContracts(before, after);
        const removedDeltas = result.deltas.filter(d => d.description.includes('removed'));
        expect(removedDeltas).toHaveLength(1);
        expect(removedDeltas[0]!.severity).toBe('BREAKING');
    });

    it('detects SAFE changes — action added', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            surface: {
                ...before.surface,
                actions: {
                    ...before.surface.actions,
                    update: {
                        description: 'Update user',
                        destructive: false,
                        idempotent: true,
                        readOnly: false,
                        requiredFields: ['id', 'name'],
                        presenterName: undefined,
                        inputSchemaDigest: await sha256('update-schema'),
                        hasMiddleware: false,
                    },
                },
            },
        };

        const result = diffContracts(before, after);
        const addedDeltas = result.deltas.filter(d => d.description.includes('added'));
        expect(addedDeltas).toHaveLength(1);
        expect(addedDeltas[0]!.severity).toBe('SAFE');
    });

    it('detects BREAKING changes — entitlement gained', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            entitlements: { ...before.entitlements, filesystem: true },
        };

        const result = diffContracts(before, after);
        const entitlementDeltas = result.deltas.filter(d => d.category === 'entitlements');
        expect(entitlementDeltas).toHaveLength(1);
        expect(entitlementDeltas[0]!.severity).toBe('BREAKING');
    });

    it('sorts deltas by severity (BREAKING first)', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            surface: {
                ...before.surface,
                description: 'Updated description', // COSMETIC
                inputSchemaDigest: await sha256('schema-v2'), // BREAKING
            },
        };

        const result = diffContracts(before, after);
        expect(result.deltas.length).toBeGreaterThan(0);
        expect(result.deltas[0]!.severity).toBe('BREAKING');
    });

    it('formats diff report as human-readable text', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            surface: { ...before.surface, inputSchemaDigest: await sha256('schema-v2') },
        };

        const result = diffContracts(before, after);
        const report = formatDiffReport(result);
        expect(report).toContain('[users]');
        expect(report).toContain('BREAKING');
    });

    it('formats deltas as XML for LLM injection', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            behavior: { ...before.behavior, systemRulesFingerprint: 'dynamic' },
        };

        const result = diffContracts(before, after);
        const xml = formatDeltasAsXml(result.deltas);
        expect(xml).toContain('<contract_changes>');
        expect(xml).toContain('</contract_changes>');
        expect(xml).toContain('severity="BREAKING"');
    });

    it('detects RISKY changes — egressMaxBytes removed', async () => {
        const before = await createBaseContract();
        const withBytes: ToolContract = {
            ...before,
            behavior: {
                ...before.behavior,
                cognitiveGuardrails: { agentLimitMax: 50, egressMaxBytes: 8192 },
            },
        };
        const withoutBytes: ToolContract = {
            ...before,
            behavior: {
                ...before.behavior,
                cognitiveGuardrails: { agentLimitMax: 50, egressMaxBytes: null },
            },
        };

        const result = diffContracts(withBytes, withoutBytes);
        const bytesDeltas = result.deltas.filter(d => d.field === 'egressMaxBytes');
        expect(bytesDeltas).toHaveLength(1);
        expect(bytesDeltas[0]!.severity).toBe('RISKY');
    });

    it('detects RISKY changes — concurrency fingerprint changed', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            behavior: { ...before.behavior, concurrencyFingerprint: 'mutex:abc' },
        };

        const result = diffContracts(before, after);
        const concurrencyDeltas = result.deltas.filter(d => d.field === 'concurrencyFingerprint');
        expect(concurrencyDeltas).toHaveLength(1);
        expect(concurrencyDeltas[0]!.severity).toBe('RISKY');
    });

    it('detects RISKY changes — embedded presenters changed', async () => {
        const before = await createBaseContract();
        const after: ToolContract = {
            ...before,
            behavior: { ...before.behavior, embeddedPresenters: ['ChildPresenter'] },
        };

        const result = diffContracts(before, after);
        const presenterDeltas = result.deltas.filter(d => d.field === 'embeddedPresenters');
        expect(presenterDeltas).toHaveLength(1);
        expect(presenterDeltas[0]!.severity).toBe('RISKY');
    });
});

// ============================================================================
// BehaviorDigest
// ============================================================================

describe('BehaviorDigest', () => {
    async function createContract(): ToolContract {
        return {
            surface: {
                name: 'projects',
                description: 'Project management',
                tags: ['core'],
                inputSchemaDigest: await sha256('projects-schema'),
                actions: {
                    list: {
                        description: 'List projects',
                        destructive: false,
                        idempotent: true,
                        readOnly: true,
                        requiredFields: [],
                        presenterName: 'ProjectPresenter',
                        inputSchemaDigest: await sha256('list-schema'),
                        hasMiddleware: false,
                    },
                },
            },
            behavior: {
                egressSchemaDigest: await sha256('egress'),
                systemRulesFingerprint: 'static:xyz',
                cognitiveGuardrails: { agentLimitMax: 25, egressMaxBytes: null },
                middlewareChain: [],
                stateSyncFingerprint: null,
                concurrencyFingerprint: null,
                affordanceTopology: ['tasks.list'],
                embeddedPresenters: [],
            },
            tokenEconomics: {
                schemaFieldCount: 5,
                unboundedCollection: false,
                baseOverheadTokens: 70,
                inflationRisk: 'low',
            },
            entitlements: {
                filesystem: false,
                network: false,
                subprocess: false,
                crypto: false,
                codeEvaluation: false,
                raw: [],
            },
        };
    }

    it('computes a deterministic digest', async () => {
        const contract = await createContract();
        const d1 = await computeDigest(contract);
        const d2 = await computeDigest(contract);

        expect(d1.digest).toBe(d2.digest);
        expect(d1.digest).toHaveLength(64);
    });

    it('provides per-section component digests', async () => {
        const contract = await createContract();
        const result = await computeDigest(contract);

        expect(result.components.surface).toBeTruthy();
        expect(result.components.behavior).toBeTruthy();
        expect(result.components.tokenEconomics).toBeTruthy();
        expect(result.components.entitlements).toBeTruthy();
    });

    it('digest changes when behavior changes', async () => {
        const contract1 = await createContract();
        const contract2 = {
            ...contract1,
            behavior: {
                ...contract1.behavior,
                systemRulesFingerprint: 'changed',
            },
        };

        const d1 = await computeDigest(contract1);
        const d2 = await computeDigest(contract2);

        expect(d1.digest).not.toBe(d2.digest);
        expect(d1.components.behavior).not.toBe(d2.components.behavior);
        // Surface should remain the same
        expect(d1.components.surface).toBe(d2.components.surface);
    });

    it('computes a server digest over all tools', async () => {
        const contracts: Record<string, ToolContract> = {
            projects: await createContract(),
        };

        const serverDigest = await computeServerDigest(contracts);
        expect(serverDigest.digest).toHaveLength(64);
        expect(serverDigest.tools).toHaveProperty('projects');
    });

    it('compares server digests', async () => {
        const contracts1: Record<string, ToolContract> = {
            projects: await createContract(),
        };
        const contracts2: Record<string, ToolContract> = {
            projects: {
                ...(await createContract()),
                behavior: {
                    ...(await createContract()).behavior,
                    egressSchemaDigest: await sha256('changed'),
                },
            },
        };

        const sd1 = await computeServerDigest(contracts1);
        const sd2 = await computeServerDigest(contracts2);

        const comparison = compareServerDigests(sd1, sd2);
        expect(comparison.serverDigestChanged).toBe(true);
        expect(comparison.changed).toContain('projects');
        expect(comparison.added).toHaveLength(0);
        expect(comparison.removed).toHaveLength(0);
    });

    it('detects added and removed tools', async () => {
        const sd1 = await computeServerDigest({ projects: await createContract() });
        const sd2 = await computeServerDigest({
            tasks: { ...(await createContract()), surface: { ...(await createContract()).surface, name: 'tasks' } },
        });

        const comparison = compareServerDigests(sd1, sd2);
        expect(comparison.added).toContain('tasks');
        expect(comparison.removed).toContain('projects');
    });
});
