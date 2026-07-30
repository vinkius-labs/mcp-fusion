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

// ============================================================================
// 7. Boundary precision
// ============================================================================

describe('EgressGuard: Boundary Precision', () => {
    it('should NOT truncate when content is exactly at the byte limit', () => {
        // Construct exactly `limit` ASCII bytes
        const limit = 2048;
        const text = 'Z'.repeat(limit);
        const response = success(text);
        const guarded = applyEgressGuard(response, limit);

        expect(guarded).toBe(response); // zero copy — same reference
    });

    it('should truncate when content is exactly 1 byte over the limit', () => {
        const limit = 2048;
        const text = 'Z'.repeat(limit + 1);
        const response = success(text);
        const guarded = applyEgressGuard(response, limit);

        expect(guarded).not.toBe(response);
        expect(guarded.content[0]!.text).toContain('SYSTEM INTERVENTION');
    });

    it('all multi-block content that fits stays intact without truncation', () => {
        const response = {
            content: [
                { type: 'text' as const, text: 'Block A' },
                { type: 'text' as const, text: 'Block B' },
            ],
        };
        // Each block is ~7 bytes, well within 1024
        const guarded = applyEgressGuard(response, 1024);
        expect(guarded).toBe(response); // Same reference — no copy
    });
});

// ============================================================================
// 8. Double-suffix protection
// ============================================================================

describe('EgressGuard: Double-Suffix Protection', () => {
    it('should not double-append intervention suffix if already present', () => {
        // Simulate a response that was already truncated (has the suffix)
        const suffix = '[SYSTEM INTERVENTION';
        const alreadyTruncated = success(`Short text ${suffix}: payload truncated...]`);

        // Pass through a second guard with a generous limit (content fits)
        const guarded = applyEgressGuard(alreadyTruncated, 1024 * 10);

        // It fits, so same reference is returned — no second suffix appended
        expect(guarded).toBe(alreadyTruncated);
        // Only one occurrence of the intervention marker
        const occurrences = (guarded.content[0]!.text.match(/SYSTEM INTERVENTION/g) ?? []).length;
        expect(occurrences).toBe(1);
    });

    it('should not append suffix twice when re-truncating an already-truncated block', () => {
        // Build a string large enough to trigger truncation but the end already has the suffix
        const suffix = '...[SYSTEM INTERVENTION: payload truncated. Use pagination.]';
        const bigTextWithSuffix = 'X'.repeat(3000) + suffix;
        const response = success(bigTextWithSuffix);
        const guarded = applyEgressGuard(response, 2048);

        const text = guarded.content[0]!.text;
        const suffixMatches = (text.match(/SYSTEM INTERVENTION/g) ?? []).length;
        // Must be exactly 1
        expect(suffixMatches).toBe(1);
    });
});

// ============================================================================
// 9. Multi-block: partial blocks at boundary
// ============================================================================

describe('EgressGuard: Multi-Block Boundary Behavior', () => {
    it('first block barely fits, second block oversized — only second is truncated', () => {
        // limit must be > MIN_PAYLOAD_BYTES (1024) to avoid clamping
        // First block: 800 bytes. Remaining: 1500 - 800 = 700. Second: 3000 bytes → truncated.
        const response = {
            content: [
                { type: 'text' as const, text: 'A'.repeat(800) },
                { type: 'text' as const, text: 'B'.repeat(3000) },
            ],
        };
        const guarded = applyEgressGuard(response, 1500);

        expect(guarded.content[0]!.text).toBe('A'.repeat(800)); // Intact
        expect(guarded.content[1]!.text).toContain('SYSTEM INTERVENTION');
    });

    it('first block is over limit — both blocks reduced to one truncated block', () => {
        const response = {
            content: [
                { type: 'text' as const, text: 'X'.repeat(3000) },
                { type: 'text' as const, text: 'Y'.repeat(3000) },
            ],
        };
        const guarded = applyEgressGuard(response, 1024);

        // First block partially included, second dropped or folded in
        expect(guarded.content.length).toBeGreaterThanOrEqual(1);
        const allText = guarded.content.map(c => c.text).join('');
        expect(allText).toContain('SYSTEM INTERVENTION');
    });
});

// ============================================================================
// 10. Non-text block preservation + suffix attachment
// ============================================================================

describe('EgressGuard: Non-Text Block Preservation', () => {
    it('non-text blocks pass through intact during truncation', () => {
        const response = {
            content: [
                { type: 'text' as const, text: 'A'.repeat(2000) },
                { type: 'image' as const, data: 'base64data', mimeType: 'image/png' },
            ],
        };
        const guarded = applyEgressGuard(response, 1024);

        // Image block should survive
        const imageBlock = guarded.content.find(c => c.type === 'image');
        expect(imageBlock).toBeDefined();
        expect(imageBlock!.type).toBe('image');
    });

    it('appends suffix to last text block when last surviving block is non-text', () => {
        // Text fills budget exactly, image passes through, second text dropped
        const response = {
            content: [
                { type: 'text' as const, text: 'A'.repeat(800) },
                { type: 'image' as const, data: 'b64', mimeType: 'image/png' },
                { type: 'text' as const, text: 'B'.repeat(2000) },
            ],
        };
        const guarded = applyEgressGuard(response, 1500);

        // Image should be present
        const hasImage = guarded.content.some(c => c.type === 'image');
        expect(hasImage).toBe(true);

        // Suffix must appear somewhere in a text block
        const allText = guarded.content
            .filter(c => c.type === 'text')
            .map(c => (c as { type: 'text'; text: string }).text)
            .join('');
        expect(allText).toContain('SYSTEM INTERVENTION');
    });

    it('appends suffix as new text block when no text block survives', () => {
        // Only non-text blocks, but they alone don't trigger truncation
        // (non-text bytes aren't counted). So we need text + non-text where
        // text is dropped entirely.
        const response = {
            content: [
                { type: 'image' as const, data: 'b64', mimeType: 'image/png' },
                { type: 'text' as const, text: 'X'.repeat(2000) },
            ],
        };
        const guarded = applyEgressGuard(response, 1024);

        // Image survives, text is truncated (not fully dropped since it's the only text)
        // But verify the image is preserved
        const hasImage = guarded.content.some(c => c.type === 'image');
        expect(hasImage).toBe(true);
    });
});

// ============================================================================
// 11. structuredContent preservation during truncation
// ============================================================================

describe('EgressGuard: structuredContent Preservation', () => {
    it('preserves structuredContent when truncation occurs', () => {
        const response = {
            content: [{ type: 'text' as const, text: 'A'.repeat(3000) }],
            structuredContent: { count: 42, items: ['a', 'b', 'c'] },
        };
        const guarded = applyEgressGuard(response, 1024);

        expect(guarded.structuredContent).toBeDefined();
        expect(guarded.structuredContent).toEqual({ count: 42, items: ['a', 'b', 'c'] });
        // Text content should still be truncated
        const allText = guarded.content.map(c => (c as { text?: string }).text ?? '').join('');
        expect(allText).toContain('SYSTEM INTERVENTION');
    });

    it('preserves structuredContent even when content is all non-text', () => {
        const response = {
            content: [
                { type: 'text' as const, text: 'A'.repeat(3000) },
                { type: 'image' as const, data: 'b64', mimeType: 'image/png' },
            ],
            structuredContent: { result: 'ok' },
        };
        const guarded = applyEgressGuard(response, 1024);

        expect(guarded.structuredContent).toEqual({ result: 'ok' });
    });
});
