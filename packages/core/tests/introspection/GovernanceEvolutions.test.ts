/**
 * TokenEconomics + EntitlementScanner + SemanticProbe + SelfHealing Tests
 *
 * Verifies the 5 architectural evolutions in isolation.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

// ── Token Economics ──
import {
    estimateTokens,
    profileBlock,
    profileResponse,
    computeStaticProfile,
    aggregateProfiles,
} from '../../src/introspection/TokenEconomics.js';

// ── Entitlement Scanner ──
import {
    scanSource,
    buildEntitlements,
    validateClaims,
    scanAndValidate,
} from '../../src/introspection/EntitlementScanner.js';

// ── Semantic Probe ──
import {
    createProbe,
    buildJudgePrompt,
    parseJudgeResponse,
    aggregateResults,
} from '../../src/introspection/SemanticProbe.js';
import type { SemanticProbeConfig, SemanticProbeResult } from '../../src/introspection/SemanticProbe.js';

// ── Self-Healing ──
import {
    enrichValidationError,
    createToolEnhancer,
} from '../../src/introspection/ContractAwareSelfHealing.js';
import type { SelfHealingConfig } from '../../src/introspection/ContractAwareSelfHealing.js';
import type { ContractDiffResult, ContractDelta } from '../../src/introspection/ContractDiff.js';

// ============================================================================
// Token Economics
// ============================================================================

describe('TokenEconomics', () => {
    describe('estimateTokens', () => {
        it('estimates ~4 chars per token', () => {
            const tokens = estimateTokens('Hello, world!'); // 13 chars
            expect(tokens).toBeGreaterThan(0);
            expect(tokens).toBeLessThan(10);
        });

        it('returns 0 for empty string', () => {
            expect(estimateTokens('')).toBe(0);
        });
    });

    describe('profileBlock', () => {
        it('profiles a text block', () => {
            const profile = profileBlock({ type: 'text', text: 'Hello, world!' });
            expect(profile.type).toBe('text');
            expect(profile.estimatedTokens).toBeGreaterThan(0);
            expect(profile.bytes).toBeGreaterThan(0);
        });

        it('handles missing text', () => {
            const profile = profileBlock({ type: 'image' });
            expect(profile.estimatedTokens).toBe(0);
            expect(profile.bytes).toBe(0);
        });
    });

    describe('profileResponse', () => {
        it('profiles a complete response', () => {
            const blocks = [
                { type: 'text', text: 'System rules: Always be concise.' },
                { type: 'text', text: JSON.stringify({ id: 1, name: 'Alice', email: 'a@test.com' }) },
            ];

            const analysis = profileResponse('users', 'list', blocks, 1);
            expect(analysis.toolName).toBe('users');
            expect(analysis.blockCount).toBe(2);
            expect(analysis.estimatedTokens).toBeGreaterThan(0);
            expect(analysis.dataTokens).toBeGreaterThan(0);
            expect(analysis.overheadTokens).toBeGreaterThan(0);
        });

        it('classifies risk levels correctly', () => {
            // Small response → low risk
            const small = profileResponse('t', null, [{ type: 'text', text: 'ok' }]);
            expect(small.risk).toBe('low');

            // Large response → high/critical risk
            const bigText = 'x'.repeat(30000);
            const big = profileResponse('t', null, [{ type: 'text', text: bigText }]);
            expect(['high', 'critical']).toContain(big.risk);
        });

        it('generates advisory for critical risk', () => {
            const bigText = 'x'.repeat(50000);
            const analysis = profileResponse('users', null, [{ type: 'text', text: bigText }]);
            expect(analysis.advisory).toBeTruthy();
            expect(analysis.advisory).toContain('COGNITIVE OVERLOAD');
        });
    });

    describe('computeStaticProfile', () => {
        it('computes a bounded profile with agentLimit', () => {
            const profile = computeStaticProfile('users', ['id', 'name', 'email'], 25, null);
            expect(profile.bounded).toBe(true);
            expect(profile.risk).toBeDefined();
            expect(profile.recommendations).toBeInstanceOf(Array);
        });

        it('flags unbounded collections', () => {
            const profile = computeStaticProfile('users', ['id', 'name', 'email'], null, null);
            expect(profile.bounded).toBe(false);
            expect(profile.recommendations.length).toBeGreaterThan(0);
        });

        it('respects egressMaxBytes as upper bound', () => {
            const profile = computeStaticProfile('users', ['id', 'name'], null, 1024);
            expect(profile.bounded).toBe(true);
            expect(profile.maxTokens).toBeLessThanOrEqual(Math.ceil(1024 / 3.5));
        });
    });

    describe('aggregateProfiles', () => {
        it('aggregates multiple profiles', () => {
            const profiles = [
                computeStaticProfile('users', ['id', 'name'], 10, null),
                computeStaticProfile('tasks', ['id', 'title', 'status', 'description', 'assignee'], null, null),
            ];

            const summary = aggregateProfiles(profiles);
            expect(summary.toolCount).toBe(2);
            expect(summary.unboundedToolCount).toBe(1);
            expect(summary.unboundedToolNames).toContain('tasks');
        });
    });
});

// ============================================================================
// EntitlementScanner
// ============================================================================

describe('EntitlementScanner', () => {
    describe('scanSource', () => {
        it('detects filesystem imports', () => {
            const source = `import { readFileSync } from 'node:fs';`;
            const matches = scanSource(source);
            expect(matches.some(m => m.category === 'filesystem')).toBe(true);
        });

        it('detects network APIs', () => {
            const source = `const response = await fetch('https://api.example.com');`;
            const matches = scanSource(source);
            expect(matches.some(m => m.category === 'network')).toBe(true);
        });

        it('detects subprocess APIs', () => {
            const source = `import { exec } from 'child_process';
exec('ls -la', callback);`;
            const matches = scanSource(source);
            expect(matches.some(m => m.category === 'subprocess')).toBe(true);
        });

        it('detects crypto APIs', () => {
            const source = `import { createSign } from 'node:crypto';
const signer = createSign('SHA256');`;
            const matches = scanSource(source);
            expect(matches.some(m => m.category === 'crypto')).toBe(true);
        });

        it('returns empty for sandboxed code', () => {
            const source = `
function add(a: number, b: number): number {
    return a + b;
}`;
            const matches = scanSource(source);
            expect(matches).toHaveLength(0);
        });
    });

    describe('buildEntitlements', () => {
        it('aggregates matches into entitlements', () => {
            const source = `
import { readFileSync } from 'fs';
const data = await fetch('https://api.test.com');`;
            const matches = scanSource(source);
            const entitlements = buildEntitlements(matches);

            expect(entitlements.filesystem).toBe(true);
            expect(entitlements.network).toBe(true);
            expect(entitlements.subprocess).toBe(false);
            expect(entitlements.crypto).toBe(false);
        });
    });

    describe('validateClaims', () => {
        it('detects readOnly violation with filesystem writes', () => {
            const source = `import { writeFileSync } from 'fs';
writeFileSync('/tmp/data.json', '{}');`;
            const matches = scanSource(source);
            const violations = validateClaims(matches, { readOnly: true });

            expect(violations.length).toBeGreaterThan(0);
            expect(violations.some(v => v.severity === 'error')).toBe(true);
        });

        it('allows entitlements when explicitly permitted', () => {
            const source = `import { writeFileSync } from 'fs';
writeFileSync('/tmp/data.json', '{}');`;
            const matches = scanSource(source);
            const violations = validateClaims(matches, {
                readOnly: true,
                allowed: ['filesystem'],
            });

            expect(violations.filter(v => v.category === 'filesystem')).toHaveLength(0);
        });

        it('warns on subprocess without destructive flag', () => {
            const source = `import { exec } from 'child_process';
exec('rm -rf /');`;
            const matches = scanSource(source);
            const violations = validateClaims(matches, { destructive: false });

            expect(violations.some(v => v.severity === 'warning')).toBe(true);
        });
    });

    describe('scanAndValidate', () => {
        it('produces a complete report', () => {
            const source = `
import { readFileSync } from 'fs';
const data = readFileSync('/etc/config');
const result = await fetch('https://api.test.com');`;

            const report = scanAndValidate(source, { readOnly: true });
            expect(report.entitlements.filesystem).toBe(true);
            expect(report.entitlements.network).toBe(true);
            expect(report.summary).toContain('filesystem');
            expect(report.summary).toContain('network');
        });

        it('reports safe for sandboxed code', () => {
            const source = `function add(a: number, b: number) { return a + b; }`;
            const report = scanAndValidate(source);
            expect(report.safe).toBe(true);
            expect(report.summary).toContain('sandboxed');
        });
    });
});

// ============================================================================
// SemanticProbe
// ============================================================================

describe('SemanticProbe', () => {
    const mockAdapter = {
        name: 'test-mock',
        evaluate: async (_prompt: string) => JSON.stringify({
            similarityScore: 0.85,
            contractViolated: false,
            violations: [],
            reasoning: 'Outputs are semantically similar',
        }),
    };

    const baseConfig: SemanticProbeConfig = {
        adapter: mockAdapter,
        includeRawResponses: true,
    };

    describe('createProbe', () => {
        it('creates a probe with unique ID', () => {
            const probe = createProbe(
                'users', 'list',
                { limit: 10 },
                [{ id: 1, name: 'Alice' }],
                [{ id: 1, name: 'Alice' }],
                {
                    description: 'List users',
                    readOnly: true,
                    destructive: false,
                    systemRules: ['Format names in Title Case'],
                    schemaKeys: ['id', 'name'],
                },
            );

            expect(probe.id).toContain('users::list');
            expect(probe.toolName).toBe('users');
            expect(probe.actionKey).toBe('list');
        });
    });

    describe('buildJudgePrompt', () => {
        it('builds a structured evaluation prompt', () => {
            const probe = createProbe(
                'users', 'list',
                { limit: 5 },
                [{ id: 1 }],
                [{ id: 1, extra: 'field' }],
                {
                    description: 'List users',
                    readOnly: true,
                    destructive: false,
                    systemRules: ['No extra fields'],
                    schemaKeys: ['id', 'name'],
                },
            );

            const prompt = buildJudgePrompt(probe);
            expect(prompt).toContain('semantic evaluation judge');
            expect(prompt).toContain('users');
            expect(prompt).toContain('No extra fields');
            expect(prompt).toContain('similarityScore');
        });
    });

    describe('parseJudgeResponse', () => {
        it('parses valid JSON response', () => {
            const probe = createProbe('t', 'a', {}, {}, {}, {
                description: 'd', readOnly: true, destructive: false,
                systemRules: [], schemaKeys: [],
            });

            const result = parseJudgeResponse(
                probe,
                '```json\n{"similarityScore": 0.9, "contractViolated": false, "violations": [], "reasoning": "Good"}\n```',
                baseConfig,
            );

            expect(result.similarityScore).toBe(0.9);
            expect(result.driftLevel).toBe('low');
            expect(result.contractViolated).toBe(false);
        });

        it('handles malformed responses gracefully', () => {
            const probe = createProbe('t', 'a', {}, {}, {}, {
                description: 'd', readOnly: true, destructive: false,
                systemRules: [], schemaKeys: [],
            });

            const result = parseJudgeResponse(probe, 'not valid json at all', baseConfig);
            expect(result.driftLevel).toBe('medium'); // Fallback
            expect(result.violations).toContain('Unable to parse LLM judge response');
        });

        it('clamps similarity score to [0, 1]', () => {
            const probe = createProbe('t', 'a', {}, {}, {}, {
                description: 'd', readOnly: true, destructive: false,
                systemRules: [], schemaKeys: [],
            });

            const result = parseJudgeResponse(
                probe,
                '{"similarityScore": 1.5, "contractViolated": false, "violations": [], "reasoning": "ok"}',
                baseConfig,
            );
            expect(result.similarityScore).toBe(1.0);
        });
    });

    describe('aggregateResults', () => {
        it('aggregates multiple probe results', () => {
            const probe = createProbe('t', 'a', {}, {}, {}, {
                description: 'd', readOnly: true, destructive: false,
                systemRules: [], schemaKeys: [],
            });

            const results: SemanticProbeResult[] = [
                {
                    probe,
                    similarityScore: 0.95,
                    driftLevel: 'none',
                    contractViolated: false,
                    violations: [],
                    reasoning: 'Identical',
                    rawResponse: null,
                    evaluatedAt: new Date().toISOString(),
                },
                {
                    probe,
                    similarityScore: 0.6,
                    driftLevel: 'medium',
                    contractViolated: true,
                    violations: ['Extra field detected'],
                    reasoning: 'Schema drift',
                    rawResponse: null,
                    evaluatedAt: new Date().toISOString(),
                },
            ];

            const report = aggregateResults('test', results);
            expect(report.violationCount).toBe(1);
            expect(report.stable).toBe(true); // avg similarity 0.775 → low drift → stable
            expect(report.summary).toContain('2 probes evaluated');
        });

        it('returns stable for high-similarity results', () => {
            const probe = createProbe('t', 'a', {}, {}, {}, {
                description: 'd', readOnly: true, destructive: false,
                systemRules: [], schemaKeys: [],
            });

            const results: SemanticProbeResult[] = [{
                probe,
                similarityScore: 0.98,
                driftLevel: 'none',
                contractViolated: false,
                violations: [],
                reasoning: 'OK',
                rawResponse: null,
                evaluatedAt: new Date().toISOString(),
            }];

            const report = aggregateResults('test', results);
            expect(report.stable).toBe(true);
        });
    });
});

// ============================================================================
// ContractAwareSelfHealing
// ============================================================================

describe('ContractAwareSelfHealing', () => {
    const sampleDelta: ContractDelta = {
        category: 'behavior.egress',
        field: 'egressSchemaDigest',
        severity: 'BREAKING',
        description: 'Presenter egress schema changed',
        before: 'old-digest',
        after: 'new-digest',
    };

    const sampleDiffResult: ContractDiffResult = {
        toolName: 'users',
        deltas: [sampleDelta],
        maxSeverity: 'BREAKING',
        digestChanged: true,
        isBackwardsCompatible: false,
    };

    function createConfig(deltas: Map<string, ContractDiffResult> = new Map()): SelfHealingConfig {
        return { activeDeltas: deltas };
    }

    describe('enrichValidationError', () => {
        it('passes through when no deltas exist', () => {
            const config = createConfig();
            const result = enrichValidationError(
                '<validation_error>Bad input</validation_error>',
                'users',
                'list',
                config,
            );

            expect(result.injected).toBe(false);
            expect(result.enrichedError).toBe(result.originalError);
        });

        it('injects contract context when deltas exist', () => {
            const config = createConfig(new Map([['users', sampleDiffResult]]));
            const result = enrichValidationError(
                '<validation_error>Bad input</validation_error>',
                'users',
                'list',
                config,
            );

            expect(result.injected).toBe(true);
            expect(result.enrichedError).toContain('<contract_awareness>');
            expect(result.enrichedError).toContain('behavioral contract');
            expect(result.enrichedError).toContain('<contract_changes>');
            expect(result.enrichedError).toContain('</validation_error>');
        });

        it('preserves the original error XML', () => {
            const config = createConfig(new Map([['users', sampleDiffResult]]));
            const originalError = '<validation_error><field>name</field><hint>required</hint></validation_error>';
            const result = enrichValidationError(originalError, 'users', 'list', config);

            expect(result.enrichedError).toContain('<field>name</field>');
            expect(result.enrichedError).toContain('<hint>required</hint>');
        });

        it('skips SAFE/COSMETIC deltas by default', () => {
            const safeDelta: ContractDelta = {
                ...sampleDelta,
                severity: 'SAFE',
            };
            const diffResult: ContractDiffResult = {
                ...sampleDiffResult,
                deltas: [safeDelta],
                maxSeverity: 'SAFE',
            };

            const config = createConfig(new Map([['users', diffResult]]));
            const result = enrichValidationError(
                '<validation_error>Bad input</validation_error>',
                'users',
                'list',
                config,
            );

            expect(result.injected).toBe(false);
        });

        it('includes SAFE deltas when configured', () => {
            const safeDelta: ContractDelta = {
                ...sampleDelta,
                severity: 'SAFE',
            };
            const diffResult: ContractDiffResult = {
                ...sampleDiffResult,
                deltas: [safeDelta],
                maxSeverity: 'SAFE',
            };

            const config: SelfHealingConfig = {
                activeDeltas: new Map([['users', diffResult]]),
                includeAllSeverities: true,
            };
            const result = enrichValidationError(
                '<validation_error>Bad input</validation_error>',
                'users',
                'list',
                config,
            );

            expect(result.injected).toBe(true);
        });

        it('limits deltas per error', () => {
            const manyDeltas: ContractDelta[] = Array.from({ length: 20 }, (_, i) => ({
                ...sampleDelta,
                field: `field-${i}`,
            }));

            const diffResult: ContractDiffResult = {
                ...sampleDiffResult,
                deltas: manyDeltas,
            };

            const config: SelfHealingConfig = {
                activeDeltas: new Map([['users', diffResult]]),
                maxDeltasPerError: 3,
            };

            const result = enrichValidationError(
                '<validation_error>Bad input</validation_error>',
                'users',
                'list',
                config,
            );

            expect(result.deltaCount).toBe(3);
        });
    });

    describe('createToolEnhancer', () => {
        it('returns identity function when no deltas exist', () => {
            const config = createConfig();
            const enhancer = createToolEnhancer('users', config);
            const input = '<validation_error>test</validation_error>';
            expect(enhancer(input, 'list')).toBe(input);
        });

        it('enriches errors when deltas exist', () => {
            const config = createConfig(new Map([['users', sampleDiffResult]]));
            const enhancer = createToolEnhancer('users', config);
            const input = '<validation_error>test</validation_error>';
            const result = enhancer(input, 'list');

            expect(result).toContain('<contract_awareness>');
        });
    });
});
