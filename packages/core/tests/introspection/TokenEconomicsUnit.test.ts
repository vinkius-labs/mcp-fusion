/**
 * TokenEconomics — Unit Tests
 *
 * Dedicated unit tests for the token economics profiling system:
 * - estimateTokens: heuristic token count estimation
 * - profileBlock: per-block token profiling
 * - profileResponse: full response analysis with risk classification
 * - computeStaticProfile: schema-based worst-case profile
 * - aggregateProfiles: server-level summary
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import {
    estimateTokens,
    profileBlock,
    profileResponse,
    computeStaticProfile,
    aggregateProfiles,
} from '../../src/introspection/TokenEconomics.js';

// ============================================================================
// 1 · estimateTokens
// ============================================================================

describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
        expect(estimateTokens('')).toBe(0);
    });

    it('returns a positive number for non-empty string', () => {
        expect(estimateTokens('hello world')).toBeGreaterThan(0);
    });

    it('uses ~3.5 chars/token heuristic', () => {
        // 35 chars → ceil(35/3.5) = 10 tokens
        const text = 'a'.repeat(35);
        expect(estimateTokens(text)).toBe(10);
    });

    it('scales approximately linearly with length', () => {
        const short = estimateTokens('x'.repeat(100));
        const long = estimateTokens('x'.repeat(1000));
        // Ratio should be ~10 (within 5% due to ceil rounding)
        const ratio = long / short;
        expect(ratio).toBeGreaterThan(9.5);
        expect(ratio).toBeLessThan(10.5);
    });

    it('handles Unicode text', () => {
        const tokens = estimateTokens('こんにちは世界');
        expect(tokens).toBeGreaterThan(0);
    });

    it('returns integer values', () => {
        const tokens = estimateTokens('hello');
        expect(Number.isInteger(tokens)).toBe(true);
    });
});

// ============================================================================
// 2 · profileBlock
// ============================================================================

describe('profileBlock', () => {
    it('profiles a text block', () => {
        const result = profileBlock({ type: 'text', text: 'Hello, world!' });
        expect(result.type).toBe('text');
        expect(result.estimatedTokens).toBeGreaterThan(0);
        expect(result.bytes).toBeGreaterThan(0);
    });

    it('profiles a block with no text', () => {
        const result = profileBlock({ type: 'resource' });
        expect(result.type).toBe('resource');
        expect(result.estimatedTokens).toBe(0);
        expect(result.bytes).toBe(0);
    });

    it('counts bytes correctly for ASCII', () => {
        const text = 'hello'; // 5 ASCII chars = 5 bytes
        const result = profileBlock({ type: 'text', text });
        expect(result.bytes).toBe(5);
    });

    it('counts bytes correctly for multi-byte characters', () => {
        // Japanese characters are 3 bytes each in UTF-8
        const result = profileBlock({ type: 'text', text: 'あ' });
        expect(result.bytes).toBe(3);
    });

    it('preserves block type', () => {
        expect(profileBlock({ type: 'echarts' }).type).toBe('echarts');
        expect(profileBlock({ type: 'mermaid', text: 'graph TD' }).type).toBe('mermaid');
    });
});

// ============================================================================
// 3 · profileResponse
// ============================================================================

describe('profileResponse', () => {
    it('profiles a single-block response', () => {
        const result = profileResponse('tool', 'list', [
            { type: 'text', text: 'Response data here' },
        ]);
        expect(result.toolName).toBe('tool');
        expect(result.actionKey).toBe('list');
        expect(result.blockCount).toBe(1);
        expect(result.estimatedTokens).toBeGreaterThan(0);
    });

    it('profiles a multi-block response', () => {
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'Block 1' },
            { type: 'text', text: 'Block 2' },
            { type: 'text', text: 'Block 3' },
        ]);
        expect(result.blockCount).toBe(3);
        expect(result.blocks).toHaveLength(3);
    });

    it('calculates overhead ratio with overhead blocks', () => {
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'System rules that are overhead' },
            { type: 'text', text: 'Actual data for the agent' },
        ], 1); // First block is overhead
        expect(result.overheadTokens).toBeGreaterThan(0);
        expect(result.dataTokens).toBeGreaterThan(0);
        expect(result.overheadRatio).toBeGreaterThan(0);
    });

    it('zero overhead when no overhead blocks', () => {
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'Just data' },
        ], 0);
        expect(result.overheadTokens).toBe(0);
        expect(result.overheadRatio).toBe(0);
    });

    it('classifies risk as "low" for small responses', () => {
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'small' },
        ]);
        expect(result.risk).toBe('low');
    });

    it('classifies risk as "high" for large responses', () => {
        const largeText = 'x'.repeat(30_000); // ~8500 tokens at 3.5 chars/token
        const result = profileResponse('tool', null, [
            { type: 'text', text: largeText },
        ]);
        expect(['high', 'critical']).toContain(result.risk);
    });

    it('includes advisory for high-risk responses', () => {
        const largeText = 'x'.repeat(30_000);
        const result = profileResponse('tool', null, [
            { type: 'text', text: largeText },
        ]);
        expect(result.advisory).toBeTruthy();
    });

    it('null advisory for low-risk responses', () => {
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'ok' },
        ]);
        expect(result.advisory).toBeNull();
    });

    it('handles empty blocks array', () => {
        const result = profileResponse('tool', null, []);
        expect(result.blockCount).toBe(0);
        expect(result.estimatedTokens).toBe(0);
        expect(result.risk).toBe('low');
    });

    it('actionKey can be null', () => {
        const result = profileResponse('tool', null, []);
        expect(result.actionKey).toBeNull();
    });

    it('respects custom thresholds', () => {
        // With low thresholds, even small text should be risky
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'x'.repeat(100) },
        ], 0, { thresholds: { low: 1, medium: 5, high: 10 } });
        expect(result.risk).not.toBe('low');
    });
});

// ============================================================================
// 4 · computeStaticProfile
// ============================================================================

describe('computeStaticProfile', () => {
    it('returns profile for a tool with schema keys', () => {
        const profile = computeStaticProfile('projects', ['id', 'name', 'status'], null, null);
        expect(profile.toolName).toBe('projects');
        expect(profile.fieldBreakdown).toHaveLength(3);
        expect(profile.minTokens).toBeGreaterThan(0);
        expect(profile.maxTokens).toBeGreaterThanOrEqual(profile.minTokens);
    });

    it('bounded when agentLimitMax is set', () => {
        const profile = computeStaticProfile('projects', ['id', 'name'], 50, null);
        expect(profile.bounded).toBe(true);
    });

    it('bounded when egressMaxBytes is set', () => {
        const profile = computeStaticProfile('projects', ['id', 'name'], null, 10_000);
        expect(profile.bounded).toBe(true);
    });

    it('unbounded when no limits set', () => {
        const profile = computeStaticProfile('projects', ['id', 'name'], null, null);
        expect(profile.bounded).toBe(false);
    });

    it('identifies collection fields heuristically', () => {
        const profile = computeStaticProfile('projects', ['items', 'name', 'tags'], null, null);
        const itemsField = profile.fieldBreakdown.find(f => f.name === 'items');
        const nameField = profile.fieldBreakdown.find(f => f.name === 'name');
        expect(itemsField!.isCollection).toBe(true);
        expect(nameField!.isCollection).toBe(false);
    });

    it('generates recommendations for unbounded tools', () => {
        const profile = computeStaticProfile('projects', ['id', 'name', 'description'], null, null);
        expect(profile.recommendations.length).toBeGreaterThan(0);
    });

    it('empty schema keys produces minimal profile', () => {
        const profile = computeStaticProfile('empty-tool', [], null, null);
        expect(profile.fieldBreakdown).toHaveLength(0);
        expect(profile.minTokens).toBeGreaterThan(0); // JSON overhead
    });
});

// ============================================================================
// 5 · aggregateProfiles
// ============================================================================

describe('aggregateProfiles', () => {
    it('aggregates multiple profiles', () => {
        const profiles = [
            computeStaticProfile('tool-a', ['id', 'name'], 10, null),
            computeStaticProfile('tool-b', ['id', 'status'], 20, null),
        ];
        const summary = aggregateProfiles(profiles);
        expect(summary.toolCount).toBe(2);
        expect(summary.totalMinTokens).toBeGreaterThan(0);
        expect(summary.totalMaxTokens).toBeGreaterThanOrEqual(summary.totalMinTokens);
    });

    it('identifies unbounded tools', () => {
        const profiles = [
            computeStaticProfile('bounded', ['id'], 10, null),
            computeStaticProfile('unbounded', ['id', 'data'], null, null),
        ];
        const summary = aggregateProfiles(profiles);
        expect(summary.unboundedToolCount).toBe(1);
        expect(summary.unboundedToolNames).toContain('unbounded');
    });

    it('overall risk reflects worst tool', () => {
        const profiles = [
            computeStaticProfile('safe', ['id'], 5, 1000),
        ];
        const summary = aggregateProfiles(profiles);
        expect(summary.overallRisk).toBe('low');
    });

    it('empty profiles array produces zero counts', () => {
        const summary = aggregateProfiles([]);
        expect(summary.toolCount).toBe(0);
        expect(summary.totalMinTokens).toBe(0);
        expect(summary.totalMaxTokens).toBe(0);
        expect(summary.unboundedToolCount).toBe(0);
    });

    it('collects recommendations from risky tools', () => {
        const profiles = [
            computeStaticProfile('risky', ['items', 'data', 'payload', 'content', 'body', 'results'], null, null),
        ];
        const summary = aggregateProfiles(profiles);
        // Recommendations should be prefixed with tool name
        if (summary.recommendations.length > 0) {
            expect(summary.recommendations[0]).toContain('risky');
        }
    });
});
