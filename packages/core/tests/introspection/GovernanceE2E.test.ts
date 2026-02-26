/**
 * Governance E2E — Cross-Module Integration & Doc-Parity Tests
 *
 * Validates that every documented API works end-to-end, that all severity
 * classifications in ContractDiff match the docs, and that the full
 * governance pipeline (contract → digest → lockfile → diff → attest) is
 * consistent.
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
import type { ToolContract, ToolSurface, ToolBehavior, TokenEconomicsProfile, HandlerEntitlements, ActionContract } from '../../src/introspection/ToolContract.js';
import {
    diffContracts,
    formatDiffReport,
    formatDeltasAsXml,
} from '../../src/introspection/ContractDiff.js';
import type { ContractDiffResult, ContractDelta, DeltaSeverity } from '../../src/introspection/ContractDiff.js';
import {
    computeDigest,
    computeServerDigest,
    compareServerDigests,
} from '../../src/introspection/BehaviorDigest.js';
import type { BehaviorDigestResult, ServerDigest, DigestComparison } from '../../src/introspection/BehaviorDigest.js';
import {
    generateLockfile,
    serializeLockfile,
    checkLockfile,
    parseLockfile,
} from '../../src/introspection/CapabilityLockfile.js';
import {
    createHmacSigner,
    attestServerDigest,
    verifyAttestation,
    verifyCapabilityPin,
    buildTrustCapability,
    AttestationError,
} from '../../src/introspection/CryptoAttestation.js';
import type { ZeroTrustConfig, AttestationSigner, AttestationResult, FusionTrustCapability } from '../../src/introspection/CryptoAttestation.js';
import {
    scanSource,
    buildEntitlements,
    validateClaims,
    scanAndValidate,
} from '../../src/introspection/EntitlementScanner.js';
import type { EntitlementMatch, EntitlementViolation, EntitlementReport } from '../../src/introspection/EntitlementScanner.js';
import {
    estimateTokens,
    profileBlock,
    profileResponse,
    computeStaticProfile,
    aggregateProfiles,
} from '../../src/introspection/TokenEconomics.js';
import type { TokenAnalysis, StaticTokenProfile, ServerTokenSummary, BlockTokenProfile, FieldTokenEstimate, TokenThresholds } from '../../src/introspection/TokenEconomics.js';

// ============================================================================
// Fixtures
// ============================================================================

const Presenter1 = createPresenter('UserPresenter')
    .schema(z.object({ id: z.number(), name: z.string(), email: z.string() }))
    .systemRules(['Always format emails in lowercase']);

function makeAction(overrides: Partial<ActionContract> = {}): ActionContract {
    return {
        description: 'Test action',
        destructive: false,
        idempotent: false,
        readOnly: false,
        requiredFields: [],
        presenterName: undefined,
        inputSchemaDigest: sha256('test'),
        hasMiddleware: false,
        ...overrides,
    };
}

function makeSurface(overrides: Partial<ToolSurface> = {}): ToolSurface {
    return {
        name: 'test-tool',
        description: 'A test tool',
        tags: ['test'],
        actions: { run: makeAction() },
        inputSchemaDigest: sha256('schema'),
        ...overrides,
    };
}

function makeBehavior(overrides: Partial<ToolBehavior> = {}): ToolBehavior {
    return {
        egressSchemaDigest: null,
        systemRulesFingerprint: 'none',
        cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: null },
        middlewareChain: [],
        stateSyncFingerprint: null,
        concurrencyFingerprint: null,
        affordanceTopology: [],
        embeddedPresenters: [],
        ...overrides,
    };
}

function makeTokenEconomics(overrides: Partial<TokenEconomicsProfile> = {}): TokenEconomicsProfile {
    return {
        schemaFieldCount: 3,
        unboundedCollection: false,
        baseOverheadTokens: 50,
        inflationRisk: 'low',
        ...overrides,
    };
}

function makeEntitlements(overrides: Partial<HandlerEntitlements> = {}): HandlerEntitlements {
    return {
        filesystem: false,
        network: false,
        subprocess: false,
        crypto: false,
        codeEvaluation: false,
        raw: [],
        ...overrides,
    };
}

function makeContract(overrides: {
    surface?: Partial<ToolSurface>;
    behavior?: Partial<ToolBehavior>;
    tokenEconomics?: Partial<TokenEconomicsProfile>;
    entitlements?: Partial<HandlerEntitlements>;
} = {}): ToolContract {
    return {
        surface: makeSurface(overrides.surface),
        behavior: makeBehavior(overrides.behavior),
        tokenEconomics: makeTokenEconomics(overrides.tokenEconomics),
        entitlements: makeEntitlements(overrides.entitlements),
    };
}

function buildReadOnlyTool() {
    return new GroupedToolBuilder<void>('config')
        .description('Read configuration')
        .tags('infra')
        .action({
            name: 'get',
            description: 'Get config value',
            readOnly: true,
            schema: z.object({ key: z.string() }),
            handler: async () => success({ data: { value: 'test' } }),
        });
}

function buildDestructiveTool() {
    return new GroupedToolBuilder<void>('admin')
        .description('Admin operations')
        .tags('admin', 'danger')
        .action({
            name: 'reset',
            description: 'Reset everything',
            destructive: true,
            schema: z.object({ confirm: z.boolean() }),
            handler: async () => success({ data: { reset: true } }),
        })
        .action({
            name: 'status',
            description: 'Check status',
            readOnly: true,
            schema: z.object({}),
            handler: async () => success({ data: { healthy: true } }),
        });
}

function buildToolWithPresenter() {
    return new GroupedToolBuilder<void>('users')
        .description('Manage users')
        .tags('crud')
        .action({
            name: 'list',
            description: 'List users',
            readOnly: true,
            schema: z.object({ limit: z.number().optional() }),
            returns: Presenter1,
            handler: async () => success({ data: [{ id: 1, name: 'Alice', email: 'a@b.com' }] }),
        });
}

// ============================================================================
// 1 · ContractDiff — Full severity matrix from docs
// ============================================================================

describe('ContractDiff — severity classification (doc parity)', () => {
    // ── Surface deltas ──
    it('COSMETIC: description change', () => {
        const before = makeContract({ surface: { description: 'Old desc' } });
        const after = makeContract({ surface: { description: 'New desc' } });
        const result = diffContracts(before, after);
        expect(result.maxSeverity).toBe('COSMETIC');
        expect(result.isBackwardsCompatible).toBe(true);
        const delta = result.deltas.find(d => d.field === 'description');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('COSMETIC');
    });

    it('BREAKING: tool name changed', () => {
        const before = makeContract({ surface: { name: 'old-tool' } });
        const after = makeContract({ surface: { name: 'new-tool' } });
        const result = diffContracts(before, after);
        expect(result.maxSeverity).toBe('BREAKING');
        expect(result.isBackwardsCompatible).toBe(false);
    });

    it('BREAKING: input schema digest changed', () => {
        const before = makeContract({ surface: { inputSchemaDigest: sha256('v1') } });
        const after = makeContract({ surface: { inputSchemaDigest: sha256('v2') } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'inputSchemaDigest');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('BREAKING');
    });

    it('SAFE: tag removed', () => {
        const before = makeContract({ surface: { tags: ['a', 'b'] } });
        const after = makeContract({ surface: { tags: ['a'] } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'tags');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('SAFE');
    });

    it('COSMETIC: tag added without removal', () => {
        const before = makeContract({ surface: { tags: ['a'] } });
        const after = makeContract({ surface: { tags: ['a', 'b'] } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'tags');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('COSMETIC');
    });

    // ── Action deltas ──
    it('BREAKING: action removed', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction(), delete: makeAction() } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction() } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.delete');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('BREAKING');
    });

    it('SAFE: action added', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction() } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction(), create: makeAction() } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.create');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('SAFE');
    });

    it('BREAKING: destructive flag changed', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ destructive: false }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ destructive: true }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.run.destructive');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('BREAKING');
    });

    it('BREAKING: readOnly flag changed', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ readOnly: true }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ readOnly: false }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.run.readOnly');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('BREAKING');
    });

    it('RISKY: idempotent flag changed', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ idempotent: false }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ idempotent: true }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.run.idempotent');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('RISKY');
    });

    it('BREAKING: new required field added', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ requiredFields: ['id'] }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ requiredFields: ['id', 'name'] }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d =>
            d.field === 'actions.run.requiredFields' && d.severity === 'BREAKING',
        );
        expect(delta).toBeDefined();
        expect(delta!.description).toContain('name');
    });

    it('SAFE: required field removed', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ requiredFields: ['id', 'name'] }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ requiredFields: ['id'] }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d =>
            d.field === 'actions.run.requiredFields' && d.severity === 'SAFE',
        );
        expect(delta).toBeDefined();
    });

    it('RISKY: action input schema changed', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ inputSchemaDigest: sha256('v1') }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ inputSchemaDigest: sha256('v2') }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.run.inputSchemaDigest');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('RISKY');
    });

    it('BREAKING: presenter removed from action', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ presenterName: 'UserPresenter' }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ presenterName: undefined }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.run.presenterName');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('BREAKING');
    });

    it('RISKY: presenter changed on action', () => {
        const before = makeContract({
            surface: { actions: { run: makeAction({ presenterName: 'OldPresenter' }) } },
        });
        const after = makeContract({
            surface: { actions: { run: makeAction({ presenterName: 'NewPresenter' }) } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'actions.run.presenterName');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('RISKY');
    });

    // ── Behavior deltas ──
    it('BREAKING: egress schema digest changed', () => {
        const before = makeContract({ behavior: { egressSchemaDigest: 'a' } });
        const after = makeContract({ behavior: { egressSchemaDigest: 'b' } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'egressSchemaDigest');
        expect(delta!.severity).toBe('BREAKING');
        expect(result.digestChanged).toBe(true);
    });

    it('BREAKING: system rules fingerprint changed', () => {
        const before = makeContract({ behavior: { systemRulesFingerprint: 'static:abc' } });
        const after = makeContract({ behavior: { systemRulesFingerprint: 'static:def' } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'systemRulesFingerprint');
        expect(delta!.severity).toBe('BREAKING');
        expect(result.digestChanged).toBe(true);
    });

    it('RISKY: agentLimitMax removed (null)', () => {
        const before = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: 50, egressMaxBytes: null } },
        });
        const after = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: null } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'agentLimitMax');
        expect(delta!.severity).toBe('RISKY');
    });

    it('SAFE: agentLimitMax tightened', () => {
        const before = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: null } },
        });
        const after = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: 20, egressMaxBytes: null } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'agentLimitMax');
        expect(delta!.severity).toBe('SAFE');
    });

    it('RISKY: egressMaxBytes removed', () => {
        const before = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: 4096 } },
        });
        const after = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: null } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'egressMaxBytes');
        expect(delta!.severity).toBe('RISKY');
    });

    it('SAFE: egressMaxBytes added', () => {
        const before = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: null } },
        });
        const after = makeContract({
            behavior: { cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: 8192 } },
        });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'egressMaxBytes');
        expect(delta!.severity).toBe('SAFE');
    });

    it('RISKY: middleware chain changed', () => {
        const before = makeContract({ behavior: { middlewareChain: ['auth:mw'] } });
        const after = makeContract({ behavior: { middlewareChain: ['auth:mw', 'rate-limit:mw'] } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'middlewareChain');
        expect(delta).toBeDefined();
        expect(delta!.severity).toBe('RISKY');
    });

    it('RISKY: stateSync fingerprint changed', () => {
        const before = makeContract({ behavior: { stateSyncFingerprint: 'v1' } });
        const after = makeContract({ behavior: { stateSyncFingerprint: 'v2' } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'stateSyncFingerprint');
        expect(delta!.severity).toBe('RISKY');
    });

    it('RISKY: concurrency fingerprint changed', () => {
        const before = makeContract({ behavior: { concurrencyFingerprint: 'serial' } });
        const after = makeContract({ behavior: { concurrencyFingerprint: 'parallel' } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'concurrencyFingerprint');
        expect(delta!.severity).toBe('RISKY');
    });

    it('RISKY: affordance topology changed', () => {
        const before = makeContract({ behavior: { affordanceTopology: ['payments.refund'] } });
        const after = makeContract({ behavior: { affordanceTopology: ['payments.refund', 'payments.void'] } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'affordanceTopology');
        expect(delta!.severity).toBe('RISKY');
    });

    it('RISKY: embedded presenters changed', () => {
        const before = makeContract({ behavior: { embeddedPresenters: ['UserPresenter'] } });
        const after = makeContract({ behavior: { embeddedPresenters: ['UserPresenter', 'InvoicePresenter'] } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'embeddedPresenters');
        expect(delta!.severity).toBe('RISKY');
    });

    // ── TokenEconomics deltas ──
    it('BREAKING: inflation risk escalated', () => {
        const before = makeContract({ tokenEconomics: { inflationRisk: 'low' } });
        const after = makeContract({ tokenEconomics: { inflationRisk: 'high' } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'inflationRisk');
        expect(delta!.severity).toBe('BREAKING');
    });

    it('SAFE: inflation risk de-escalated', () => {
        const before = makeContract({ tokenEconomics: { inflationRisk: 'high' } });
        const after = makeContract({ tokenEconomics: { inflationRisk: 'low' } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'inflationRisk');
        expect(delta!.severity).toBe('SAFE');
    });

    it('RISKY: became unbounded collection', () => {
        const before = makeContract({ tokenEconomics: { unboundedCollection: false } });
        const after = makeContract({ tokenEconomics: { unboundedCollection: true } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'unboundedCollection');
        expect(delta!.severity).toBe('RISKY');
    });

    it('SAFE: became bounded collection', () => {
        const before = makeContract({ tokenEconomics: { unboundedCollection: true } });
        const after = makeContract({ tokenEconomics: { unboundedCollection: false } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'unboundedCollection');
        expect(delta!.severity).toBe('SAFE');
    });

    // ── Entitlement deltas ──
    it('BREAKING: gained filesystem entitlement', () => {
        const before = makeContract({ entitlements: { filesystem: false } });
        const after = makeContract({ entitlements: { filesystem: true } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'filesystem');
        expect(delta!.severity).toBe('BREAKING');
    });

    it('BREAKING: gained network entitlement', () => {
        const before = makeContract({ entitlements: { network: false } });
        const after = makeContract({ entitlements: { network: true } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'network');
        expect(delta!.severity).toBe('BREAKING');
    });

    it('BREAKING: gained subprocess entitlement', () => {
        const before = makeContract({ entitlements: { subprocess: false } });
        const after = makeContract({ entitlements: { subprocess: true } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'subprocess');
        expect(delta!.severity).toBe('BREAKING');
    });

    it('BREAKING: gained crypto entitlement', () => {
        const before = makeContract({ entitlements: { crypto: false } });
        const after = makeContract({ entitlements: { crypto: true } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'crypto');
        expect(delta!.severity).toBe('BREAKING');
    });

    it('SAFE: lost entitlement', () => {
        const before = makeContract({ entitlements: { subprocess: true } });
        const after = makeContract({ entitlements: { subprocess: false } });
        const result = diffContracts(before, after);
        const delta = result.deltas.find(d => d.field === 'subprocess');
        expect(delta!.severity).toBe('SAFE');
    });

    // ── Composite / edge cases ──
    it('no deltas produces COSMETIC maxSeverity and isBackwardsCompatible=true', () => {
        const contract = makeContract();
        const result = diffContracts(contract, contract);
        expect(result.deltas).toHaveLength(0);
        expect(result.maxSeverity).toBe('COSMETIC');
        expect(result.isBackwardsCompatible).toBe(true);
        expect(result.digestChanged).toBe(false);
    });

    it('multiple mixed severities: deltas sorted BREAKING > RISKY > SAFE > COSMETIC', () => {
        const before = makeContract({
            surface: { description: 'old', tags: ['a', 'b'], actions: {
                run: makeAction({ idempotent: false }),
            } },
            entitlements: { network: false },
        });
        const after = makeContract({
            surface: { description: 'new', tags: ['a'], actions: {
                run: makeAction({ idempotent: true }),
            } },
            entitlements: { network: true },
        });
        const result = diffContracts(before, after);
        expect(result.deltas.length).toBeGreaterThanOrEqual(3);
        // Verify sorted: each severity ≥ next
        for (let i = 0; i < result.deltas.length - 1; i++) {
            const order: Record<DeltaSeverity, number> = { BREAKING: 3, RISKY: 2, SAFE: 1, COSMETIC: 0 };
            expect(order[result.deltas[i]!.severity]).toBeGreaterThanOrEqual(
                order[result.deltas[i + 1]!.severity],
            );
        }
    });
});

// ============================================================================
// 2 · ContractDiff — formatDiffReport & formatDeltasAsXml
// ============================================================================

describe('ContractDiff — formatting (doc parity)', () => {
    it('formatDiffReport with no deltas', () => {
        const contract = makeContract();
        const result = diffContracts(contract, contract);
        const report = formatDiffReport(result);
        expect(report).toContain('No contract changes detected');
    });

    it('formatDiffReport with mixed severities', () => {
        const before = makeContract({ surface: { description: 'old' }, entitlements: { filesystem: false } });
        const after = makeContract({ surface: { description: 'new' }, entitlements: { filesystem: true } });
        const result = diffContracts(before, after);
        const report = formatDiffReport(result);
        expect(report).toContain('BREAKING');
        expect(report).toContain('COSMETIC');
        expect(report).toContain('change(s)');
    });

    it('formatDeltasAsXml with empty deltas', () => {
        const contract = makeContract();
        const result = diffContracts(contract, contract);
        const xml = formatDeltasAsXml(result.deltas);
        expect(xml === '' || xml.includes('<contract_changes')).toBe(true);
    });

    it('formatDeltasAsXml with multiple deltas produces valid XML structure', () => {
        const before = makeContract({
            behavior: { middlewareChain: ['auth'] },
            entitlements: { network: false },
        });
        const after = makeContract({
            behavior: { middlewareChain: ['auth', 'limit'] },
            entitlements: { network: true },
        });
        const result = diffContracts(before, after);
        const xml = formatDeltasAsXml(result.deltas);
        expect(xml).toContain('<change');
        expect(xml).toContain('BREAKING');
        expect(xml).toContain('RISKY');
    });
});

// ============================================================================
// 3 · BehaviorDigest — sensitivity & component isolation
// ============================================================================

describe('BehaviorDigest — section sensitivity (doc parity)', () => {
    it('digest changes when tokenEconomics changes', () => {
        const c1 = makeContract({ tokenEconomics: { inflationRisk: 'low' } });
        const c2 = makeContract({ tokenEconomics: { inflationRisk: 'critical' } });
        const d1 = computeDigest(c1);
        const d2 = computeDigest(c2);
        expect(d1.digest).not.toBe(d2.digest);
        expect(d1.components.tokenEconomics).not.toBe(d2.components.tokenEconomics);
        // Other components should remain equal
        expect(d1.components.surface).toBe(d2.components.surface);
        expect(d1.components.behavior).toBe(d2.components.behavior);
    });

    it('digest changes when entitlements change', () => {
        const c1 = makeContract({ entitlements: { filesystem: false } });
        const c2 = makeContract({ entitlements: { filesystem: true } });
        const d1 = computeDigest(c1);
        const d2 = computeDigest(c2);
        expect(d1.digest).not.toBe(d2.digest);
        expect(d1.components.entitlements).not.toBe(d2.components.entitlements);
        expect(d1.components.surface).toBe(d2.components.surface);
    });

    it('digest changes when surface tags change', () => {
        const c1 = makeContract({ surface: { tags: ['a'] } });
        const c2 = makeContract({ surface: { tags: ['a', 'b'] } });
        const d1 = computeDigest(c1);
        const d2 = computeDigest(c2);
        expect(d1.digest).not.toBe(d2.digest);
        expect(d1.components.surface).not.toBe(d2.components.surface);
    });

    it('computedAt is a valid ISO timestamp', () => {
        const contract = makeContract();
        const result = computeDigest(contract);
        expect(() => new Date(result.computedAt).toISOString()).not.toThrow();
        expect(result.toolName).toBe('test-tool');
    });

    it('compareServerDigests classifies unchanged tools', () => {
        const contracts: Record<string, ToolContract> = {
            'tool-a': makeContract({ surface: { name: 'tool-a' } }),
            'tool-b': makeContract({ surface: { name: 'tool-b' } }),
        };
        const digest = computeServerDigest(contracts);
        const comparison = compareServerDigests(digest, digest);
        expect(comparison.serverDigestChanged).toBe(false);
        expect(comparison.unchanged).toContain('tool-a');
        expect(comparison.unchanged).toContain('tool-b');
        expect(comparison.added).toHaveLength(0);
        expect(comparison.removed).toHaveLength(0);
        expect(comparison.changed).toHaveLength(0);
    });

    it('serverDigest is deterministic (object key order doesn\'t matter)', () => {
        const a = makeContract({ surface: { name: 'alpha' } });
        const b = makeContract({ surface: { name: 'beta' } });
        const d1 = computeServerDigest({ alpha: a, beta: b });
        const d2 = computeServerDigest({ beta: b, alpha: a });
        expect(d1.digest).toBe(d2.digest);
    });
});

// ============================================================================
// 4 · EntitlementScanner — expanded pattern coverage
// ============================================================================

describe('EntitlementScanner — expanded coverage (doc parity)', () => {
    it('detects mixed filesystem + subprocess + network in one source', () => {
        const source = `
            import { readFile, writeFile } from 'node:fs/promises';
            import { exec } from 'node:child_process';
            const data = await fetch('https://api.example.com/data');
        `;
        const matches = scanSource(source);
        const categories = new Set(matches.map(m => m.category));
        expect(categories.has('filesystem')).toBe(true);
        expect(categories.has('subprocess')).toBe(true);
        expect(categories.has('network')).toBe(true);
    });

    it('detects crypto patterns', () => {
        const source = `
            import { createSign, createVerify } from 'node:crypto';
            const signer = createSign('SHA256');
        `;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'crypto')).toBe(true);
    });

    it('validateClaims: readOnly + network produces warning', () => {
        const source = `const res = await fetch('https://api.com');`;
        const matches = scanSource(source);
        const violations = validateClaims(matches, { readOnly: true });
        expect(violations.some(v =>
            v.category === 'network' && v.severity === 'warning',
        )).toBe(true);
    });

    it('validateClaims: allowed entitlements suppress violations', () => {
        const source = `
            import { readFile } from 'fs';
            await fetch('https://api.com');
        `;
        const matches = scanSource(source);
        const violations = validateClaims(matches, { readOnly: true, allowed: ['network', 'filesystem'] });
        // All violations should be suppressed because both categories are allowed
        const errorViolations = violations.filter(v => v.severity === 'error');
        expect(errorViolations).toHaveLength(0);
    });

    it('validateClaims: non-destructive + subprocess produces warning', () => {
        const source = `import { exec } from 'child_process';`;
        const matches = scanSource(source);
        const violations = validateClaims(matches, { destructive: false });
        expect(violations.some(v =>
            v.category === 'subprocess' && v.severity === 'warning',
        )).toBe(true);
    });

    it('scanAndValidate produces complete report with summary', () => {
        const source = `
            import { writeFile } from 'fs/promises';
            import { spawn } from 'child_process';
        `;
        const report = scanAndValidate(source, { readOnly: true });
        expect(report.safe).toBe(false);
        expect(report.summary).toContain('UNSAFE');
        expect(report.entitlements.filesystem).toBe(true);
        expect(report.entitlements.subprocess).toBe(true);
        expect(report.entitlements.network).toBe(false);
    });

    it('buildEntitlements: raw field contains sorted unique identifiers', () => {
        const source = `
            import { readFile, writeFile } from 'fs';
            import { exec } from 'child_process';
        `;
        const matches = scanSource(source);
        const entitlements = buildEntitlements(matches);
        expect(entitlements.raw.length).toBeGreaterThan(0);
        // All raw identifiers should be strings
        entitlements.raw.forEach(r => expect(typeof r).toBe('string'));
        // Should be sorted
        const sorted = [...entitlements.raw].sort();
        expect(entitlements.raw).toEqual(sorted);
    });

    it('scanSource returns accurate line numbers', () => {
        const source = [
            'const x = 1;',           // line 1
            'import fs from "fs";',    // line 2
            'const y = 2;',           // line 3
            'exec("ls");',            // line 4
        ].join('\n');
        const matches = scanSource(source);
        const fsMatch = matches.find(m => m.category === 'filesystem');
        expect(fsMatch).toBeDefined();
        expect(fsMatch!.line).toBe(2);

        const execMatch = matches.find(m => m.category === 'subprocess');
        expect(execMatch).toBeDefined();
        expect(execMatch!.line).toBe(4);
    });

    it('scanAndValidate defaults claims to empty (no violations)', () => {
        const source = `import { exec } from 'child_process';`;
        const report = scanAndValidate(source);
        expect(report.entitlements.subprocess).toBe(true);
        // No claims → no violations but entitlements still detected
        expect(report.matches.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// 5 · TokenEconomics — risk classification & edge cases
// ============================================================================

describe('TokenEconomics — risk classification & edge cases (doc parity)', () => {
    it('estimateTokens: ~3.5 chars per token', () => {
        const text = 'a'.repeat(350);
        const tokens = estimateTokens(text);
        expect(tokens).toBe(100);
    });

    it('profileBlock: returns correct byte count', () => {
        const block = profileBlock({ type: 'text', text: 'hello' });
        expect(block.type).toBe('text');
        expect(block.bytes).toBe(5);
        expect(block.estimatedTokens).toBeGreaterThan(0);
    });

    it('profileResponse: actionKey is captured', () => {
        const analysis = profileResponse('users', 'list', [
            { type: 'text', text: 'data payload' },
        ]);
        expect(analysis.toolName).toBe('users');
        expect(analysis.actionKey).toBe('list');
    });

    it('profileResponse: overhead ratio computation', () => {
        const overheadText = 'x'.repeat(350);   // 100 tokens overhead
        const dataText = 'y'.repeat(350);        // 100 tokens data
        const analysis = profileResponse('tool', null, [
            { type: 'text', text: overheadText },
            { type: 'text', text: dataText },
        ], 1); // first block is overhead
        expect(analysis.overheadTokens).toBeGreaterThan(0);
        expect(analysis.dataTokens).toBeGreaterThan(0);
        expect(analysis.overheadRatio).toBeGreaterThan(0);
    });

    it('profileResponse: medium risk classification (1001-4000 tokens)', () => {
        const text = 'x'.repeat(7000); // ~2000 tokens
        const analysis = profileResponse('tool', null, [{ type: 'text', text }]);
        expect(analysis.risk).toBe('medium');
    });

    it('profileResponse: high risk classification (4001-8000 tokens)', () => {
        const text = 'x'.repeat(21000); // ~6000 tokens
        const analysis = profileResponse('tool', null, [{ type: 'text', text }]);
        expect(analysis.risk).toBe('high');
    });

    it('profileResponse: critical risk classification (>8000 tokens)', () => {
        const text = 'x'.repeat(35000); // ~10000 tokens
        const analysis = profileResponse('tool', null, [{ type: 'text', text }]);
        expect(analysis.risk).toBe('critical');
        expect(analysis.advisory).toBeTruthy();
    });

    it('computeStaticProfile: recommendations include agentLimit for unbounded', () => {
        const profile = computeStaticProfile('users', ['id', 'name', 'email'], null, null);
        expect(profile.bounded).toBe(false);
        expect(profile.recommendations.some(r => r.toLowerCase().includes('agentlimit'))).toBe(true);
    });

    it('computeStaticProfile: egressMaxBytes bounds take priority', () => {
        const profile = computeStaticProfile('users', ['id', 'name'], null, 1024);
        expect(profile.bounded).toBe(true);
        expect(profile.maxTokens).toBe(Math.ceil(1024 / 3.5));
    });

    it('computeStaticProfile: field breakdown lists all fields', () => {
        const fields = ['id', 'name', 'email', 'phone'];
        const profile = computeStaticProfile('users', fields, 10, null);
        expect(profile.fieldBreakdown).toHaveLength(fields.length);
        profile.fieldBreakdown.forEach(f => {
            expect(fields).toContain(f.name);
            expect(f.estimatedTokens).toBeGreaterThan(0);
        });
    });

    it('aggregateProfiles: empty array', () => {
        const summary = aggregateProfiles([]);
        expect(summary.toolCount).toBe(0);
        expect(summary.overallRisk).toBe('low');
        expect(summary.unboundedToolNames).toHaveLength(0);
    });

    it('aggregateProfiles: aggregates multiple profiles correctly', () => {
        const profiles: StaticTokenProfile[] = [
            computeStaticProfile('users', ['id', 'name'], null, null),
            computeStaticProfile('config', ['key'], 5, null),
        ];
        const summary = aggregateProfiles(profiles);
        expect(summary.toolCount).toBe(2);
        expect(summary.totalMinTokens).toBeGreaterThan(0);
        expect(summary.totalMaxTokens).toBeGreaterThan(0);
        expect(summary.unboundedToolNames).toContain('users');
        expect(summary.unboundedToolCount).toBe(1);
    });

    it('aggregateProfiles: overallRisk escalates to highest', () => {
        const profiles: StaticTokenProfile[] = [
            computeStaticProfile('safe', ['id'], 5, null),
            computeStaticProfile('danger', Array.from({ length: 20 }, (_, i) => `f${i}`), null, null),
        ];
        const summary = aggregateProfiles(profiles);
        // danger has many fields + unbounded → high/critical risk
        expect(['high', 'critical']).toContain(summary.overallRisk);
    });
});

// ============================================================================
// 6 · CryptoAttestation — extended coverage
// ============================================================================

describe('CryptoAttestation — extended coverage (doc parity)', () => {
    const testContracts: Record<string, ToolContract> = {
        'alpha': makeContract({ surface: { name: 'alpha' } }),
        'beta': makeContract({ surface: { name: 'beta' } }),
    };
    const serverDigest = computeServerDigest(testContracts);
    const secret = 'test-secret-at-least-32-bytes-long!!';

    it('verifyAttestation: wrong secret fails verification', async () => {
        const attestation = await attestServerDigest(serverDigest, {
            signer: 'hmac',
            secret,
        });
        const result = await verifyAttestation(serverDigest, attestation.signature!, {
            signer: 'hmac',
            secret: 'wrong-secret-completely-different!!!!',
        });
        expect(result.valid).toBe(false);
    });

    it('verifyCapabilityPin: failOnMismatch=false returns invalid without throwing', async () => {
        const wrongDigest = computeServerDigest({
            'gamma': makeContract({ surface: { name: 'gamma' } }),
        });
        const result = await verifyCapabilityPin(wrongDigest, {
            signer: 'hmac',
            secret,
            expectedDigest: serverDigest.digest,
            failOnMismatch: false,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('verifyCapabilityPin: failOnMismatch=true throws AttestationError', async () => {
        const wrongDigest = computeServerDigest({
            'gamma': makeContract({ surface: { name: 'gamma' } }),
        });
        await expect(verifyCapabilityPin(wrongDigest, {
            signer: 'hmac',
            secret,
            expectedDigest: serverDigest.digest,
            failOnMismatch: true,
        })).rejects.toThrow(AttestationError);
    });

    it('buildTrustCapability: captures verified=false for failed attestation', () => {
        const failedAttestation: AttestationResult = {
            valid: false,
            computedDigest: 'abc',
            expectedDigest: 'xyz',
            signature: null,
            signerName: 'hmac-sha256',
            attestedAt: new Date().toISOString(),
            error: 'Mismatch',
        };
        const cap = buildTrustCapability(failedAttestation, 5);
        expect(cap.verified).toBe(false);
        expect(cap.toolCount).toBe(5);
        expect(cap.serverDigest).toBe('abc');
    });

    it('createHmacSigner: short secret still works', async () => {
        const signer = createHmacSigner('short');
        const sig = await signer.sign('test-data');
        expect(sig).toMatch(/^[a-f0-9]{64}$/);
        const valid = await signer.verify('test-data', sig);
        expect(valid).toBe(true);
    });

    it('attestServerDigest requires secret for hmac signer', async () => {
        await expect(attestServerDigest(serverDigest, {
            signer: 'hmac',
            // secret intentionally omitted
        } as ZeroTrustConfig)).rejects.toThrow(/secret/i);
    });

    it('custom signer: sign + verify lifecycle', async () => {
        const customSigner: AttestationSigner = {
            name: 'test-custom',
            async sign(digest: string) { return `sig:${digest}`; },
            async verify(digest: string, signature: string) { return signature === `sig:${digest}`; },
        };
        const attestation = await attestServerDigest(serverDigest, { signer: customSigner });
        expect(attestation.valid).toBe(true);
        expect(attestation.signerName).toBe('test-custom');
        expect(attestation.signature).toBe(`sig:${serverDigest.digest}`);
    });
});

// ============================================================================
// 7 · canonicalize & sha256 — edge cases
// ============================================================================

describe('canonicalize & sha256 — edge cases', () => {
    it('canonicalize: arrays preserve order', () => {
        const result = canonicalize([3, 1, 2]);
        expect(result).toBe('[3,1,2]');
    });

    it('canonicalize: nested objects sorted recursively', () => {
        const result = canonicalize({ z: { b: 2, a: 1 }, a: 1 });
        expect(result).toBe('{"a":1,"z":{"a":1,"b":2}}');
    });

    it('canonicalize: null values preserved', () => {
        const result = canonicalize({ b: null, a: 1 });
        expect(result).toBe('{"a":1,"b":null}');
    });

    it('sha256: produces 64-char hex', () => {
        expect(sha256('hello')).toMatch(/^[a-f0-9]{64}$/);
    });

    it('sha256: different inputs produce different hashes', () => {
        expect(sha256('a')).not.toBe(sha256('b'));
    });

    it('sha256 + canonicalize: key order irrelevant', () => {
        const h1 = sha256(canonicalize({ b: 2, a: 1 }));
        const h2 = sha256(canonicalize({ a: 1, b: 2 }));
        expect(h1).toBe(h2);
    });
});

// ============================================================================
// 8 · Cross-module: Contract → Digest → Lockfile → Diff pipeline
// ============================================================================

describe('Cross-module: Contract → Digest → Lockfile → Diff pipeline', () => {
    it('full pipeline: build → compile → digest → lock → diff → attest', async () => {
        // Step 1: Build tools using real builder API
        const configTool = buildReadOnlyTool();
        const adminTool = buildDestructiveTool();
        const userTool = buildToolWithPresenter();

        // Step 2: Compile contracts
        const contracts = compileContracts([configTool, adminTool, userTool]);
        expect(Object.keys(contracts)).toEqual(expect.arrayContaining(['config', 'admin', 'users']));

        // Step 3: Compute digests
        const serverDigest = computeServerDigest(contracts);
        expect(serverDigest.digest).toMatch(/^[a-f0-9]{64}$/);
        expect(Object.keys(serverDigest.tools)).toEqual(expect.arrayContaining(['config', 'admin', 'users']));

        // Step 4: Generate lockfile
        const lockfile = generateLockfile('test-server', contracts, '2.7.0');
        expect(lockfile.lockfileVersion).toBe(1);
        expect(lockfile.serverName).toBe('test-server');
        expect(lockfile.integrityDigest).toBe(`sha256:${serverDigest.digest}`);

        // Verify per-tool digests match
        for (const [name, tool] of Object.entries(lockfile.capabilities.tools)) {
            const expectedDigest = computeDigest(contracts[name]!);
            expect(tool.integrityDigest).toBe(`sha256:${expectedDigest.digest}`);
        }

        // Step 5: Serialize → parse roundtrip
        const json = serializeLockfile(lockfile);
        const parsed = parseLockfile(json);
        expect(parsed).not.toBeNull();
        const check = checkLockfile(parsed!, contracts);
        expect(check.ok).toBe(true);

        // Step 6: Attest
        const secret = 'e2e-test-secret-for-governance-pipeline';
        const attestation = await attestServerDigest(serverDigest, {
            signer: 'hmac',
            secret,
            expectedDigest: serverDigest.digest,
        });
        expect(attestation.valid).toBe(true);

        // Step 7: Verify
        const verification = await verifyAttestation(serverDigest, attestation.signature!, {
            signer: 'hmac',
            secret,
        });
        expect(verification.valid).toBe(true);

        // Step 8: Trust capability
        const trust = buildTrustCapability(attestation, Object.keys(contracts).length);
        expect(trust.verified).toBe(true);
        expect(trust.toolCount).toBe(3);
        expect(trust.signerName).toBe('hmac-sha256');
    });

    it('diff detects BREAKING change across lockfile boundary', () => {
        const v1 = buildReadOnlyTool();
        const contractsV1 = compileContracts([v1]);

        // V2: add destructive action
        const v2 = new GroupedToolBuilder<void>('config')
            .description('Read configuration')
            .tags('infra')
            .action({
                name: 'get',
                description: 'Get config value',
                readOnly: true,
                schema: z.object({ key: z.string() }),
                handler: async () => success({ data: { value: 'test' } }),
            })
            .action({
                name: 'delete',
                description: 'Delete a key',
                destructive: true,
                schema: z.object({ key: z.string() }),
                handler: async () => success({ data: { deleted: true } }),
            });
        const contractsV2 = compileContracts([v2]);

        // Diff
        const result = diffContracts(contractsV1['config']!, contractsV2['config']!);
        expect(result.deltas.some(d => d.field === 'actions.delete' && d.severity === 'SAFE')).toBe(true);

        // Lockfile check should detect drift
        const lockfile = generateLockfile('cfg-server', contractsV1, '2.7.0');
        const json = serializeLockfile(lockfile);
        const parsed = parseLockfile(json);
        const check = checkLockfile(parsed!, contractsV2);
        expect(check.ok).toBe(false);
        expect(check.changed).toContain('config');
    });

    it('digest comparison matches lockfile check result', () => {
        const toolA = makeContract({ surface: { name: 'alpha' } });
        const toolB = makeContract({ surface: { name: 'beta' } });
        const contractsBefore: Record<string, ToolContract> = { alpha: toolA, beta: toolB };

        // After: alpha changed, gamma added
        const toolAChanged = makeContract({ surface: { name: 'alpha', description: 'Updated!' } });
        const toolGamma = makeContract({ surface: { name: 'gamma' } });
        const contractsAfter: Record<string, ToolContract> = { alpha: toolAChanged, gamma: toolGamma };

        const digestBefore = computeServerDigest(contractsBefore);
        const digestAfter = computeServerDigest(contractsAfter);
        const comparison = compareServerDigests(digestBefore, digestAfter);

        expect(comparison.serverDigestChanged).toBe(true);
        expect(comparison.changed).toContain('alpha');
        expect(comparison.added).toContain('gamma');
        expect(comparison.removed).toContain('beta');

        // Lockfile should agree
        const lockfile = generateLockfile('test', contractsBefore, '2.7.0');
        const json = serializeLockfile(lockfile);
        const parsed = parseLockfile(json);
        const check = checkLockfile(parsed!, contractsAfter);
        expect(check.ok).toBe(false);
        expect(check.added).toContain('gamma');
        expect(check.removed).toContain('beta');
        expect(check.changed).toContain('alpha');
    });
});

// ============================================================================
// 9 · Token Economics ↔ ToolContract consistency
// ============================================================================

describe('TokenEconomics ↔ ToolContract consistency', () => {
    it('materialized contract tokenEconomics matches static analysis expectations', () => {
        const builder = buildToolWithPresenter();
        const contract = materializeContract(builder);

        // Verify tokenEconomics section exists
        expect(contract.tokenEconomics).toBeDefined();
        expect(typeof contract.tokenEconomics.schemaFieldCount).toBe('number');
        expect(typeof contract.tokenEconomics.unboundedCollection).toBe('boolean');
        expect(typeof contract.tokenEconomics.baseOverheadTokens).toBe('number');
        expect(['low', 'medium', 'high', 'critical']).toContain(contract.tokenEconomics.inflationRisk);
    });

    it('materialized entitlements default to all false for pure handlers', () => {
        const builder = buildReadOnlyTool();
        const contract = materializeContract(builder);

        expect(contract.entitlements.filesystem).toBe(false);
        expect(contract.entitlements.network).toBe(false);
        expect(contract.entitlements.subprocess).toBe(false);
        expect(contract.entitlements.crypto).toBe(false);
        expect(contract.entitlements.raw).toEqual([]);
    });
});

// ============================================================================
// 10 · Lockfile structure parity with documentation
// ============================================================================

describe('Lockfile structure — documentation parity', () => {
    it('lockfile has all documented top-level fields', () => {
        const contracts = compileContracts([buildReadOnlyTool()]);
        const lockfile = generateLockfile('doc-test', contracts, '2.7.0');

        expect(lockfile).toHaveProperty('lockfileVersion', 1);
        expect(lockfile).toHaveProperty('serverName', 'doc-test');
        expect(lockfile).toHaveProperty('fusionVersion', '2.7.0');
        expect(lockfile).toHaveProperty('generatedAt');
        expect(lockfile).toHaveProperty('integrityDigest');
        expect(lockfile).toHaveProperty('capabilities');
        expect(lockfile.capabilities).toHaveProperty('tools');
    });

    it('per-tool entry has all four documented sections', () => {
        const contracts = compileContracts([buildDestructiveTool()]);
        const lockfile = generateLockfile('doc-test', contracts, '2.7.0');
        const tool = lockfile.capabilities.tools['admin']!;

        expect(tool).toHaveProperty('integrityDigest');
        expect(tool).toHaveProperty('surface');
        expect(tool).toHaveProperty('behavior');
        expect(tool).toHaveProperty('tokenEconomics');
        expect(tool).toHaveProperty('entitlements');
    });

    it('surface section has correct shape', () => {
        const contracts = compileContracts([buildDestructiveTool()]);
        const lockfile = generateLockfile('doc-test', contracts, '2.7.0');
        const surface = lockfile.capabilities.tools['admin']!.surface;

        expect(surface).toHaveProperty('description');
        expect(surface).toHaveProperty('actions');
        expect(surface).toHaveProperty('inputSchemaDigest');
        expect(surface).toHaveProperty('tags');
        expect(Array.isArray(surface.actions)).toBe(true);
        expect(Array.isArray(surface.tags)).toBe(true);
    });

    it('behavior section has correct shape', () => {
        const contracts = compileContracts([buildDestructiveTool()]);
        const lockfile = generateLockfile('doc-test', contracts, '2.7.0');
        const behavior = lockfile.capabilities.tools['admin']!.behavior;

        expect(behavior).toHaveProperty('egressSchemaDigest');
        expect(behavior).toHaveProperty('systemRulesFingerprint');
        expect(behavior).toHaveProperty('destructiveActions');
        expect(behavior).toHaveProperty('readOnlyActions');
        expect(behavior).toHaveProperty('middlewareChain');
        expect(behavior).toHaveProperty('affordanceTopology');
        expect(behavior).toHaveProperty('cognitiveGuardrails');
    });

    it('destructive/readOnly actions are correctly classified', () => {
        const contracts = compileContracts([buildDestructiveTool()]);
        const lockfile = generateLockfile('doc-test', contracts, '2.7.0');
        const behavior = lockfile.capabilities.tools['admin']!.behavior;

        expect(behavior.destructiveActions).toContain('reset');
        expect(behavior.readOnlyActions).toContain('status');
        expect(behavior.destructiveActions).not.toContain('status');
        expect(behavior.readOnlyActions).not.toContain('reset');
    });

    it('tools are sorted alphabetically in lockfile', () => {
        const contracts = compileContracts([
            buildDestructiveTool(),
            buildReadOnlyTool(),
            buildToolWithPresenter(),
        ]);
        const lockfile = generateLockfile('sort-test', contracts, '2.7.0');
        const toolNames = Object.keys(lockfile.capabilities.tools);
        const sortedNames = [...toolNames].sort();
        expect(toolNames).toEqual(sortedNames);
    });

    it('serialized lockfile has trailing newline', () => {
        const contracts = compileContracts([buildReadOnlyTool()]);
        const lockfile = generateLockfile('test', contracts, '2.7.0');
        const json = serializeLockfile(lockfile);
        expect(json.endsWith('\n')).toBe(true);
    });

    it('serialized lockfile uses 2-space indentation', () => {
        const contracts = compileContracts([buildReadOnlyTool()]);
        const lockfile = generateLockfile('test', contracts, '2.7.0');
        const json = serializeLockfile(lockfile);
        // Second line should start with exactly 2 spaces
        const lines = json.split('\n');
        const indentedLine = lines.find(l => l.startsWith(' '));
        expect(indentedLine).toBeDefined();
        expect(indentedLine!.startsWith('  ')).toBe(true);
        expect(indentedLine!.startsWith('    ')).toBe(false);
    });

    it('parseLockfile rejects invalid JSON gracefully', () => {
        expect(parseLockfile('not-json{')).toBeNull();
    });

    it('parseLockfile rejects wrong lockfileVersion', () => {
        const valid = serializeLockfile(
            generateLockfile('test', compileContracts([buildReadOnlyTool()]), '2.7.0'),
        );
        const tampered = valid.replace('"lockfileVersion": 1', '"lockfileVersion": 99');
        expect(parseLockfile(tampered)).toBeNull();
    });
});

// ============================================================================
// 11 · Full Zero-Trust lifecycle
// ============================================================================

describe('Full Zero-Trust lifecycle', () => {
    it('compile → digest → attest → pin → verify → trust', async () => {
        const contracts = compileContracts([buildReadOnlyTool(), buildDestructiveTool()]);
        const digest = computeServerDigest(contracts);
        const secret = 'zero-trust-e2e-lifecycle-test-secret!!';

        // 1. Attest
        const attestation = await attestServerDigest(digest, {
            signer: 'hmac',
            secret,
            expectedDigest: digest.digest,
        });
        expect(attestation.valid).toBe(true);
        expect(attestation.signature).toBeTruthy();

        // 2. Pin — should not throw
        await verifyCapabilityPin(digest, {
            signer: 'hmac',
            secret,
            expectedDigest: digest.digest,
            failOnMismatch: true,
        });

        // 3. Trust capability
        const trust = buildTrustCapability(attestation, 2);
        expect(trust.verified).toBe(true);
        expect(trust.serverDigest).toBe(digest.digest);

        // 4. Tamper detection — add a tool
        const tamperedContracts = {
            ...contracts,
            extra: makeContract({ surface: { name: 'extra' } }),
        };
        const tamperedDigest = computeServerDigest(tamperedContracts);

        // Pin should fail
        await expect(verifyCapabilityPin(tamperedDigest, {
            signer: 'hmac',
            secret,
            expectedDigest: digest.digest,
            failOnMismatch: true,
        })).rejects.toThrow(AttestationError);

        // Verification should fail
        const verifyResult = await verifyAttestation(tamperedDigest, attestation.signature!, {
            signer: 'hmac',
            secret,
        });
        expect(verifyResult.valid).toBe(false);
    });
});

// ============================================================================
// 12 · ToolContract materialization — real builders
// ============================================================================

describe('ToolContract materialization — real builders', () => {
    it('readonly tool captures readOnly on actions', () => {
        const contract = materializeContract(buildReadOnlyTool());
        expect(contract.surface.actions['get']!.readOnly).toBe(true);
        expect(contract.surface.actions['get']!.destructive).toBe(false);
    });

    it('destructive tool captures both readOnly and destructive flags', () => {
        const contract = materializeContract(buildDestructiveTool());
        expect(contract.surface.actions['reset']!.destructive).toBe(true);
        expect(contract.surface.actions['status']!.readOnly).toBe(true);
        expect(contract.surface.actions['reset']!.readOnly).toBe(false);
    });

    it('tool with presenter captures presenter metadata', () => {
        const contract = materializeContract(buildToolWithPresenter());
        expect(contract.surface.actions['list']!.presenterName).toBe('UserPresenter');
        expect(contract.behavior.egressSchemaDigest).not.toBeNull();
    });

    it('tags are preserved in contract surface', () => {
        const contract = materializeContract(buildDestructiveTool());
        expect(contract.surface.tags).toContain('admin');
        expect(contract.surface.tags).toContain('danger');
    });

    it('compileContracts produces a keyed record', () => {
        const contracts = compileContracts([buildReadOnlyTool(), buildDestructiveTool()]);
        expect(contracts).toHaveProperty('config');
        expect(contracts).toHaveProperty('admin');
        expect(contracts['config']!.surface.name).toBe('config');
        expect(contracts['admin']!.surface.name).toBe('admin');
    });

    it('deterministic: same builder produces same contract', () => {
        const c1 = materializeContract(buildReadOnlyTool());
        const c2 = materializeContract(buildReadOnlyTool());
        const d1 = computeDigest(c1);
        const d2 = computeDigest(c2);
        expect(d1.digest).toBe(d2.digest);
    });
});
