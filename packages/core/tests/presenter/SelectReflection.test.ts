/**
 * Select Reflection Tests
 *
 * Validates the `_select` context window optimization feature:
 * - extractZodKeys(): recursive Zod schema unwrapping
 * - pickFields(): shallow top-level field filtering
 * - applySelectFilter(): single + array mode
 * - Late Guillotine: UI blocks see full data, wire data filtered
 * - Schema injection: enableSelect() injects _select enum
 * - Defense-in-depth: invalid/malicious keys silently ignored
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { extractZodKeys, pickFields, applySelectFilter } from '../../src/presenter/SelectUtils.js';
import { createTool, success } from '../../src/index.js';

// ── Test Fixtures ────────────────────────────────────────

const invoiceSchema = z.object({
    id: z.string(),
    status: z.enum(['paid', 'pending', 'overdue']),
    amount: z.number(),
    client: z.object({
        name: z.string(),
        email: z.string(),
    }),
});

// ── extractZodKeys ───────────────────────────────────────

describe('extractZodKeys', () => {
    it('should extract keys from a plain ZodObject', () => {
        const keys = extractZodKeys(z.object({ id: z.string(), name: z.string() }));
        expect(keys).toEqual(['id', 'name']);
    });

    it('should unwrap ZodOptional → ZodObject', () => {
        const schema = z.object({ id: z.string(), status: z.string() }).optional();
        expect(extractZodKeys(schema)).toEqual(['id', 'status']);
    });

    it('should unwrap ZodNullable → ZodObject', () => {
        const schema = z.object({ id: z.string() }).nullable();
        expect(extractZodKeys(schema)).toEqual(['id']);
    });

    it('should unwrap ZodDefault → ZodObject', () => {
        const schema = z.object({ id: z.string(), name: z.string() }).default({ id: '0', name: 'N/A' });
        expect(extractZodKeys(schema)).toEqual(['id', 'name']);
    });

    it('should unwrap ZodEffects (refine) → ZodObject', () => {
        const schema = z.object({ id: z.string(), value: z.number() })
            .refine(d => d.value > 0);
        expect(extractZodKeys(schema)).toEqual(['id', 'value']);
    });

    it('should unwrap ZodArray → element ZodObject', () => {
        const schema = z.array(z.object({ id: z.string(), name: z.string() }));
        expect(extractZodKeys(schema)).toEqual(['id', 'name']);
    });

    it('should unwrap chained modifiers: Optional → Nullable → Object', () => {
        const schema = z.object({ a: z.string(), b: z.number() }).nullable().optional();
        expect(extractZodKeys(schema)).toEqual(['a', 'b']);
    });

    it('should return [] for non-object schemas (z.string)', () => {
        expect(extractZodKeys(z.string())).toEqual([]);
    });

    it('should return [] for z.any()', () => {
        expect(extractZodKeys(z.any())).toEqual([]);
    });

    it('should return [] for z.record()', () => {
        expect(extractZodKeys(z.record(z.string()))).toEqual([]);
    });

    it('should extract full invoice schema keys', () => {
        const keys = extractZodKeys(invoiceSchema);
        expect(keys).toEqual(['id', 'status', 'amount', 'client']);
    });
});

// ── pickFields ───────────────────────────────────────────

describe('pickFields', () => {
    it('should keep only selected keys', () => {
        const data = { id: '1', status: 'paid', amount: 100, client: { name: 'A', email: 'a@b.c' } };
        const result = pickFields(data, new Set(['status', 'amount']));
        expect(result).toEqual({ status: 'paid', amount: 100 });
    });

    it('should return nested objects whole (shallow)', () => {
        const data = { id: '1', client: { name: 'A', email: 'a@b.c' } };
        const result = pickFields(data, new Set(['client']));
        expect(result).toEqual({ client: { name: 'A', email: 'a@b.c' } });
    });

    it('should silently ignore non-existent keys', () => {
        const data = { id: '1', status: 'paid' };
        const result = pickFields(data, new Set(['status', 'nonexistent']));
        expect(result).toEqual({ status: 'paid' });
    });

    it('should return empty object when no keys match', () => {
        const data = { id: '1', status: 'paid' };
        const result = pickFields(data, new Set(['unknown']));
        expect(result).toEqual({});
    });

    it('should return all fields when all keys are selected', () => {
        const data = { id: '1', status: 'paid', amount: 100 };
        const result = pickFields(data, new Set(['id', 'status', 'amount']));
        expect(result).toEqual(data);
    });
});

// ── applySelectFilter ────────────────────────────────────

describe('applySelectFilter', () => {
    it('should filter a single object', () => {
        const data = { id: '1', status: 'paid', amount: 100 };
        const result = applySelectFilter(data, ['status'], false);
        expect(result).toEqual({ status: 'paid' });
    });

    it('should filter each item in an array', () => {
        const data = [
            { id: '1', status: 'paid', amount: 100 },
            { id: '2', status: 'pending', amount: 200 },
        ];
        const result = applySelectFilter(data, ['status', 'amount'], true);
        expect(result).toEqual([
            { status: 'paid', amount: 100 },
            { status: 'pending', amount: 200 },
        ]);
    });

    it('should handle empty array', () => {
        const result = applySelectFilter([], ['status'], true);
        expect(result).toEqual([]);
    });
});

// ── Late Guillotine (Presenter.make) ─────────────────────

describe('Late Guillotine', () => {
    it('should filter wire data but preserve full data for UI blocks', () => {
        let capturedUiData: unknown;

        const presenter = createPresenter('Invoice')
            .schema(invoiceSchema)
            .uiBlocks((data) => {
                // UI callback should receive FULL data, not filtered
                capturedUiData = data;
                return [{ type: 'markdown', content: `Invoice ${(data as { id: string }).id}: ${(data as { amount: number }).amount}` }];
            });

        const fullData = { id: 'INV-001', status: 'paid' as const, amount: 5000, client: { name: 'Acme', email: 'billing@acme.com' } };

        // Filter to only 'status'
        const response = presenter.make(fullData, undefined, ['status']);
        const built = response.build();

        // UI callback received full data (including id, amount, client)
        expect(capturedUiData).toEqual(fullData);

        // Wire data (first content block) should only contain 'status'
        const dataBlock = built.content[0];
        expect(dataBlock.type).toBe('text');
        const wireData = JSON.parse((dataBlock as { text: string }).text);
        expect(wireData).toEqual({ status: 'paid' });
        expect(wireData).not.toHaveProperty('id');
        expect(wireData).not.toHaveProperty('amount');
        expect(wireData).not.toHaveProperty('client');
    });

    it('should return full data when no selectFields provided', () => {
        const presenter = createPresenter('Invoice').schema(invoiceSchema);
        const fullData = { id: 'INV-002', status: 'pending' as const, amount: 3000, client: { name: 'B', email: 'b@b.com' } };

        const response = presenter.make(fullData);
        const built = response.build();
        const wireData = JSON.parse((built.content[0] as { text: string }).text);

        expect(wireData).toEqual(fullData);
    });

    it('should return full data when selectFields is empty array', () => {
        const presenter = createPresenter('Invoice').schema(invoiceSchema);
        const fullData = { id: 'INV-003', status: 'overdue' as const, amount: 1000, client: { name: 'C', email: 'c@c.com' } };

        const response = presenter.make(fullData, undefined, []);
        const built = response.build();
        const wireData = JSON.parse((built.content[0] as { text: string }).text);

        expect(wireData).toEqual(fullData);
    });

    it('should filter each item in an array independently', () => {
        const presenter = createPresenter('Invoice').schema(invoiceSchema);
        const items = [
            { id: 'INV-A', status: 'paid' as const, amount: 100, client: { name: 'X', email: 'x@x.com' } },
            { id: 'INV-B', status: 'pending' as const, amount: 200, client: { name: 'Y', email: 'y@y.com' } },
        ];

        const response = presenter.make(items, undefined, ['id', 'status']);
        const built = response.build();
        const wireData = JSON.parse((built.content[0] as { text: string }).text);

        expect(wireData).toEqual([
            { id: 'INV-A', status: 'paid' },
            { id: 'INV-B', status: 'pending' },
        ]);
    });

    it('should preserve system rules even when data is filtered', () => {
        const presenter = createPresenter('Invoice')
            .schema(invoiceSchema)
            .systemRules((data) => [
                `Invoice ${(data as { id: string }).id} has status ${(data as { status: string }).status}`,
            ]);

        const fullData = { id: 'INV-R', status: 'paid' as const, amount: 9999, client: { name: 'R', email: 'r@r.com' } };
        const response = presenter.make(fullData, undefined, ['status']);
        const built = response.build();

        // Rules block should contain the full data references
        const rulesBlock = built.content.find(c =>
            (c as { text?: string }).text?.includes('INV-R'),
        );
        expect(rulesBlock).toBeDefined();
    });
});

// ── Schema Injection (enableSelect) ──────────────────────

describe('enableSelect() schema injection', () => {
    it('should inject _select property when enableSelect() is called', () => {
        const InvoicePresenter = createPresenter('Invoice').schema(invoiceSchema);

        const tool = createTool('invoices')
            .enableSelect()
            .action({
                name: 'get',
                schema: z.object({ id: z.string() }),
                returns: InvoicePresenter,
                handler: async (_ctx, _args) => ({ id: '1', status: 'paid', amount: 100, client: { name: 'A', email: 'a@a.com' } }),
            });

        const definition = tool.buildToolDefinition();
        const schema = definition.inputSchema as { properties: Record<string, { type?: string; items?: { enum?: string[] } }> };

        expect(schema.properties).toHaveProperty('_select');
        expect(schema.properties['_select'].type).toBe('array');
        expect(schema.properties['_select'].items?.enum).toContain('id');
        expect(schema.properties['_select'].items?.enum).toContain('status');
        expect(schema.properties['_select'].items?.enum).toContain('amount');
        expect(schema.properties['_select'].items?.enum).toContain('client');
    });

    it('should NOT inject _select when enableSelect() is NOT called', () => {
        const InvoicePresenter = createPresenter('Invoice').schema(invoiceSchema);

        const tool = createTool('invoices')
            .action({
                name: 'get',
                schema: z.object({ id: z.string() }),
                returns: InvoicePresenter,
                handler: async () => ({ id: '1', status: 'paid', amount: 100, client: { name: 'A', email: 'a@a.com' } }),
            });

        const definition = tool.buildToolDefinition();
        const schema = definition.inputSchema as { properties: Record<string, unknown> };

        expect(schema.properties).not.toHaveProperty('_select');
    });

    it('should NOT inject _select for actions without Presenter', () => {
        const tool = createTool('echo')
            .enableSelect()
            .action({
                name: 'say',
                schema: z.object({ message: z.string() }),
                handler: async (_ctx, args) => success(args.message),
            });

        const definition = tool.buildToolDefinition();
        const schema = definition.inputSchema as { properties: Record<string, unknown> };

        expect(schema.properties).not.toHaveProperty('_select');
    });
});

// ── Defense-in-Depth ─────────────────────────────────────

describe('Defense-in-depth', () => {
    it('should silently ignore invalid keys in _select', () => {
        const data = { id: '1', status: 'paid', amount: 100 };
        const result = applySelectFilter(data, ['status', '__proto__', 'constructor', 'nonexistent'], false);

        // Only 'status' actually exists in data
        expect(result).toEqual({ status: 'paid' });
        // No prototype pollution
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it('should handle empty _select gracefully', () => {
        const data = { id: '1', status: 'paid' };
        const result = applySelectFilter(data, [], false);
        expect(result).toEqual({});
    });

    it('should use getSchemaKeys() with recursive unwrapper', () => {
        const presenter = createPresenter('Wrapped')
            .schema(z.object({ a: z.string(), b: z.number() }).optional());

        expect(presenter.getSchemaKeys()).toEqual(['a', 'b']);
    });
});
