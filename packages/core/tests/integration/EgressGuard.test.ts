/**
 * EgressGuard Integration Tests
 *
 * Tests the payload size limiter end-to-end through the tool pipeline.
 * Verifies truncation behavior, UTF-8 boundary safety, multi-block
 * handling, and zero-overhead when not configured.
 *
 * Coverage:
 *   1. Within-limit responses pass through unchanged
 *   2. Over-limit single-block truncation with system intervention
 *   3. Multi-block responses truncate correctly
 *   4. UTF-8 multi-byte characters are truncated at safe boundaries
 *   5. Edge case: limit smaller than suffix
 *   6. Error responses preserve isError flag after truncation
 */
import { describe, it, expect } from 'vitest';
import { applyEgressGuard } from '../../src/core/execution/EgressGuard.js';
import { success, error } from '../../src/core/response.js';

// ============================================================================
// 1. Pass-through when within limit
// ============================================================================

describe('EgressGuard: Within Limit', () => {
    it('should return response unchanged when total bytes within limit', () => {
        const response = success('Short payload');
        const guarded = applyEgressGuard(response, 1024);

        expect(guarded).toBe(response); // Same reference — zero copy
    });

    it('should pass through exactly-at-limit responses', () => {
        const text = 'A'.repeat(1024);
        const response = success(text);
        const guarded = applyEgressGuard(response, 1024);

        expect(guarded).toBe(response);
    });
});

// ============================================================================
// 2. Single-block truncation
// ============================================================================

describe('EgressGuard: Single Block Truncation', () => {
    it('should truncate oversized single-block response and append intervention', () => {
        const text = 'X'.repeat(2048);
        const response = success(text);
        const guarded = applyEgressGuard(response, 1024);

        expect(guarded).not.toBe(response);
        expect(guarded.content).toHaveLength(1);

        const resultText = guarded.content[0]!.text;
        expect(resultText).toContain('SYSTEM INTERVENTION');
        expect(resultText).toContain('pagination');

        // Total byte length should be close to 1024 (not exceed significantly)
        const totalBytes = new TextEncoder().encode(resultText).byteLength;
        expect(totalBytes).toBeLessThanOrEqual(1200); // Within reasonable bound
    });

    it('should preserve truncated content before the suffix', () => {
        const text = 'ABCDEF'.repeat(500); // 3000 chars
        const response = success(text);
        const guarded = applyEgressGuard(response, 2048);

        const resultText = guarded.content[0]!.text;
        // Should start with original content
        expect(resultText.startsWith('ABCDEF')).toBe(true);
        // Should end with intervention message
        expect(resultText).toContain('SYSTEM INTERVENTION');
    });
});

// ============================================================================
// 3. Multi-block truncation
// ============================================================================

describe('EgressGuard: Multi-Block Truncation', () => {
    it('should truncate across multiple content blocks', () => {
        const response = {
            content: [
                { type: 'text' as const, text: 'A'.repeat(512) },
                { type: 'text' as const, text: 'B'.repeat(512) },
                { type: 'text' as const, text: 'C'.repeat(512) },
            ],
        };
        const guarded = applyEgressGuard(response, 1024);

        // Should have fewer blocks (some skipped entirely)
        expect(guarded.content.length).toBeLessThanOrEqual(3);
        // Last block should contain intervention
        const lastText = guarded.content[guarded.content.length - 1]!.text;
        expect(lastText).toContain('SYSTEM INTERVENTION');
    });

    it('should include complete blocks that fit and truncate the rest', () => {
        const response = {
            content: [
                { type: 'text' as const, text: 'Small block' },     // ~11 bytes
                { type: 'text' as const, text: 'X'.repeat(5000) },  // oversized
            ],
        };
        const guarded = applyEgressGuard(response, 2048);

        // First block should be preserved
        expect(guarded.content[0]!.text).toBe('Small block');
        // Second block should be truncated
        expect(guarded.content[1]!.text).toContain('SYSTEM INTERVENTION');
    });
});

// ============================================================================
// 4. UTF-8 safety
// ============================================================================

describe('EgressGuard: UTF-8 Boundary Safety', () => {
    it('should not corrupt multi-byte UTF-8 characters when truncating', () => {
        // Emojis are 4 bytes each in UTF-8
        const emojis = '🎉'.repeat(300); // ~1200 bytes
        const response = success(emojis);
        const guarded = applyEgressGuard(response, 1024);

        // The truncated text should not have broken UTF-8 sequences
        const resultText = guarded.content[0]!.text;
        // Encoding and decoding should be identity (no replacement characters)
        const encoded = new TextEncoder().encode(resultText);
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(encoded);
        expect(decoded).toBe(resultText);
    });

    it('should handle mixed ASCII and multi-byte correctly', () => {
        const mixed = 'Hello 世界! '.repeat(200); // Mix of 1-byte and 3-byte chars
        const response = success(mixed);
        const guarded = applyEgressGuard(response, 1024);

        const resultText = guarded.content[0]!.text;
        expect(resultText).toContain('SYSTEM INTERVENTION');
        // Should not have replacement characters (U+FFFD)
        expect(resultText).not.toContain('\uFFFD');
    });
});

// ============================================================================
// 5. Edge cases
// ============================================================================

describe('EgressGuard: Edge Cases', () => {
    it('should enforce minimum 1024 bytes even when configured lower', () => {
        const text = 'A'.repeat(500);
        const response = success(text);
        // Configure with 100 bytes (below minimum)
        const guarded = applyEgressGuard(response, 100);

        // Should apply minimum of 1024 — 500 bytes is within that
        expect(guarded).toBe(response);
    });

    it('should handle empty content gracefully', () => {
        const response = success('');
        const guarded = applyEgressGuard(response, 1024);
        expect(guarded).toBe(response); // Empty string is within any limit
    });
});

// ============================================================================
// 6. Error flag preservation
// ============================================================================

describe('EgressGuard: Error Flag Preservation', () => {
    it('should preserve isError flag when truncating error responses', () => {
        const text = 'Error: '.repeat(500); // Large error message
        const response = error(text);
        const guarded = applyEgressGuard(response, 1024);

        expect(guarded.isError).toBe(true);
        expect(guarded.content[0]!.text).toContain('SYSTEM INTERVENTION');
    });

    it('should NOT set isError on truncated non-error responses', () => {
        const text = 'Data: '.repeat(500);
        const response = success(text);
        const guarded = applyEgressGuard(response, 1024);

        expect(guarded.isError).toBeUndefined();
    });
});
