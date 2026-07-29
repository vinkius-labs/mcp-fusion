/**
 * FHP — Deep Tests: NamespaceRewriter
 *
 * Covers nested prefixing, reverse stripping, immutability invariants,
 * and all NamespaceError edge cases.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { NamespaceRewriter, NamespaceError } from '../src/NamespaceRewriter.ts';
import type { Tool } from "@modelcontextprotocol/server";

function makeTool(name: string, description?: string): Tool {
    return {
        name,
        description,
        inputSchema: { type: 'object' as const, properties: { input: { type: 'string' } } },
    };
}

const rewriter = new NamespaceRewriter();

// ============================================================================
// rewriteList — immutability
// ============================================================================

describe('rewriteList() — immutability', () => {
    it('should not mutate the original list', () => {
        const tools = [makeTool('refund'), makeTool('invoice')];
        const originals = tools.map(t => ({ ...t }));
        rewriter.rewriteList(tools, 'finance');
        expect(tools).toEqual(originals);
    });

    it('should not mutate the original tool objects', () => {
        const tool = makeTool('refund');
        const origName = tool.name;
        rewriter.rewriteList([tool], 'finance');
        expect(tool.name).toBe(origName);
    });

    it('should return a new list reference', () => {
        const tools = [makeTool('refund')];
        const result = rewriter.rewriteList(tools, 'finance');
        expect(result).not.toBe(tools);
    });

    it('BUG-AL: mutations to the rewritten inputSchema must not affect the original tool (structuredClone isolation)', () => {
        // BUG-AL FIX: rewriteList now uses structuredClone(tool.inputSchema) so the
        // original and the rewritten copy have independent schema objects.
        const tool = makeTool('refund');
        const originalPropertiesRef = tool.inputSchema.properties;
        const [rewritten] = rewriter.rewriteList([tool], 'finance');

        // Mutate the rewritten schema
        (rewritten!.inputSchema.properties as Record<string, unknown>)['injected'] = { type: 'string' };

        // The original must be unaffected
        expect(tool.inputSchema.properties).not.toHaveProperty('injected');
        // And the original properties reference must still be the same object
        expect(tool.inputSchema.properties).toBe(originalPropertiesRef);
    });
});

// ============================================================================
// rewriteList — name prefixing
// ============================================================================

describe('rewriteList() — name prefixing', () => {
    it('should prefix simple names', () => {
        const result = rewriter.rewriteList([makeTool('invoice')], 'billing');
        expect(result[0]!.name).toBe('billing.invoice');
    });

    it('should prefix names already containing dots (sub-tools)', () => {
        const result = rewriter.rewriteList([makeTool('invoice.draft')], 'billing');
        expect(result[0]!.name).toBe('billing.invoice.draft');
    });

    it('should preserve the inputSchema after prefixing', () => {
        const original = makeTool('ping');
        const result = rewriter.rewriteList([original], 'devops');
        expect(result[0]!.inputSchema).toEqual(original.inputSchema);
    });

    it('should work with a long prefix containing dashes', () => {
        const result = rewriter.rewriteList([makeTool('run')], 'my-long-domain-name-v2');
        expect(result[0]!.name).toBe('my-long-domain-name-v2.run');
    });

    it('should process large lists without losing entries', () => {
        const tools = Array.from({ length: 100 }, (_, i) => makeTool(`tool-${i}`));
        const result = rewriter.rewriteList(tools, 'x');
        expect(result).toHaveLength(100);
        expect(result.every(t => t.name.startsWith('x.'))).toBe(true);
    });
});

// ============================================================================
// rewriteList — description prefixing
// ============================================================================

describe('rewriteList() — description', () => {
    it('should prefix a description with [domain]', () => {
        const result = rewriter.rewriteList([makeTool('ping', 'Check connectivity')], 'devops');
        expect(result[0]!.description).toBe('[devops] Check connectivity');
    });

    it('should use "[domain]" as placeholder when description is undefined', () => {
        const tool: Tool = { name: 'ping', inputSchema: { type: 'object' as const, properties: {} } };
        const result = rewriter.rewriteList([tool], 'devops');
        expect(result[0]!.description).toBe('[devops]');
    });

    it('should use "[domain]" as placeholder when description is empty string (falsy)', () => {
        const tool = makeTool('ping', '');
        const result = rewriter.rewriteList([tool], 'devops');
        // '' is falsy → uses the placeholder branch
        expect(result[0]!.description).toBe('[devops]');
    });
});

// ============================================================================
// stripPrefix — correct behaviour
// ============================================================================

describe('stripPrefix() — behaviour', () => {
    it('should strip a simple prefix', () => {
        expect(rewriter.stripPrefix('finance.refund', 'finance')).toBe('refund');
    });

    it('should preserve sub-names after stripping', () => {
        expect(rewriter.stripPrefix('finance.invoice.list', 'finance')).toBe('invoice.list');
    });

    it('prefix matching is case-sensitive', () => {
        expect(() => rewriter.stripPrefix('Finance.refund', 'finance')).toThrow(NamespaceError);
    });

    it('should work with a hyphenated prefix', () => {
        expect(rewriter.stripPrefix('my-domain.tool', 'my-domain')).toBe('tool');
    });

    it('should perform a perfect roundtrip: rewrite → strip', () => {
        const original = makeTool('invoice.draft');
        const [rewritten] = rewriter.rewriteList([original], 'finance');
        const stripped = rewriter.stripPrefix(rewritten!.name, 'finance');
        expect(stripped).toBe('invoice.draft');
    });
});

// ============================================================================
// stripPrefix — NamespaceError
// ============================================================================

describe('stripPrefix() — NamespaceError', () => {
    it('should have name="NamespaceError"', () => {
        const err = new NamespaceError('wrong.tool', 'finance');
        expect(err.name).toBe('NamespaceError');
    });

    it('should expose toolName and expectedPrefix as public properties', () => {
        const err = new NamespaceError('devops.restart', 'finance');
        expect(err.toolName).toBe('devops.restart');
        expect(err.expectedPrefix).toBe('finance');
    });

    it('the message should include both the tool name and the expected prefix', () => {
        const err = new NamespaceError('devops.restart', 'finance');
        expect(err.message).toContain('devops.restart');
        expect(err.message).toContain('finance');
    });

    it('should be instanceof Error', () => {
        expect(new NamespaceError('a', 'b')).toBeInstanceOf(Error);
    });

    it('should throw NamespaceError for a name that starts with the prefix but lacks the dot', () => {
        // 'financex' starts with 'finance' but is not qualified by 'finance.'
        expect(() => rewriter.stripPrefix('financex.refund', 'finance')).toThrow(NamespaceError);
    });

    it('should throw for a tool with no prefix at all', () => {
        expect(() => rewriter.stripPrefix('refund', 'finance')).toThrow(NamespaceError);
    });

    it('should throw for a tool with a different domain prefix', () => {
        expect(() => rewriter.stripPrefix('devops.restart', 'finance')).toThrow(NamespaceError);
    });
});
