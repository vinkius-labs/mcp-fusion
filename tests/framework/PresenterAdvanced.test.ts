/**
 * PresenterAdvanced.test.ts — Tests for the 4 Advanced Presenter Features
 *
 * 1. Context-Aware Presenters (RBAC)
 * 2. Cognitive Guardrails (agentLimit)
 * 3. Agentic Affordances (suggestActions)
 * 4. Presenter Composition (embed)
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createPresenter, ui } from '../../src/framework/presenter/index.js';

// ── Test Schemas ─────────────────────────────────────────

const userSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    department: z.string(),
});
type User = z.infer<typeof userSchema>;

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending']),
});
type Invoice = z.infer<typeof invoiceSchema>;

const clientSchema = z.object({
    id: z.string(),
    company: z.string(),
});

// ── Test Context ─────────────────────────────────────────

interface TestContext {
    user: { role: string; department: string };
    tenant: { locale: string };
}

const adminCtx: TestContext = {
    user: { role: 'admin', department: 'engineering' },
    tenant: { locale: 'en-US' },
};

const viewerCtx: TestContext = {
    user: { role: 'viewer', department: 'sales' },
    tenant: { locale: 'pt-BR' },
};

const financeCtx: TestContext = {
    user: { role: 'analyst', department: 'finance' },
    tenant: { locale: 'en-US' },
};

// =====================================================================
// Feature 1: Context-Aware Presenters (RBAC)
// =====================================================================

describe('Context-Aware Presenters', () => {
    it('should pass context to dynamic systemRules callback', () => {
        const presenter = createPresenter('User')
            .schema(userSchema)
            .systemRules((user: User, ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                return [
                    c?.user?.role !== 'admin' ? 'CRITICAL: Mask user email and phone number.' : null,
                    `Format dates using ${c?.tenant?.locale ?? 'en-US'}`,
                ];
            });

        // Admin context — no masking rule
        const adminResult = presenter.make(
            { id: 'U1', name: 'Alice', email: 'a@b.com', department: 'eng' },
            adminCtx,
        ).build();
        const adminRules = adminResult.content.find(c => c.text.includes('domain_rules'))?.text ?? '';
        expect(adminRules).not.toContain('Mask user email');
        expect(adminRules).toContain('Format dates using en-US');
    });

    it('should apply RBAC masking rules for non-admin context', () => {
        const presenter = createPresenter('User')
            .schema(userSchema)
            .systemRules((user: User, ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                return [
                    c?.user?.role !== 'admin' ? 'CRITICAL: Mask user email and phone number.' : null,
                ];
            });

        const viewerResult = presenter.make(
            { id: 'U1', name: 'Bob', email: 'b@b.com', department: 'sales' },
            viewerCtx,
        ).build();
        const viewerRules = viewerResult.content.find(c => c.text.includes('domain_rules'))?.text ?? '';
        expect(viewerRules).toContain('Mask user email');
    });

    it('should pass context to uiBlocks callback and filter nulls', () => {
        const presenter = createPresenter('User')
            .schema(userSchema)
            .uiBlocks((user: User, ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                return [
                    ui.markdown(`**${user.name}**`),
                    c?.user?.department === 'finance' ? ui.markdown('💰 Financial view') : null,
                ];
            });

        // Non-finance — should NOT have financial view
        const engResult = presenter.make(
            { id: 'U1', name: 'Alice', email: 'a@b.com', department: 'eng' },
            adminCtx,
        ).build();
        const engTexts = engResult.content.map(c => c.text);
        expect(engTexts.some(t => t.includes('**Alice**'))).toBe(true);
        expect(engTexts.some(t => t.includes('Financial view'))).toBe(false);
    });

    it('should show financial UI for finance department context', () => {
        const presenter = createPresenter('UserFinance')
            .schema(userSchema)
            .uiBlocks((user: User, ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                return [
                    ui.markdown(`**${user.name}**`),
                    c?.user?.department === 'finance' ? ui.markdown('💰 Financial view') : null,
                ];
            });

        const finResult = presenter.make(
            { id: 'U1', name: 'Bob', email: 'b@b.com', department: 'fin' },
            financeCtx,
        ).build();
        const finTexts = finResult.content.map(c => c.text);
        expect(finTexts.some(t => t.includes('Financial view'))).toBe(true);
    });

    it('should work without context (backward compatibility)', () => {
        const presenter = createPresenter('Simple')
            .systemRules(['Static rule 1', 'Static rule 2']);

        const result = presenter.make('hello').build();
        const rules = result.content.find(c => c.text.includes('domain_rules'))?.text ?? '';
        expect(rules).toContain('Static rule 1');
        expect(rules).toContain('Static rule 2');
    });

    it('should pass context to collectionUiBlocks callback', () => {
        const presenter = createPresenter('UserList')
            .schema(userSchema)
            .collectionUiBlocks((users: User[], ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                return [
                    ui.summary(`${users.length} users found (locale: ${c?.tenant?.locale ?? 'N/A'})`),
                ];
            });

        const result = presenter.make(
            [
                { id: 'U1', name: 'Alice', email: 'a@b.com', department: 'eng' },
                { id: 'U2', name: 'Bob', email: 'b@b.com', department: 'sales' },
            ],
            viewerCtx,
        ).build();
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('locale: pt-BR'))).toBe(true);
    });
});

// =====================================================================
// Feature 2: Cognitive Guardrails (agentLimit)
// =====================================================================

describe('Cognitive Guardrails (agentLimit)', () => {
    it('should truncate arrays exceeding the limit', () => {
        const presenter = createPresenter('Invoice')
            .schema(invoiceSchema)
            .agentLimit(3, (omitted) =>
                ui.summary(`⚠️ Truncated. 3 shown, ${omitted} hidden.`),
            );

        // 5 items → should truncate to 3
        const invoices = Array.from({ length: 5 }, (_, i) => ({
            id: `INV-${i}`,
            amount_cents: (i + 1) * 10000,
            status: 'paid' as const,
        }));

        const result = presenter.make(invoices).build();
        const dataBlock = result.content[0]!.text;
        const parsed = JSON.parse(dataBlock) as Invoice[];

        // Data should be truncated to 3
        expect(parsed).toHaveLength(3);
        expect(parsed[0]!.id).toBe('INV-0');
        expect(parsed[2]!.id).toBe('INV-2');

        // Should have a truncation warning block
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('Truncated') && t.includes('2 hidden'))).toBe(true);
    });

    it('should NOT truncate arrays within the limit', () => {
        const presenter = createPresenter('InvoiceSmall')
            .schema(invoiceSchema)
            .agentLimit(10, (omitted) =>
                ui.summary(`⚠️ Truncated. ${omitted} hidden.`),
            );

        const invoices = [
            { id: 'INV-1', amount_cents: 10000, status: 'paid' as const },
            { id: 'INV-2', amount_cents: 20000, status: 'pending' as const },
        ];

        const result = presenter.make(invoices).build();
        const dataBlock = result.content[0]!.text;
        const parsed = JSON.parse(dataBlock) as Invoice[];

        // Should NOT truncate
        expect(parsed).toHaveLength(2);

        // Should NOT have a truncation block
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('Truncated'))).toBe(false);
    });

    it('should not affect single items', () => {
        const presenter = createPresenter('InvoiceSingle')
            .schema(invoiceSchema)
            .agentLimit(1, (omitted) =>
                ui.summary(`⚠️ ${omitted} hidden.`),
            );

        const result = presenter.make({ id: 'INV-1', amount_cents: 100, status: 'paid' }).build();
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('hidden'))).toBe(false);
    });
});

// =====================================================================
// Feature 3: Agentic Affordances (suggestActions)
// =====================================================================

describe('Agentic Affordances (suggestActions)', () => {
    it('should suggest actions for pending invoices', () => {
        const presenter = createPresenter('InvoiceAffordance')
            .schema(invoiceSchema)
            .suggestActions((invoice: Invoice) => {
                if (invoice.status === 'pending') {
                    return [
                        { tool: 'billing.pay', reason: 'Offer immediate payment' },
                        { tool: 'billing.send_reminder', reason: 'Send reminder email' },
                    ];
                }
                return [];
            });

        const result = presenter.make({
            id: 'INV-1', amount_cents: 45000, status: 'pending',
        }).build();

        const hintBlock = result.content.find(c => c.text.includes('action_suggestions'))?.text ?? '';
        expect(hintBlock).toContain('billing.pay');
        expect(hintBlock).toContain('Offer immediate payment');
        expect(hintBlock).toContain('billing.send_reminder');
    });

    it('should NOT suggest actions for paid invoices', () => {
        const presenter = createPresenter('InvoicePaid')
            .schema(invoiceSchema)
            .suggestActions((invoice: Invoice) => {
                if (invoice.status === 'pending') {
                    return [{ tool: 'billing.pay', reason: 'Pay now' }];
                }
                return [];
            });

        const result = presenter.make({
            id: 'INV-1', amount_cents: 45000, status: 'paid',
        }).build();

        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('action_suggestions'))).toBe(false);
    });

    it('should pass context to suggestActions callback', () => {
        const presenter = createPresenter('InvoiceCtx')
            .schema(invoiceSchema)
            .suggestActions((invoice: Invoice, ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                if (invoice.status === 'pending' && c?.user?.role === 'admin') {
                    return [{ tool: 'billing.force_pay', reason: 'Admin force payment' }];
                }
                return [];
            });

        // Admin → should suggest force_pay
        const adminResult = presenter.make(
            { id: 'INV-1', amount_cents: 100, status: 'pending' },
            adminCtx,
        ).build();
        expect(adminResult.content.some(c => c.text.includes('force_pay'))).toBe(true);
    });
});

// =====================================================================
// Feature 4: Presenter Composition (embed)
// =====================================================================

describe('Presenter Composition (embed)', () => {
    it('should merge child Presenter rules into parent response', () => {
        const ClientPresenter = createPresenter('Client')
            .schema(clientSchema)
            .systemRules(['Format company names in UPPERCASE.']);

        const InvoicePresenter = createPresenter('InvoiceEmbed')
            .systemRules(['CRITICAL: amounts in CENTS.'])
            .embed('client', ClientPresenter);

        const result = InvoicePresenter.make({
            id: 'INV-1',
            amount_cents: 45000,
            status: 'paid',
            client: { id: 'C1', company: 'Acme Corp' },
        }).build();

        const texts = result.content.map(c => c.text);
        // Parent rules
        expect(texts.some(t => t.includes('amounts in CENTS'))).toBe(true);
        // Child rules (merged)
        expect(texts.some(t => t.includes('UPPERCASE'))).toBe(true);
    });

    it('should merge child UI blocks into parent response', () => {
        const ClientPresenter = createPresenter('ClientUI')
            .schema(clientSchema)
            .uiBlocks((client) => [
                ui.markdown(`🏢 Client: **${(client as { company: string }).company}**`),
            ]);

        const InvoicePresenter = createPresenter('InvoiceEmbedUI')
            .uiBlocks(() => [ui.markdown('📄 Invoice details')])
            .embed('client', ClientPresenter);

        const result = InvoicePresenter.make({
            id: 'INV-1',
            client: { id: 'C1', company: 'Acme Corp' },
        }).build();

        const texts = result.content.map(c => c.text);
        // Parent UI
        expect(texts.some(t => t.includes('Invoice details'))).toBe(true);
        // Child UI (merged)
        expect(texts.some(t => t.includes('Acme Corp'))).toBe(true);
    });

    it('should skip embed if nested key is missing', () => {
        const ClientPresenter = createPresenter('ClientSkip')
            .schema(clientSchema)
            .systemRules(['Client rule']);

        const InvoicePresenter = createPresenter('InvoiceNoClient')
            .systemRules(['Invoice rule'])
            .embed('client', ClientPresenter);

        const result = InvoicePresenter.make({
            id: 'INV-1',
            amount_cents: 100,
        }).build();

        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('Invoice rule'))).toBe(true);
        expect(texts.some(t => t.includes('Client rule'))).toBe(false);
    });

    it('should pass context through to embedded Presenters', () => {
        const ClientPresenter = createPresenter('ClientCtx')
            .schema(clientSchema)
            .systemRules((_client: unknown, ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                return [`Client locale: ${c?.tenant?.locale ?? 'unknown'}`];
            });

        const InvoicePresenter = createPresenter('InvoiceEmbedCtx')
            .embed('client', ClientPresenter);

        const result = InvoicePresenter.make(
            { id: 'INV-1', client: { id: 'C1', company: 'Acme' } },
            viewerCtx,
        ).build();

        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('locale: pt-BR'))).toBe(true);
    });
});

// =====================================================================
// Integration: All Features Combined
// =====================================================================

describe('All Features Combined', () => {
    it('should apply context, guardrails, affordances, and embeds together', () => {
        const ClientPresenter = createPresenter('ClientFull')
            .schema(clientSchema)
            .systemRules(['Display company info prominently.']);

        const presenter = createPresenter('InvoiceFull')
            .schema(invoiceSchema)
            .agentLimit(2, (omitted) =>
                ui.summary(`⚠️ ${omitted} invoices hidden. Use filters.`),
            )
            .systemRules((invoice: Invoice, ctx?: unknown) => {
                const c = ctx as TestContext | undefined;
                return [
                    'CRITICAL: amounts in CENTS.',
                    c?.user?.role !== 'admin' ? 'Do NOT show raw cent values.' : null,
                ];
            })
            .uiBlocks((invoice: Invoice) => [
                ui.markdown(`Invoice **${invoice.id}**: $${invoice.amount_cents / 100}`),
            ])
            .suggestActions((invoice: Invoice) => {
                if (invoice.status === 'pending') {
                    return [{ tool: 'billing.pay', reason: 'Match pending state' }];
                }
                return [];
            })
            .embed('client', ClientPresenter);

        // Array of 4 with limit 2, pending status, viewer role, with client
        const data = [
            { id: 'INV-1', amount_cents: 10000, status: 'pending' as const, client: { id: 'C1', company: 'Acme' } },
            { id: 'INV-2', amount_cents: 20000, status: 'paid' as const, client: { id: 'C2', company: 'Globex' } },
            { id: 'INV-3', amount_cents: 30000, status: 'pending' as const },
            { id: 'INV-4', amount_cents: 40000, status: 'paid' as const },
        ];

        const result = presenter.make(data, viewerCtx).build();
        const texts = result.content.map(c => c.text);

        // 1. Guardrails: data truncated to 2
        const parsed = JSON.parse(texts[0]!) as Invoice[];
        expect(parsed).toHaveLength(2);

        // 2. Guardrails: truncation warning present
        expect(texts.some(t => t.includes('2 invoices hidden'))).toBe(true);

        // 3. Context-Aware: RBAC rule for non-admin
        expect(texts.some(t => t.includes('Do NOT show raw cent values'))).toBe(true);

        // 4. Embeds: client rules merged
        expect(texts.some(t => t.includes('company info prominently'))).toBe(true);

        // 5. Affordances: pending → suggestions
        expect(texts.some(t => t.includes('billing.pay'))).toBe(true);
    });
});
