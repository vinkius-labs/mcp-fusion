/**
 * Bug #46 Regression: TokenEconomics overhead ratio is 0 when ALL blocks are overhead
 *
 * BUG: `overheadRatio = dataTokens > 0 ? overheadTokens / dataTokens : 0`
 * When all blocks are overhead (100% overhead), `dataTokens` is 0 and
 * `overheadRatio` reports 0 — the MINIMUM value instead of the MAXIMUM.
 * The `OVERHEAD WARNING` advisory never triggers for the most extreme case.
 *
 * WHY EXISTING TESTS MISSED IT:
 * All profileResponse tests provide both overhead and data blocks (e.g.,
 * 1 overhead + 1 data). The "zero overhead" test verifies `overheadRatio === 0`
 * when `overheadBlocks === 0` (correct). But zero tests check the case where
 * ALL blocks are overhead and `dataTokens === 0`. The semantically inverted
 * metric was never triggered in tests.
 *
 * FIX: `overheadRatio = dataTokens > 0 ? overheadTokens / dataTokens
 *          : (overheadTokens > 0 ? Infinity : 0)`
 * Now 100% overhead correctly reports `Infinity`, and the advisory triggers.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { profileResponse } from '../../src/introspection/TokenEconomics.js';

describe('Bug #46 Regression: overhead ratio when all blocks are overhead', () => {

    it('100% overhead → overheadRatio is Infinity (not 0)', () => {
        // All 2 blocks are overhead, zero data blocks
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'System rules block 1' },
            { type: 'text', text: 'System rules block 2' },
        ], 2); // ALL blocks are overhead

        expect(result.overheadTokens).toBeGreaterThan(0);
        expect(result.dataTokens).toBe(0);
        // CRITICAL: this was 0 before the fix — semantically inverted
        expect(result.overheadRatio).toBe(Infinity);
    });

    it('single overhead block, zero data → Infinity', () => {
        const result = profileResponse('tool', 'action', [
            { type: 'text', text: 'Rules and UI decorators' },
        ], 1);

        expect(result.dataTokens).toBe(0);
        expect(result.overheadRatio).toBe(Infinity);
    });

    it('zero overhead, zero data (empty) → ratio is 0', () => {
        const result = profileResponse('tool', null, [], 0);

        expect(result.overheadTokens).toBe(0);
        expect(result.dataTokens).toBe(0);
        expect(result.overheadRatio).toBe(0);
    });

    it('normal case: overhead + data → finite ratio (unchanged behavior)', () => {
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'System rules overhead text content' },
            { type: 'text', text: 'Actual data payload for the user agent' },
        ], 1);

        expect(result.overheadTokens).toBeGreaterThan(0);
        expect(result.dataTokens).toBeGreaterThan(0);
        expect(result.overheadRatio).toBeGreaterThan(0);
        expect(Number.isFinite(result.overheadRatio)).toBe(true);
    });

    it('OVERHEAD WARNING triggers when all blocks are overhead', () => {
        const result = profileResponse('heavy-tool', null, [
            { type: 'text', text: 'A large overhead block with system guardrails and UI decorators' },
        ], 1, { maxOverheadRatio: 0.3 });

        // Infinity > 0.3, so advisory should trigger
        // Note: advisory might also be set by risk level template for high-risk responses
        // For small blocks the risk is 'low' so generateAdvisory checks overheadRatio
        expect(result.overheadRatio).toBe(Infinity);
        expect(result.advisory).toBeTruthy();
        expect(result.advisory!).toContain('OVERHEAD WARNING');
    });

    it('zero overhead, has data → ratio is 0 (unchanged behavior)', () => {
        const result = profileResponse('tool', null, [
            { type: 'text', text: 'Just regular data' },
        ], 0);

        expect(result.overheadRatio).toBe(0);
        expect(result.overheadTokens).toBe(0);
    });
});
