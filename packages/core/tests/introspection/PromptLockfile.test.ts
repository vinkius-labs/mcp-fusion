/**
 * PromptLockfile Tests
 *
 * Verifies that prompts are correctly snapshotted in the lockfile,
 * that checkLockfile detects prompt drift, and that the serialized
 * format is deterministic and git-diffable.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import {
    generateLockfile,
    serializeLockfile,
    checkLockfile,
    parseLockfile,
} from '../../src/introspection/CapabilityLockfile.js';
import type {
    PromptBuilderLike,
    LockfilePrompt,
} from '../../src/introspection/CapabilityLockfile.js';
import type { ToolContract } from '../../src/introspection/ToolContract.js';
import { sha256, canonicalize } from '../../src/introspection/ToolContract.js';

// ============================================================================
// Helpers
// ============================================================================

/** Minimal ToolContract factory for tests that need at least one tool. */
function createContract(name = 'test-tool'): ToolContract {
    return {
        surface: {
            name,
            description: `Manage ${name}`,
            tags: ['test'],
            inputSchemaDigest: sha256(`${name}-schema`),
            actions: {
                run: {
                    description: 'Run action',
                    destructive: false,
                    idempotent: true,
                    readOnly: true,
                    requiredFields: [],
                    presenterName: undefined,
                    inputSchemaDigest: sha256('run-schema'),
                    hasMiddleware: false,
                },
            },
        },
        behavior: {
            egressSchemaDigest: null,
            systemRulesFingerprint: 'static:none',
            cognitiveGuardrails: { agentLimitMax: null, egressMaxBytes: null },
            middlewareChain: [],
            stateSyncFingerprint: null,
            concurrencyFingerprint: null,
            affordanceTopology: [],
            embeddedPresenters: [],
        },
        tokenEconomics: {
            schemaFieldCount: 1,
            unboundedCollection: false,
            baseOverheadTokens: 20,
            inflationRisk: 'low',
        },
        entitlements: {
            filesystem: false,
            network: false,
            subprocess: false,
            crypto: false,
            raw: [],
        },
    };
}

/** Fake PromptBuilder for testing — implements PromptBuilderLike duck type. */
function createPromptBuilder(overrides: Partial<{
    name: string;
    title: string;
    description: string;
    tags: string[];
    hasMiddleware: boolean;
    hydrationTimeout: number;
    arguments: Array<{ name: string; description?: string; required?: boolean }>;
}> = {}): PromptBuilderLike {
    const name = overrides.name ?? 'test-prompt';
    const title = overrides.title;
    const description = overrides.description;
    const tags = overrides.tags ?? [];
    const mw = overrides.hasMiddleware ?? false;
    const timeout = overrides.hydrationTimeout;
    const args = overrides.arguments ?? [];

    return {
        getName: () => name,
        getDescription: () => description,
        getTags: () => tags,
        hasMiddleware: () => mw,
        getHydrationTimeout: () => timeout,
        buildPromptDefinition: () => {
            const def: ReturnType<PromptBuilderLike['buildPromptDefinition']> = { name };
            if (title) def.title = title;
            if (description) def.description = description;
            if (args.length > 0) def.arguments = args;
            return def;
        },
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('Prompt Lockfile — generateLockfile with prompts', () => {
    it('generates lockfile with prompts section when prompts are provided', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'greet', description: 'Greeting prompt' })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });

        expect(lockfile.capabilities.prompts).toBeDefined();
        expect(lockfile.capabilities.prompts!['greet']).toBeDefined();
    });

    it('omits prompts section when no prompts are provided', () => {
        const contracts = { tool: createContract('tool') };
        const lockfile = generateLockfile('test-server', contracts, '1.0.0');

        expect(lockfile.capabilities.prompts).toBeUndefined();
    });

    it('omits prompts section when empty prompts array is provided', () => {
        const contracts = { tool: createContract('tool') };
        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts: [] });

        expect(lockfile.capabilities.prompts).toBeUndefined();
    });

    it('sorts prompts alphabetically by name', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [
            createPromptBuilder({ name: 'zebra' }),
            createPromptBuilder({ name: 'alpha' }),
            createPromptBuilder({ name: 'middle' }),
        ];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const keys = Object.keys(lockfile.capabilities.prompts!);

        expect(keys).toEqual(['alpha', 'middle', 'zebra']);
    });

    it('captures prompt description and title', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({
            name: 'audit',
            title: 'Daily Audit',
            description: 'Generates a daily audit report',
        })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['audit']!;

        expect(entry.description).toBe('Generates a daily audit report');
        expect(entry.title).toBe('Daily Audit');
    });

    it('captures null for missing description and title', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'bare' })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['bare']!;

        expect(entry.description).toBeNull();
        expect(entry.title).toBeNull();
    });

    it('captures sorted tags', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({
            name: 'tagged',
            tags: ['compliance', 'audit', 'billing'],
        })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['tagged']!;

        expect(entry.tags).toEqual(['audit', 'billing', 'compliance']);
    });

    it('captures argument definitions sorted by name', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({
            name: 'with-args',
            arguments: [
                { name: 'date', description: 'Target date', required: true },
                { name: 'account_id', required: true },
                { name: 'format', description: 'Output format', required: false },
            ],
        })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['with-args']!;

        expect(entry.arguments).toHaveLength(3);
        // Sorted alphabetically by name
        expect(entry.arguments[0]!.name).toBe('account_id');
        expect(entry.arguments[1]!.name).toBe('date');
        expect(entry.arguments[2]!.name).toBe('format');
        // Required flags
        expect(entry.arguments[0]!.required).toBe(true);
        expect(entry.arguments[1]!.required).toBe(true);
        expect(entry.arguments[2]!.required).toBe(false);
        // Descriptions
        expect(entry.arguments[0]!.description).toBeNull(); // not provided
        expect(entry.arguments[1]!.description).toBe('Target date');
        expect(entry.arguments[2]!.description).toBe('Output format');
    });

    it('captures empty arguments array when no args defined', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'no-args' })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['no-args']!;

        expect(entry.arguments).toEqual([]);
    });

    it('computes argumentsDigest from canonical arguments', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({
            name: 'digest-test',
            arguments: [
                { name: 'b', required: true },
                { name: 'a', description: 'First arg', required: false },
            ],
        })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['digest-test']!;

        expect(entry.argumentsDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        // Manually compute expected digest
        const sortedArgs = [
            { name: 'a', description: 'First arg', required: false },
            { name: 'b', description: null, required: true },
        ];
        const expected = `sha256:${sha256(canonicalize(sortedArgs))}`;
        expect(entry.argumentsDigest).toBe(expected);
    });

    it('captures hasMiddleware flag', () => {
        const contracts = { tool: createContract('tool') };
        const withMw = createPromptBuilder({ name: 'with-mw', hasMiddleware: true });
        const withoutMw = createPromptBuilder({ name: 'without-mw', hasMiddleware: false });

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts: [withMw, withoutMw] });

        expect(lockfile.capabilities.prompts!['with-mw']!.hasMiddleware).toBe(true);
        expect(lockfile.capabilities.prompts!['without-mw']!.hasMiddleware).toBe(false);
    });

    it('captures hydrationTimeout as number or null', () => {
        const contracts = { tool: createContract('tool') };
        const withTimeout = createPromptBuilder({ name: 'timed', hydrationTimeout: 5000 });
        const noTimeout = createPromptBuilder({ name: 'untimed' });

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts: [withTimeout, noTimeout] });

        expect(lockfile.capabilities.prompts!['timed']!.hydrationTimeout).toBe(5000);
        expect(lockfile.capabilities.prompts!['untimed']!.hydrationTimeout).toBeNull();
    });

    it('produces per-prompt integrity digests', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'p1', description: 'Prompt 1' })];

        const lockfile = generateLockfile('test-server', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['p1']!;

        expect(entry.integrityDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('produces different integrity digests for different prompts', () => {
        const contracts = { tool: createContract('tool') };

        const lockA = generateLockfile('s', contracts, '1.0.0', {
            prompts: [createPromptBuilder({ name: 'p', description: 'version A' })],
        });
        const lockB = generateLockfile('s', contracts, '1.0.0', {
            prompts: [createPromptBuilder({ name: 'p', description: 'version B' })],
        });

        expect(lockA.capabilities.prompts!['p']!.integrityDigest)
            .not.toBe(lockB.capabilities.prompts!['p']!.integrityDigest);
    });

    it('is deterministic — same prompts produce same digests', () => {
        const contracts = { tool: createContract('tool') };
        const makePrompts = () => [
            createPromptBuilder({ name: 'a', description: 'Alpha', tags: ['x'] }),
            createPromptBuilder({ name: 'b', description: 'Beta', arguments: [{ name: 'id', required: true }] }),
        ];

        const lock1 = generateLockfile('s', contracts, '1.0.0', { prompts: makePrompts() });
        const lock2 = generateLockfile('s', contracts, '1.0.0', { prompts: makePrompts() });

        expect(lock1.capabilities.prompts!['a']!.integrityDigest)
            .toBe(lock2.capabilities.prompts!['a']!.integrityDigest);
        expect(lock1.capabilities.prompts!['b']!.integrityDigest)
            .toBe(lock2.capabilities.prompts!['b']!.integrityDigest);
    });
});

describe('Prompt Lockfile — integrity digest includes prompts', () => {
    it('overall integrityDigest changes when prompts are added', () => {
        const contracts = { tool: createContract('tool') };

        const withoutPrompts = generateLockfile('s', contracts, '1.0.0');
        const withPrompts = generateLockfile('s', contracts, '1.0.0', {
            prompts: [createPromptBuilder({ name: 'p1' })],
        });

        expect(withoutPrompts.integrityDigest).not.toBe(withPrompts.integrityDigest);
    });

    it('overall integrityDigest changes when prompt content changes', () => {
        const contracts = { tool: createContract('tool') };

        const v1 = generateLockfile('s', contracts, '1.0.0', {
            prompts: [createPromptBuilder({ name: 'p', description: 'v1' })],
        });
        const v2 = generateLockfile('s', contracts, '1.0.0', {
            prompts: [createPromptBuilder({ name: 'p', description: 'v2' })],
        });

        expect(v1.integrityDigest).not.toBe(v2.integrityDigest);
    });

    it('integrityDigest remains same for tool-only lockfile (backward compat)', () => {
        const contracts = { tool: createContract('tool') };
        const lock1 = generateLockfile('s', contracts, '1.0.0');
        const lock2 = generateLockfile('s', contracts, '1.0.0');

        expect(lock1.integrityDigest).toBe(lock2.integrityDigest);
    });
});

describe('Prompt Lockfile — serialization', () => {
    it('serialized lockfile includes prompts section', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'hello', description: 'Hello world' })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });

        const json = serializeLockfile(lockfile);
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const caps = parsed['capabilities'] as Record<string, unknown>;

        expect(caps['prompts']).toBeDefined();
        const prompsObj = caps['prompts'] as Record<string, unknown>;
        expect(prompsObj['hello']).toBeDefined();
    });

    it('prompt arguments are serialized with sorted keys', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({
            name: 'sorted',
            arguments: [
                { name: 'z_param', required: false },
                { name: 'a_param', description: 'First', required: true },
            ],
        })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });
        const json = serializeLockfile(lockfile);

        // Verify keys are sorted in JSON
        const aIdx = json.indexOf('"a_param"');
        const zIdx = json.indexOf('"z_param"');
        expect(aIdx).toBeLessThan(zIdx);
    });

    it('roundtrip: generate → serialize → parse preserves prompts', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [
            createPromptBuilder({
                name: 'audit',
                title: 'Daily Audit',
                description: 'Run audit',
                tags: ['compliance'],
                hasMiddleware: true,
                hydrationTimeout: 3000,
                arguments: [{ name: 'date', description: 'Date', required: true }],
            }),
        ];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });
        const json = serializeLockfile(lockfile);
        const parsed = parseLockfile(json);

        expect(parsed).not.toBeNull();
        expect(parsed!.capabilities.prompts).toBeDefined();

        const audit = parsed!.capabilities.prompts!['audit']!;
        expect(audit.description).toBe('Run audit');
        expect(audit.title).toBe('Daily Audit');
        expect(audit.tags).toEqual(['compliance']);
        expect(audit.hasMiddleware).toBe(true);
        expect(audit.hydrationTimeout).toBe(3000);
        expect(audit.arguments).toHaveLength(1);
        expect(audit.arguments[0]!.name).toBe('date');
        expect(audit.integrityDigest).toMatch(/^sha256:/);
        expect(audit.argumentsDigest).toMatch(/^sha256:/);
    });
});

describe('Prompt Lockfile — checkLockfile with prompts', () => {
    it('returns ok when lockfile matches current tools and prompts', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'p1', description: 'Prompt 1' })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });

        const result = checkLockfile(lockfile, contracts, { prompts });

        expect(result.ok).toBe(true);
        expect(result.unchangedPrompts).toEqual(['p1']);
        expect(result.addedPrompts).toEqual([]);
        expect(result.removedPrompts).toEqual([]);
        expect(result.changedPrompts).toEqual([]);
    });

    it('detects added prompts', () => {
        const contracts = { tool: createContract('tool') };
        const lockfile = generateLockfile('s', contracts, '1.0.0');

        // Now add prompts
        const prompts = [createPromptBuilder({ name: 'new-prompt' })];
        const result = checkLockfile(lockfile, contracts, { prompts });

        expect(result.ok).toBe(false);
        expect(result.addedPrompts).toEqual(['new-prompt']);
        expect(result.message).toContain('prompts added');
    });

    it('detects removed prompts', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'old-prompt' })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });

        // Now remove prompts
        const result = checkLockfile(lockfile, contracts);

        expect(result.ok).toBe(false);
        expect(result.removedPrompts).toEqual(['old-prompt']);
        expect(result.message).toContain('prompts removed');
    });

    it('detects changed prompts', () => {
        const contracts = { tool: createContract('tool') };
        const promptsV1 = [createPromptBuilder({ name: 'evolving', description: 'v1' })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts: promptsV1 });

        const promptsV2 = [createPromptBuilder({ name: 'evolving', description: 'v2' })];
        const result = checkLockfile(lockfile, contracts, { prompts: promptsV2 });

        expect(result.ok).toBe(false);
        expect(result.changedPrompts).toEqual(['evolving']);
        expect(result.message).toContain('prompts changed');
    });

    it('detects simultaneous tool and prompt drift', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'p1' })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });

        // Change both: add a tool, change a prompt
        const newContracts = {
            tool: createContract('tool'),
            newTool: createContract('newTool'),
        };
        const newPrompts = [createPromptBuilder({ name: 'p1', description: 'changed' })];
        const result = checkLockfile(lockfile, newContracts, { prompts: newPrompts });

        expect(result.ok).toBe(false);
        expect(result.added).toEqual(['newTool']);
        expect(result.changedPrompts).toEqual(['p1']);
    });

    it('fast path works when tools and prompts all match', () => {
        const contracts = { a: createContract('a'), b: createContract('b') };
        const prompts = [
            createPromptBuilder({ name: 'x', description: 'X' }),
            createPromptBuilder({ name: 'y', description: 'Y' }),
        ];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });
        const result = checkLockfile(lockfile, contracts, { prompts });

        expect(result.ok).toBe(true);
        expect(result.unchanged).toEqual(['a', 'b']);
        expect(result.unchangedPrompts).toEqual(['x', 'y']);
    });

    it('detects prompt argument changes', () => {
        const contracts = { tool: createContract('tool') };
        const promptsV1 = [createPromptBuilder({
            name: 'argchange',
            arguments: [{ name: 'date', required: true }],
        })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts: promptsV1 });

        const promptsV2 = [createPromptBuilder({
            name: 'argchange',
            arguments: [
                { name: 'date', required: true },
                { name: 'format', required: false },
            ],
        })];
        const result = checkLockfile(lockfile, contracts, { prompts: promptsV2 });

        expect(result.ok).toBe(false);
        expect(result.changedPrompts).toEqual(['argchange']);
    });

    it('detects prompt tag changes', () => {
        const contracts = { tool: createContract('tool') };
        const promptsV1 = [createPromptBuilder({ name: 'tagged', tags: ['billing'] })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts: promptsV1 });

        const promptsV2 = [createPromptBuilder({ name: 'tagged', tags: ['billing', 'compliance'] })];
        const result = checkLockfile(lockfile, contracts, { prompts: promptsV2 });

        expect(result.ok).toBe(false);
        expect(result.changedPrompts).toEqual(['tagged']);
    });

    it('detects middleware change', () => {
        const contracts = { tool: createContract('tool') };
        const promptsV1 = [createPromptBuilder({ name: 'mw', hasMiddleware: false })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts: promptsV1 });

        const promptsV2 = [createPromptBuilder({ name: 'mw', hasMiddleware: true })];
        const result = checkLockfile(lockfile, contracts, { prompts: promptsV2 });

        expect(result.ok).toBe(false);
        expect(result.changedPrompts).toEqual(['mw']);
    });

    it('detects hydration timeout change', () => {
        const contracts = { tool: createContract('tool') };
        const promptsV1 = [createPromptBuilder({ name: 'timeout', hydrationTimeout: 3000 })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts: promptsV1 });

        const promptsV2 = [createPromptBuilder({ name: 'timeout', hydrationTimeout: 5000 })];
        const result = checkLockfile(lockfile, contracts, { prompts: promptsV2 });

        expect(result.ok).toBe(false);
        expect(result.changedPrompts).toEqual(['timeout']);
    });

    it('message includes both tool and prompt drift details', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({ name: 'p1' })];
        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });

        // Remove tool, add new prompt
        const result = checkLockfile(lockfile, {}, {
            prompts: [
                createPromptBuilder({ name: 'p1' }),
                createPromptBuilder({ name: 'p2' }),
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.message).toContain('tools removed');
        expect(result.message).toContain('prompts added');
        expect(result.message).toContain('fusion lock');
    });
});

describe('Prompt Lockfile — backward compatibility', () => {
    it('tool-only lockfile without prompts field is still valid', () => {
        const contracts = { tool: createContract('tool') };
        const lockfile = generateLockfile('s', contracts, '1.0.0');
        const json = serializeLockfile(lockfile);
        const parsed = parseLockfile(json);

        expect(parsed).not.toBeNull();
        expect(parsed!.capabilities.prompts).toBeUndefined();
    });

    it('check against tool-only lockfile with no current prompts returns ok', () => {
        const contracts = { tool: createContract('tool') };
        const lockfile = generateLockfile('s', contracts, '1.0.0');

        const result = checkLockfile(lockfile, contracts);

        expect(result.ok).toBe(true);
        expect(result.addedPrompts).toEqual([]);
        expect(result.unchangedPrompts).toEqual([]);
    });

    it('LockfileCheckResult always has prompt arrays (never undefined)', () => {
        const contracts = { tool: createContract('tool') };
        const lockfile = generateLockfile('s', contracts, '1.0.0');
        const result = checkLockfile(lockfile, contracts);

        expect(Array.isArray(result.addedPrompts)).toBe(true);
        expect(Array.isArray(result.removedPrompts)).toBe(true);
        expect(Array.isArray(result.changedPrompts)).toBe(true);
        expect(Array.isArray(result.unchangedPrompts)).toBe(true);
    });
});

describe('Prompt Lockfile — LockfilePrompt shape', () => {
    it('has all expected fields', () => {
        const contracts = { tool: createContract('tool') };
        const prompts = [createPromptBuilder({
            name: 'full',
            title: 'Full Prompt',
            description: 'A complete prompt',
            tags: ['prod'],
            hasMiddleware: true,
            hydrationTimeout: 5000,
            arguments: [{ name: 'id', description: 'Entity ID', required: true }],
        })];

        const lockfile = generateLockfile('s', contracts, '1.0.0', { prompts });
        const entry = lockfile.capabilities.prompts!['full']! satisfies LockfilePrompt;

        expect(entry).toEqual(expect.objectContaining({
            integrityDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            description: 'A complete prompt',
            title: 'Full Prompt',
            tags: ['prod'],
            hasMiddleware: true,
            hydrationTimeout: 5000,
            argumentsDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }));
        expect(entry.arguments).toEqual([
            { name: 'id', description: 'Entity ID', required: true },
        ]);
    });
});

describe('Prompt Lockfile — git diff readability', () => {
    it('prompt changes produce human-readable diffs', () => {
        const contracts = { tool: createContract('tool') };

        const v1 = generateLockfile('s', contracts, '1.0.0', {
            prompts: [createPromptBuilder({
                name: 'report',
                description: 'Generate report',
                tags: ['billing'],
                arguments: [{ name: 'date', required: true }],
            })],
        });

        const v2 = generateLockfile('s', contracts, '1.0.0', {
            prompts: [createPromptBuilder({
                name: 'report',
                description: 'Generate enhanced report',
                tags: ['billing', 'compliance'],
                arguments: [
                    { name: 'date', required: true },
                    { name: 'format', description: 'Output format', required: false },
                ],
            })],
        });

        const json1 = serializeLockfile(v1);
        const json2 = serializeLockfile(v2);

        // Both are valid JSON
        expect(() => JSON.parse(json1)).not.toThrow();
        expect(() => JSON.parse(json2)).not.toThrow();

        // Content differs
        expect(json1).not.toBe(json2);

        // Specific changes are visible in the text
        expect(json1).toContain('"Generate report"');
        expect(json2).toContain('"Generate enhanced report"');
        expect(json2).toContain('"compliance"');
        expect(json2).toContain('"format"');
    });
});

describe('Prompt Lockfile — real PromptBuilder via definePrompt', () => {
    it('works with definePrompt output (duck-typed PromptBuilderLike)', async () => {
        // Import the real definePrompt to test integration
        const { definePrompt } = await import('../../src/prompt/definePrompt.js');
        const { z } = await import('zod');

        const prompt = definePrompt('billing-summary', {
            description: 'Summarize billing data for a given month',
            tags: ['billing', 'finance'],
            args: z.object({
                month: z.string().describe('Month in YYYY-MM format'),
                account_id: z.string(),
            }),
            handler: async () => ({
                messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'test' } }],
            }),
        });

        const contracts = { tool: createContract('tool') };
        const lockfile = generateLockfile('s', contracts, '1.0.0', {
            prompts: [prompt as unknown as PromptBuilderLike],
        });

        const entry = lockfile.capabilities.prompts!['billing-summary']!;
        expect(entry.description).toBe('Summarize billing data for a given month');
        expect(entry.tags).toEqual(['billing', 'finance']);
        expect(entry.arguments.length).toBe(2);

        // Arguments are sorted alphabetically
        const argNames = entry.arguments.map(a => a.name);
        expect(argNames).toEqual(['account_id', 'month']);

        // month has description from z.string().describe()
        const monthArg = entry.arguments.find(a => a.name === 'month');
        expect(monthArg!.description).toBe('Month in YYYY-MM format');
        expect(monthArg!.required).toBe(true);

        // Digests are present
        expect(entry.integrityDigest).toMatch(/^sha256:/);
        expect(entry.argumentsDigest).toMatch(/^sha256:/);
    });
});
