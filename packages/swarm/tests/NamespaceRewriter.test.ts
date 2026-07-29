/**
 * FHP — Tests: NamespaceRewriter
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { NamespaceRewriter, NamespaceError } from '../src/NamespaceRewriter.ts';
import type { Tool } from "@modelcontextprotocol/server";

function makeTool(name: string): Tool {
    return {
        name,
        description: `Tool ${name}`,
        inputSchema: { type: 'object' as const, properties: {} },
    };
}

describe('NamespaceRewriter.rewriteList()', () => {
    const rewriter = new NamespaceRewriter();

    it('should prefix tool names with the domain', () => {
        const tools = [makeTool('refund'), makeTool('invoice.list')];
        const result = rewriter.rewriteList(tools, 'finance');

        expect(result[0]!.name).toBe('finance.refund');
        expect(result[1]!.name).toBe('finance.invoice.list');
    });

    it('should prefix the description with the domain and preserve inputSchema', () => {
        const tool = makeTool('refund');
        tool.description = 'My description';
        const [result] = rewriter.rewriteList([tool], 'finance');

        expect(result!.description).toBe('[finance] My description');
        // BUG-AS FIX: toEqual only checks deep equality — it passes even if the two schemas
        // are the same object reference. .not.toBe() verifies rewriteList returns an
        // independent copy (structuredClone), so a regression removing the clone is caught.
        expect(result!.inputSchema).toEqual(tool.inputSchema);
        expect(result!.inputSchema).not.toBe(tool.inputSchema);
    });

    it('should use [prefix] as description placeholder when the tool has none', () => {
        const tool: Tool = { name: 'ping', inputSchema: { type: 'object' as const, properties: {} } };
        const [result] = rewriter.rewriteList([tool], 'devops');
        expect(result!.description).toBe('[devops]');
    });

    it('should return an empty list for empty input', () => {
        expect(rewriter.rewriteList([], 'finance')).toEqual([]);
    });

    it('should handle multiple tools', () => {
        const tools = [makeTool('a'), makeTool('b'), makeTool('c')];
        const result = rewriter.rewriteList(tools, 'devops');
        expect(result.map(t => t.name)).toEqual(['devops.a', 'devops.b', 'devops.c']);
    });
});

describe('NamespaceRewriter.stripPrefix()', () => {
    const rewriter = new NamespaceRewriter();

    it('should strip the correct domain prefix', () => {
        expect(rewriter.stripPrefix('finance.refund', 'finance')).toBe('refund');
    });

    it('should strip the prefix from a multi-segment name', () => {
        expect(rewriter.stripPrefix('finance.invoice.list', 'finance')).toBe('invoice.list');
    });

    it('should throw NamespaceError for a wrong prefix', () => {
        expect(() => rewriter.stripPrefix('devops.restart', 'finance')).toThrow(NamespaceError);
    });

    it('should throw NamespaceError for a name without any prefix', () => {
        expect(() => rewriter.stripPrefix('refund', 'finance')).toThrow(NamespaceError);
    });

    it('should throw NamespaceError when prefix is a substring but not a namespace', () => {
        // 'financex' starts with 'finance' but lacks the '.' separator
        expect(() => rewriter.stripPrefix('financex.refund', 'finance')).toThrow(NamespaceError);
    });
});
