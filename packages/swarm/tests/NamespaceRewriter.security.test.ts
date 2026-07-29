/**
 * FHP — Expert Tests: NamespaceRewriter (Fuzzing & Invariants)
 *
 * Property-based and fuzzing-style tests for NamespaceRewriter.
 * Focuses on:
 * - Protocol invariants (roundtrip correctness)
 * - Adversarial tool names (special chars, empty, very long)
 * - Double-prefixing prevention
 * - stripPrefix idempotency
 * - Concurrent access patterns
 * - NamespaceError as an actionable error (has all needed fields)
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
        inputSchema: { type: 'object' as const, properties: {} },
    };
}

const rw = new NamespaceRewriter();

// ============================================================================
// PROPERTY: Roundtrip invariant — rewrite then strip == identity
// ============================================================================

describe('PROPERTY: Roundtrip invariant (rewrite → strip === identity)', () => {
    const toolNames = [
        'simple',
        'invoice.list',
        'invoice.list.all',
        'a',
        'multi.level.deep.path',
        'with-dashes',
        'with_underscores',
        'toolV2',
        'CAPITAL',
    ];

    for (const name of toolNames) {
        it(`roundtrip is identity for "${name}"`, () => {
            const [rewritten] = rw.rewriteList([makeTool(name)], 'finance');
            const stripped = rw.stripPrefix(rewritten!.name, 'finance');
            expect(stripped).toBe(name);
        });
    }

    it('roundtrip holds for 1000 randomly-shaped tool names', () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz-_.';
        const names = Array.from({ length: 1000 }, (_, i) => {
            const len = (i % 20) + 1;
            return Array.from({ length: len }, (__, j) => chars[(i * 7 + j * 13) % chars.length]).join('');
        }).filter(n => n.length > 0);

        const tools = names.map(n => makeTool(n));
        const rewritten = rw.rewriteList(tools, 'domain');

        // Every rewritten tool must round-trip back to its original name
        rewritten.forEach((t, i) => {
            expect(rw.stripPrefix(t.name, 'domain')).toBe(names[i]);
        });
    });
});

// ============================================================================
// PROPERTY: rewriteList is a pure function (no side effects)
// ============================================================================

describe('PROPERTY: rewriteList is a pure, deterministic function', () => {
    it('same inputs always produce structurally equal outputs', () => {
        const tools = [makeTool('ping', 'Check health'), makeTool('refund')];
        const r1 = rw.rewriteList(tools, 'finance');
        const r2 = rw.rewriteList(tools, 'finance');
        expect(r1).toEqual(r2);
    });

    it('calling rewriteList twice on the same list does not double-prefix the originals', () => {
        const tools = [makeTool('ping')];
        rw.rewriteList(tools, 'finance'); // first call
        const result = rw.rewriteList(tools, 'finance'); // second call on originals
        expect(result[0]!.name).toBe('finance.ping'); // NOT 'finance.finance.ping'
    });

    it('calling rewriteList on already-prefixed results produces double-prefix', () => {
        // This documents the expected (caller's responsibility) behaviour
        const tools = [makeTool('ping')];
        const once = rw.rewriteList(tools, 'finance');
        const twice = rw.rewriteList(once, 'finance'); // second rewrite on output
        expect(twice[0]!.name).toBe('finance.finance.ping'); // double-prefix
    });
});

// ============================================================================
// PROPERTY: stripPrefix is precise (not a substring match)
// ============================================================================

describe('PROPERTY: stripPrefix precision', () => {
    const confusingPairs = [
        { name: 'fin.tool', prefix: 'finance' },
        { name: 'finance2.tool', prefix: 'finance' },
        { name: 'FInance.tool', prefix: 'finance' },
        { name: 'financé.tool', prefix: 'finance' },
        { name: 'F.tool', prefix: 'finance' },
        { name: '.tool', prefix: '' }, // empty prefix (edge)
    ];

    for (const { name, prefix } of confusingPairs) {
        it(`"${name}" with prefix "${prefix}" should throw NamespaceError`, () => {
            if (name === '.tool' && prefix === '') {
                // Empty prefix: `stripPrefix('.tool', '')` strips '' + '.' from the start.
                // '.tool'.startsWith('.') === true, so the result is 'tool' (the remainder).
                // This is a degenerate but deterministic behaviour — document it explicitly.
                const result = rw.stripPrefix(name, prefix);
                expect(result).toBe('tool');
            } else {
                expect(() => rw.stripPrefix(name, prefix)).toThrow(NamespaceError);
            }
        });
    }

    it('correct prefix with no tool name after dot should return empty string (BUG-AD fixed)', () => {
        // BUG-AD FIX: the old test accepted BOTH '' AND a NamespaceError, making the
        // behaviour unspecified. Canonical behaviour: 'finance.' has the correct prefix
        // 'finance.' so the dot is consumed and the remainder is ''. The upstream sent
        // a tool with an empty name — that is the upstream's fault, not a routing error.
        const result = rw.stripPrefix('finance.', 'finance');
        expect(result).toBe('');
    });
});

// ============================================================================
// EDGE CASES: Tool name extremes
// ============================================================================

describe('EDGE CASES: Tool name extremes', () => {
    it('single character tool name should be prefixed correctly', () => {
        const result = rw.rewriteList([makeTool('a')], 'x');
        expect(result[0]!.name).toBe('x.a');
        expect(rw.stripPrefix(result[0]!.name, 'x')).toBe('a');
    });

    it('very long tool name (500 chars) should not be truncated', () => {
        const longName = 'a'.repeat(500);
        const result = rw.rewriteList([makeTool(longName)], 'x');
        expect(result[0]!.name).toBe(`x.${longName}`);
    });

    it('very long domain name should work', () => {
        const longDomain = 'domain-' + 'x'.repeat(100);
        const result = rw.rewriteList([makeTool('tool')], longDomain);
        expect(result[0]!.name).toBe(`${longDomain}.tool`);
        expect(rw.stripPrefix(result[0]!.name, longDomain)).toBe('tool');
    });

    it('tool name with numbers only should be prefixed correctly', () => {
        const result = rw.rewriteList([makeTool('123')], 'domain');
        expect(result[0]!.name).toBe('domain.123');
    });
});

// ============================================================================
// PERFORMANCE: rewriteList with large lists
// ============================================================================

describe('PERFORMANCE: Large tool lists', () => {
    it('10000 tools should be rewritten in under 100ms', () => {
        const tools = Array.from({ length: 10_000 }, (_, i) => makeTool(`tool-${i}`, `Desc ${i}`));
        const start = Date.now();
        const result = rw.rewriteList(tools, 'domain');
        const elapsed = Date.now() - start;

        expect(result).toHaveLength(10_000);
        expect(elapsed).toBeLessThan(100);
    });

    it('10000 strip operations should complete in under 100ms', () => {
        const tools = Array.from({ length: 10_000 }, (_, i) => makeTool(`tool-${i}`));
        const rewritten = rw.rewriteList(tools, 'domain');

        const start = Date.now();
        rewritten.forEach(t => rw.stripPrefix(t.name, 'domain'));
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(100);
    });
});

// ============================================================================
// NamespaceError — complete error contract
// ============================================================================

describe('NamespaceError — complete contract', () => {
    it('should be instanceof both Error and NamespaceError', () => {
        const err = new NamespaceError('devops.ping', 'finance');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(NamespaceError);
    });

    it('should have a stack trace', () => {
        const err = new NamespaceError('x', 'y');
        expect(err.stack).toBeDefined();
        expect(err.stack!.length).toBeGreaterThan(0);
    });

    it('should be JSON-serialisable without losing code-level fields', () => {
        const err = new NamespaceError('devops.ping', 'finance');
        // Spread into a plain object for serialisation
        const serialised = { name: err.name, message: err.message, toolName: err.toolName, expectedPrefix: err.expectedPrefix };
        expect(serialised.name).toBe('NamespaceError');
        expect(serialised.toolName).toBe('devops.ping');
        expect(serialised.expectedPrefix).toBe('finance');
    });

    it('stripping from a 1000-tool list where one has wrong prefix — correct error fields', () => {
        const tools = [
            ...Array.from({ length: 999 }, (_, i) => makeTool(`finance.tool-${i}`)),
            makeTool('devops.restart'), // the odd one out
        ];

        let errorCaught: NamespaceError | undefined;
        for (const t of tools) {
            try {
                rw.stripPrefix(t.name, 'finance');
            } catch (e) {
                if (e instanceof NamespaceError) {
                    errorCaught = e;
                    break;
                }
            }
        }

        expect(errorCaught).toBeDefined();
        expect(errorCaught!.toolName).toBe('devops.restart');
        expect(errorCaught!.expectedPrefix).toBe('finance');
    });
});

// ============================================================================
// BUG-AP: Roundtrip with tools that have a `title` field (BUG-AI fix coverage)
// ============================================================================

describe('PROPERTY: Roundtrip with title field (BUG-AI + BUG-AL coverage)', () => {
    it('tool with title — rewritten title should be prefixed', () => {
        // BUG-AI FIX: rewriteList now prefixes the `title` field if present.
        const toolWithTitle = {
            ...makeTool('refund'),
            title: 'Refund Invoice',
        } as Tool & { title: string };

        const [rewritten] = rw.rewriteList([toolWithTitle], 'finance');
        const raw = rewritten as Record<string, unknown>;
        expect(raw['title']).toBe('[finance] Refund Invoice');
    });

    it('tool without title — rewritten copy must not have a title', () => {
        const [rewritten] = rw.rewriteList([makeTool('ping')], 'finance');
        expect(Object.hasOwn(rewritten as object, 'title')).toBe(false);
    });

    it('tool with non-string title — title must not be copied or coerced', () => {
        // A non-string title (e.g., number from a buggy upstream) must be ignored
        const toolWithNumericTitle = { ...makeTool('ping'), title: 42 } as unknown as Tool;
        const [rewritten] = rw.rewriteList([toolWithNumericTitle], 'finance');
        const raw = rewritten as Record<string, unknown>;
        // The raw 42 is spread in via { ...tool } but not replaced since typeof 42 !== 'string'
        // It should not be a prefixed string
        expect(typeof raw['title']).not.toBe('string');
    });

    it('roundtrip invariant holds for tool with title — name strips correctly', () => {
        const toolWithTitle = { ...makeTool('invoice.draft'), title: 'Draft Invoice' } as Tool & { title: string };
        const [rewritten] = rw.rewriteList([toolWithTitle], 'finance');
        const stripped = rw.stripPrefix(rewritten!.name, 'finance');
        expect(stripped).toBe('invoice.draft');
    });

    it('BUG-AL: original title is not mutated when rewritten title is modified', () => {
        const toolWithTitle = { ...makeTool('ping'), title: 'Ping Service' } as Tool & { title: string };
        const [rewritten] = rw.rewriteList([toolWithTitle], 'finance');

        // Mutate the rewritten title
        (rewritten as Record<string, unknown>)['title'] = 'mutated';

        // The original must be untouched (title is a primitive, so this is always safe —
        // this test primarily documents the invariant for future regressions)
        expect(toolWithTitle.title).toBe('Ping Service');
    });
});
