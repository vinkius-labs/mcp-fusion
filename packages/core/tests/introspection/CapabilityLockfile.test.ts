/**
 * CapabilityLockfile Tests
 *
 * Verifies lockfile generation, serialization, verification,
 * and the `fusion lock --check` CI gate semantics.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import {
    generateLockfile,
    serializeLockfile,
    checkLockfile,
    parseLockfile,
    LOCKFILE_NAME,
} from '../../src/introspection/CapabilityLockfile.js';
import type {
    CapabilityLockfile,
    LockfileTool,
} from '../../src/introspection/CapabilityLockfile.js';
import type { ToolContract } from '../../src/introspection/ToolContract.js';
import { sha256 } from '../../src/introspection/ToolContract.js';

// ============================================================================
// Helpers
// ============================================================================

function createContract(overrides: Partial<{
    name: string;
    description: string;
    actions: Record<string, { destructive: boolean; readOnly: boolean }>;
    egressSchemaDigest: string | null;
    systemRulesFingerprint: string;
    inflationRisk: 'low' | 'medium' | 'high' | 'critical';
    filesystem: boolean;
    network: boolean;
}> = {}): ToolContract {
    const name = overrides.name ?? 'users';
    const actions = overrides.actions ?? {
        list: { destructive: false, readOnly: true },
        create: { destructive: false, readOnly: false },
        delete: { destructive: true, readOnly: false },
    };

    const actionContracts: Record<string, ToolContract['surface']['actions'][string]> = {};
    for (const [key, meta] of Object.entries(actions)) {
        actionContracts[key] = {
            description: `${key} action`,
            destructive: meta.destructive,
            idempotent: false,
            readOnly: meta.readOnly,
            requiredFields: [],
            presenterName: undefined,
            inputSchemaDigest: sha256(`${key}-schema`),
            hasMiddleware: false,
        };
    }

    return {
        surface: {
            name,
            description: overrides.description ?? `Manage ${name}`,
            tags: ['crud'],
            inputSchemaDigest: sha256(`${name}-schema`),
            actions: actionContracts,
        },
        behavior: {
            egressSchemaDigest: overrides.egressSchemaDigest ?? sha256('egress-v1'),
            systemRulesFingerprint: overrides.systemRulesFingerprint ?? 'static:abc',
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
            inflationRisk: overrides.inflationRisk ?? 'low',
        },
        entitlements: {
            filesystem: overrides.filesystem ?? false,
            network: overrides.network ?? false,
            subprocess: false,
            crypto: false,
            raw: [],
        },
    };
}

// ============================================================================
// LOCKFILE_NAME
// ============================================================================

describe('LOCKFILE_NAME', () => {
    it('is mcp-fusion.lock', () => {
        expect(LOCKFILE_NAME).toBe('mcp-fusion.lock');
    });
});

// ============================================================================
// generateLockfile
// ============================================================================

describe('generateLockfile', () => {
    it('generates a valid lockfile from contracts', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
        };

        const lockfile = generateLockfile('my-server', contracts, '1.1.0');

        expect(lockfile.lockfileVersion).toBe(1);
        expect(lockfile.serverName).toBe('my-server');
        expect(lockfile.fusionVersion).toBe('1.1.0');
        expect(lockfile.integrityDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(lockfile.generatedAt).toBeTruthy();
    });

    it('captures all tools in capabilities', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const toolNames = Object.keys(lockfile.capabilities.tools);

        expect(toolNames).toContain('users');
        expect(toolNames).toContain('tasks');
    });

    it('sorts tool names alphabetically', () => {
        const contracts = {
            zebra: createContract({ name: 'zebra' }),
            alpha: createContract({ name: 'alpha' }),
            middle: createContract({ name: 'middle' }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const toolNames = Object.keys(lockfile.capabilities.tools);

        expect(toolNames).toEqual(['alpha', 'middle', 'zebra']);
    });

    it('captures tool surface correctly', () => {
        const contracts = {
            users: createContract({
                name: 'users',
                description: 'Manage users',
            }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const tool = lockfile.capabilities.tools['users']!;

        expect(tool.surface.description).toBe('Manage users');
        expect(tool.surface.actions).toEqual(['create', 'delete', 'list']); // sorted
        expect(tool.surface.inputSchemaDigest).toMatch(/^sha256:/);
        expect(tool.surface.tags).toEqual(['crud']);
    });

    it('captures destructive and readOnly action hints', () => {
        const contracts = {
            tasks: createContract({
                name: 'tasks',
                actions: {
                    list: { destructive: false, readOnly: true },
                    delete_all: { destructive: true, readOnly: false },
                },
            }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const tool = lockfile.capabilities.tools['tasks']!;

        expect(tool.behavior.destructiveActions).toEqual(['delete_all']);
        expect(tool.behavior.readOnlyActions).toEqual(['list']);
    });

    it('captures entitlements', () => {
        const contracts = {
            upload: createContract({
                name: 'upload',
                filesystem: true,
                network: true,
            }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const tool = lockfile.capabilities.tools['upload']!;

        expect(tool.entitlements.filesystem).toBe(true);
        expect(tool.entitlements.network).toBe(true);
        expect(tool.entitlements.subprocess).toBe(false);
        expect(tool.entitlements.crypto).toBe(false);
    });

    it('captures token economics', () => {
        const contracts = {
            heavy: createContract({
                name: 'heavy',
                inflationRisk: 'critical',
            }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const tool = lockfile.capabilities.tools['heavy']!;

        expect(tool.tokenEconomics.inflationRisk).toBe('critical');
        expect(tool.tokenEconomics.schemaFieldCount).toBe(3);
        expect(tool.tokenEconomics.unboundedCollection).toBe(false);
    });

    it('captures behavior metadata', () => {
        const contracts = {
            users: createContract({
                name: 'users',
                egressSchemaDigest: sha256('egress'),
                systemRulesFingerprint: 'dynamic',
            }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const tool = lockfile.capabilities.tools['users']!;

        expect(tool.behavior.egressSchemaDigest).toMatch(/^sha256:/);
        expect(tool.behavior.systemRulesFingerprint).toBe('dynamic');
        expect(tool.behavior.cognitiveGuardrails.agentLimitMax).toBe(50);
    });

    it('produces per-tool integrity digests', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const tool = lockfile.capabilities.tools['users']!;

        expect(tool.integrityDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('is deterministic — same contracts produce same digests', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
        };

        const lockfile1 = generateLockfile('srv', contracts, '1.1.0');
        const lockfile2 = generateLockfile('srv', contracts, '1.1.0');

        expect(lockfile1.integrityDigest).toBe(lockfile2.integrityDigest);
        expect(lockfile1.capabilities.tools['users']!.integrityDigest)
            .toBe(lockfile2.capabilities.tools['users']!.integrityDigest);
    });

    it('handles empty server (no tools)', () => {
        const lockfile = generateLockfile('empty-server', {}, '1.1.0');

        expect(lockfile.lockfileVersion).toBe(1);
        expect(Object.keys(lockfile.capabilities.tools)).toHaveLength(0);
        expect(lockfile.integrityDigest).toMatch(/^sha256:/);
    });
});

// ============================================================================
// serializeLockfile
// ============================================================================

describe('serializeLockfile', () => {
    it('produces valid JSON with trailing newline', () => {
        const lockfile = generateLockfile('srv', {
            users: createContract({ name: 'users' }),
        }, '1.1.0');

        const serialized = serializeLockfile(lockfile);

        expect(serialized.endsWith('\n')).toBe(true);
        expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('uses 2-space indentation', () => {
        const lockfile = generateLockfile('srv', {
            users: createContract({ name: 'users' }),
        }, '1.1.0');

        const serialized = serializeLockfile(lockfile);
        const lines = serialized.split('\n');

        // Second line should be 2-space indented
        expect(lines[1]).toMatch(/^ {2}"/);
    });

    it('is deterministic — same lockfile produces same string (except timestamp)', () => {
        const contracts = { users: createContract({ name: 'users' }) };
        const lockfile1 = generateLockfile('srv', contracts, '1.1.0');
        const lockfile2 = { ...lockfile1 }; // same timestamp

        const s1 = serializeLockfile(lockfile1);
        const s2 = serializeLockfile(lockfile2);

        expect(s1).toBe(s2);
    });
});

// ============================================================================
// parseLockfile
// ============================================================================

describe('parseLockfile', () => {
    it('parses a valid lockfile', () => {
        const lockfile = generateLockfile('srv', {
            users: createContract({ name: 'users' }),
        }, '1.1.0');

        const serialized = serializeLockfile(lockfile);
        const parsed = parseLockfile(serialized);

        expect(parsed).not.toBeNull();
        expect(parsed!.lockfileVersion).toBe(1);
        expect(parsed!.serverName).toBe('srv');
        expect(parsed!.integrityDigest).toBe(lockfile.integrityDigest);
    });

    it('returns null for invalid JSON', () => {
        expect(parseLockfile('not json')).toBeNull();
    });

    it('returns null for wrong version', () => {
        expect(parseLockfile('{"lockfileVersion": 999}')).toBeNull();
    });

    it('returns null for missing required fields', () => {
        expect(parseLockfile('{"lockfileVersion": 1}')).toBeNull();
    });

    it('returns null for missing generatedAt', () => {
        expect(parseLockfile(JSON.stringify({
            lockfileVersion: 1,
            serverName: 'srv',
            integrityDigest: 'sha256:abc',
            fusionVersion: '1.0.0',
            capabilities: { tools: {} },
        }))).toBeNull();
    });

    it('returns null for missing fusionVersion', () => {
        expect(parseLockfile(JSON.stringify({
            lockfileVersion: 1,
            serverName: 'srv',
            integrityDigest: 'sha256:abc',
            generatedAt: '2025-01-01T00:00:00Z',
            capabilities: { tools: {} },
        }))).toBeNull();
    });

    it('returns null for missing capabilities.tools', () => {
        expect(parseLockfile(JSON.stringify({
            lockfileVersion: 1,
            serverName: 'srv',
            integrityDigest: 'sha256:abc',
            generatedAt: '2025-01-01T00:00:00Z',
            fusionVersion: '1.0.0',
            capabilities: {},
        }))).toBeNull();
    });

    it('roundtrips cleanly', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
        };

        const original = generateLockfile('srv', contracts, '1.1.0');
        const serialized = serializeLockfile(original);
        const parsed = parseLockfile(serialized)!;

        expect(parsed.lockfileVersion).toBe(original.lockfileVersion);
        expect(parsed.serverName).toBe(original.serverName);
        expect(parsed.integrityDigest).toBe(original.integrityDigest);
        expect(Object.keys(parsed.capabilities.tools)).toEqual(
            Object.keys(original.capabilities.tools),
        );
    });
});

// ============================================================================
// checkLockfile
// ============================================================================

describe('checkLockfile', () => {
    it('returns ok when lockfile matches current contracts', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
        };

        const lockfile = generateLockfile('srv', contracts, '1.1.0');
        const result = checkLockfile(lockfile, contracts);

        expect(result.ok).toBe(true);
        expect(result.message).toContain('up to date');
        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
        expect(result.changed).toHaveLength(0);
        expect(result.unchanged).toEqual(['tasks', 'users']);
    });

    it('detects added tools', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
        };
        const lockfile = generateLockfile('srv', contracts, '1.1.0');

        // Add a new tool
        const updated = {
            ...contracts,
            tasks: createContract({ name: 'tasks' }),
        };

        const result = checkLockfile(lockfile, updated);

        expect(result.ok).toBe(false);
        expect(result.added).toContain('tasks');
        expect(result.message).toContain('stale');
        expect(result.message).toContain('fusion lock');
    });

    it('detects removed tools', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
        };
        const lockfile = generateLockfile('srv', contracts, '1.1.0');

        // Remove a tool
        const { tasks: _, ...remaining } = contracts;

        const result = checkLockfile(lockfile, remaining);

        expect(result.ok).toBe(false);
        expect(result.removed).toContain('tasks');
    });

    it('detects changed tools', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
        };
        const lockfile = generateLockfile('srv', contracts, '1.1.0');

        // Change the tool's behavior
        const updated = {
            users: createContract({
                name: 'users',
                systemRulesFingerprint: 'changed-fingerprint',
            }),
        };

        const result = checkLockfile(lockfile, updated);

        expect(result.ok).toBe(false);
        expect(result.changed).toContain('users');
    });

    it('reports unchanged tools alongside changes', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
            projects: createContract({ name: 'projects' }),
        };
        const lockfile = generateLockfile('srv', contracts, '1.1.0');

        // Change only tasks
        const updated = {
            ...contracts,
            tasks: createContract({
                name: 'tasks',
                egressSchemaDigest: sha256('changed-egress'),
            }),
        };

        const result = checkLockfile(lockfile, updated);

        expect(result.ok).toBe(false);
        expect(result.changed).toEqual(['tasks']);
        expect(result.unchanged).toContain('users');
        expect(result.unchanged).toContain('projects');
        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
    });

    it('detects simultaneous add, remove, and change', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
        };
        const lockfile = generateLockfile('srv', contracts, '1.1.0');

        // Remove tasks, change users, add projects
        const updated = {
            users: createContract({
                name: 'users',
                filesystem: true, // behavioral change
            }),
            projects: createContract({ name: 'projects' }),
        };

        const result = checkLockfile(lockfile, updated);

        expect(result.ok).toBe(false);
        expect(result.added).toContain('projects');
        expect(result.removed).toContain('tasks');
        expect(result.changed).toContain('users');
    });

    it('message suggests running fusion lock', () => {
        const lockfile = generateLockfile('srv', {
            users: createContract({ name: 'users' }),
        }, '1.1.0');

        const result = checkLockfile(lockfile, {});

        expect(result.ok).toBe(false);
        expect(result.message).toContain('fusion lock');
    });
});

// ============================================================================
// Integration: full workflow
// ============================================================================

describe('Lockfile workflow', () => {
    it('generate → serialize → parse → check roundtrip', () => {
        const contracts = {
            users: createContract({ name: 'users' }),
            tasks: createContract({ name: 'tasks' }),
        };

        // Step 1: Generate
        const lockfile = generateLockfile('demo-server', contracts, '1.1.0');

        // Step 2: Serialize (simulates writing to disk)
        const json = serializeLockfile(lockfile);

        // Step 3: Parse (simulates reading from disk)
        const parsed = parseLockfile(json)!;
        expect(parsed).not.toBeNull();

        // Step 4: Check (simulates CI gate)
        const result = checkLockfile(parsed, contracts);
        expect(result.ok).toBe(true);
    });

    it('detects behavioral drift after code change', () => {
        // Initial state
        const v1Contracts = {
            users: createContract({ name: 'users', description: 'V1' }),
        };
        const lockfile = generateLockfile('srv', v1Contracts, '1.1.0');
        const json = serializeLockfile(lockfile);

        // Developer changes code (adds filesystem access)
        const v2Contracts = {
            users: createContract({ name: 'users', description: 'V1', filesystem: true }),
        };

        // CI runs `fusion lock --check`
        const parsed = parseLockfile(json)!;
        const result = checkLockfile(parsed, v2Contracts);

        // CI should fail — behavioral surface changed
        expect(result.ok).toBe(false);
        expect(result.changed).toContain('users');
    });

    it('lockfile format matches expected structure', () => {
        const contracts = {
            task: createContract({
                name: 'task',
                actions: {
                    list: { destructive: false, readOnly: true },
                    create: { destructive: false, readOnly: false },
                    delete_all: { destructive: true, readOnly: false },
                },
            }),
        };

        const lockfile = generateLockfile('protocol-gap-demo', contracts, '1.1.0');
        const tool = lockfile.capabilities.tools['task']!;

        // Verify structure matches the documented format
        expect(lockfile).toHaveProperty('lockfileVersion', 1);
        expect(lockfile).toHaveProperty('serverName', 'protocol-gap-demo');
        expect(lockfile).toHaveProperty('fusionVersion', '1.1.0');
        expect(lockfile).toHaveProperty('generatedAt');
        expect(lockfile).toHaveProperty('integrityDigest');
        expect(lockfile).toHaveProperty('capabilities.tools.task');

        // Tool structure
        expect(tool).toHaveProperty('integrityDigest');
        expect(tool).toHaveProperty('surface.actions');
        expect(tool).toHaveProperty('surface.inputSchemaDigest');
        expect(tool).toHaveProperty('behavior.destructiveActions');
        expect(tool).toHaveProperty('behavior.readOnlyActions');
        expect(tool).toHaveProperty('behavior.middlewareChain');
        expect(tool).toHaveProperty('behavior.cognitiveGuardrails');
        expect(tool).toHaveProperty('tokenEconomics.inflationRisk');
        expect(tool).toHaveProperty('entitlements.filesystem');

        // Action classification
        expect(tool.behavior.destructiveActions).toContain('delete_all');
        expect(tool.behavior.readOnlyActions).toContain('list');
        expect(tool.surface.actions).toEqual(['create', 'delete_all', 'list']);
    });
});
