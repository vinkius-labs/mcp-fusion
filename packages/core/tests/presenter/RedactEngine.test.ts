/**
 * RedactEngine + Presenter PII Redaction Tests — Comprehensive
 *
 * Tests for the DLP compliance engine:
 * - RedactEngine unit tests (compilation, fallback, censor)
 * - Presenter `.redactPII()` integration (paths, wildcards, arrays)
 * - Late Guillotine integrity (UI blocks see full data, wire is masked)
 * - `definePresenter()` declarative config support
 * - Edge cases (empty paths, missing fields, primitives, sealed state)
 */
import { describe, it, expect, vi } from 'vitest';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { definePresenter } from '../../src/presenter/definePresenter.js';
import { compileRedactor, initRedactEngine } from '../../src/presenter/RedactEngine.js';
import { t } from '../../src/presenter/typeHelpers.js';
import { ui } from '../../src/presenter/ui.js';

// ── RedactEngine Unit Tests ──────────────────────────────

describe('RedactEngine', () => {
    it('compileRedactor should return a function when fast-redact is available', async () => {
        // Ensure module is loaded
        await initRedactEngine();

        const redact = compileRedactor({
            paths: ['password'],
        });
        expect(redact).toBeDefined();
        expect(typeof redact).toBe('function');
    });

    it('compileRedactor should redact a flat field', async () => {
        await initRedactEngine();

        const redact = compileRedactor({ paths: ['password'] })!;
        expect(redact).toBeDefined();

        const result = redact({ name: 'Alice', password: 's3cret' }) as Record<string, unknown>;
        expect(result.name).toBe('Alice');
        expect(result.password).toBe('[REDACTED]');
    });

    it('compileRedactor should support custom string censor', async () => {
        await initRedactEngine();

        const redact = compileRedactor({
            paths: ['ssn'],
            censor: '***-**-****',
        })!;

        const result = redact({ name: 'Bob', ssn: '123-45-6789' }) as Record<string, unknown>;
        expect(result.ssn).toBe('***-**-****');
    });

    it('compileRedactor should support censor function', async () => {
        await initRedactEngine();

        const redact = compileRedactor({
            paths: ['credit_card'],
            censor: (v) => '****-' + String(v).slice(-4),
        })!;

        const result = redact({
            name: 'Carol',
            credit_card: '4111-1111-1111-1234',
        }) as Record<string, unknown>;
        expect(result.credit_card).toBe('****-1234');
    });

    it('compileRedactor should handle wildcard paths', async () => {
        await initRedactEngine();

        const redact = compileRedactor({ paths: ['*.ssn'] })!;

        const result = redact({
            user: { name: 'Dave', ssn: '111-22-3333' },
            admin: { name: 'Eve', ssn: '444-55-6666' },
        }) as Record<string, Record<string, unknown>>;

        expect(result.user.ssn).toBe('[REDACTED]');
        expect(result.admin.ssn).toBe('[REDACTED]');
        expect(result.user.name).toBe('Dave');
        expect(result.admin.name).toBe('Eve');
    });

    it('compileRedactor should handle array wildcard paths', async () => {
        await initRedactEngine();

        const redact = compileRedactor({ paths: ['patients[*].diagnosis'] })!;

        const result = redact({
            patients: [
                { name: 'Frank', diagnosis: 'Flu' },
                { name: 'Grace', diagnosis: 'Cold' },
            ],
        }) as { patients: Array<Record<string, unknown>> };

        expect(result.patients[0].diagnosis).toBe('[REDACTED]');
        expect(result.patients[1].diagnosis).toBe('[REDACTED]');
        expect(result.patients[0].name).toBe('Frank');
        expect(result.patients[1].name).toBe('Grace');
    });

    it('compileRedactor should return undefined for empty paths', async () => {
        await initRedactEngine();
        const redact = compileRedactor({ paths: [] });
        expect(redact).toBeUndefined();
    });

    it('compileRedactor should not crash on missing target field', async () => {
        await initRedactEngine();
        const redact = compileRedactor({ paths: ['nonexistent'] })!;

        // Should not throw, field is simply not there
        const result = redact({ name: 'Hank' }) as Record<string, unknown>;
        expect(result.name).toBe('Hank');
    });

    it('compileRedactor should pass primitives through unchanged', async () => {
        await initRedactEngine();
        const redact = compileRedactor({ paths: ['password'] })!;

        expect(redact('hello')).toBe('hello');
        expect(redact(42)).toBe(42);
        expect(redact(null)).toBeNull();
        expect(redact(undefined)).toBeUndefined();
    });

    it('compileRedactor should not mutate the original object', async () => {
        await initRedactEngine();
        const redact = compileRedactor({ paths: ['secret'] })!;

        const original = { name: 'Ivy', secret: 'top-secret' };
        const result = redact(original) as Record<string, unknown>;

        // Clone was redacted, original preserved
        expect(result.secret).toBe('[REDACTED]');
        expect(original.secret).toBe('top-secret');
    });

    it('initRedactEngine should return true when fast-redact is available', async () => {
        const available = await initRedactEngine();
        expect(available).toBe(true);
    });
});

// ── Presenter .redactPII() Integration ───────────────────

describe('Presenter .redactPII()', () => {
    it('should redact a flat field on the wire data', async () => {
        await initRedactEngine();

        const presenter = createPresenter('User')
            .schema({ name: t.string, password: t.string })
            .redactPII(['password']);

        const result = presenter.make({ name: 'Alice', password: 's3cret' }).build();
        const data = JSON.parse(result.content[0].text);

        expect(data.name).toBe('Alice');
        expect(data.password).toBe('[REDACTED]');
    });

    it('should redact nested paths', async () => {
        await initRedactEngine();

        const presenter = createPresenter('Account')
            .schema({
                id: t.string,
                billing: t.object({
                    card_number: t.string,
                    holder: t.string,
                }),
            })
            .redactPII(['billing.card_number']);

        const result = presenter.make({
            id: 'ACC-1',
            billing: { card_number: '4111-1111-1111-1234', holder: 'Alice' },
        }).build();

        const data = JSON.parse(result.content[0].text);
        expect(data.billing.card_number).toBe('[REDACTED]');
        expect(data.billing.holder).toBe('Alice');
        expect(data.id).toBe('ACC-1');
    });

    it('should redact with custom censor string', async () => {
        await initRedactEngine();

        const presenter = createPresenter('User')
            .schema({ name: t.string, ssn: t.string })
            .redactPII(['ssn'], '***-**-****');

        const result = presenter.make({ name: 'Bob', ssn: '123-45-6789' }).build();
        const data = JSON.parse(result.content[0].text);

        expect(data.ssn).toBe('***-**-****');
    });

    it('should redact with custom censor function', async () => {
        await initRedactEngine();

        const presenter = createPresenter('Payment')
            .schema({ holder: t.string, card_number: t.string })
            .redactPII(['card_number'], (v) => '****-' + String(v).slice(-4));

        const result = presenter.make({
            holder: 'Carol',
            card_number: '4111-1111-1111-1234',
        }).build();

        const data = JSON.parse(result.content[0].text);
        expect(data.card_number).toBe('****-1234');
        expect(data.holder).toBe('Carol');
    });

    it('should redact array items individually', async () => {
        await initRedactEngine();

        const presenter = createPresenter('Patient')
            .schema({ name: t.string, diagnosis: t.string })
            .redactPII(['diagnosis']);

        const result = presenter.make([
            { name: 'Dave', diagnosis: 'Flu' },
            { name: 'Eve', diagnosis: 'Cold' },
        ]).build();

        const data = JSON.parse(result.content[0].text);
        expect(data).toHaveLength(2);
        expect(data[0].diagnosis).toBe('[REDACTED]');
        expect(data[1].diagnosis).toBe('[REDACTED]');
        expect(data[0].name).toBe('Dave');
        expect(data[1].name).toBe('Eve');
    });

    it('should preserve full data for UI blocks (Late Guillotine)', async () => {
        await initRedactEngine();

        let uiReceivedValue: string | undefined;

        const presenter = createPresenter('Patient')
            .schema({ name: t.string, diagnosis: t.string })
            .redactPII(['diagnosis'])
            .ui((item: { name: string; diagnosis: string }) => {
                uiReceivedValue = item.diagnosis;
                return [ui.markdown(`Diagnosis: ${item.diagnosis}`)];
            });

        const result = presenter.make({ name: 'Frank', diagnosis: 'Flu' }).build();

        // Wire data should be redacted
        const wireData = JSON.parse(result.content[0].text);
        expect(wireData.diagnosis).toBe('[REDACTED]');

        // UI callback should have received the FULL unredacted data
        expect(uiReceivedValue).toBe('Flu');

        // UI block in the response should contain full data
        const uiBlock = result.content.find(b => b.text.includes('Diagnosis'));
        expect(uiBlock).toBeDefined();
        expect(uiBlock!.text).toContain('Flu');
    });

    it('should preserve full data for system rules (Late Guillotine)', async () => {
        await initRedactEngine();

        let rulesReceivedValue: string | undefined;

        const presenter = createPresenter('Patient')
            .schema({ name: t.string, diagnosis: t.string })
            .redactPII(['diagnosis'])
            .rules((item: { diagnosis: string }) => {
                rulesReceivedValue = item.diagnosis;
                return [`Patient has diagnosis: ${item.diagnosis}`];
            });

        const result = presenter.make({ name: 'Grace', diagnosis: 'Cold' }).build();

        // Wire data should be redacted
        const wireData = JSON.parse(result.content[0].text);
        expect(wireData.diagnosis).toBe('[REDACTED]');

        // Rules callback should have received the FULL unredacted data
        expect(rulesReceivedValue).toBe('Cold');
    });

    it('.redact() alias should work identically', async () => {
        await initRedactEngine();

        const presenter = createPresenter('User')
            .schema({ name: t.string, password: t.string })
            .redact(['password']);

        const result = presenter.make({ name: 'Hank', password: 'p4ss' }).build();
        const data = JSON.parse(result.content[0].text);

        expect(data.password).toBe('[REDACTED]');
        expect(data.name).toBe('Hank');
    });

    it('should return `this` for chaining', () => {
        const presenter = createPresenter('Chain');
        const result = presenter.redactPII(['password']);
        expect(result).toBe(presenter);
    });

    it('should work without a schema (untyped passthrough)', async () => {
        await initRedactEngine();

        const presenter = createPresenter('Untyped')
            .redactPII(['secret']);

        const result = presenter.make({ visible: 'yes', secret: 'hidden' }).build();
        const data = JSON.parse(result.content[0].text);

        expect(data.visible).toBe('yes');
        expect(data.secret).toBe('[REDACTED]');
    });

    it('should throw if called after .make() (sealed)', async () => {
        await initRedactEngine();

        const presenter = createPresenter('Sealed')
            .schema({ name: t.string });

        presenter.make({ name: 'Ivy' });

        expect(() => presenter.redactPII(['name'])).toThrow(/sealed/);
    });

    it('should not crash when redacted field does not exist in data', async () => {
        await initRedactEngine();

        const presenter = createPresenter('NoField')
            .schema({ name: t.string, email: t.string })
            .redactPII(['nonexistent_field']);

        // Should not throw
        const result = presenter.make({ name: 'Jack', email: 'jack@test.com' }).build();
        const data = JSON.parse(result.content[0].text);
        expect(data.name).toBe('Jack');
        expect(data.email).toBe('jack@test.com');
    });
});

// ── definePresenter() with redactPII ─────────────────────

describe('definePresenter() with redactPII', () => {
    it('should apply PII redaction from declarative config', async () => {
        await initRedactEngine();

        const presenter = definePresenter({
            name: 'Employee',
            schema: t.object({ name: t.string, ssn: t.string }),
            redactPII: {
                paths: ['ssn'],
            },
        });

        const result = presenter.make({ name: 'Kate', ssn: '111-22-3333' }).build();
        const data = JSON.parse(result.content[0].text);

        expect(data.name).toBe('Kate');
        expect(data.ssn).toBe('[REDACTED]');
    });

    it('should support custom censor in declarative config', async () => {
        await initRedactEngine();

        const presenter = definePresenter({
            name: 'Card',
            schema: t.object({ holder: t.string, number: t.string }),
            redactPII: {
                paths: ['number'],
                censor: (v) => '****-' + String(v).slice(-4),
            },
        });

        const result = presenter.make({ holder: 'Leo', number: '4111-1234' }).build();
        const data = JSON.parse(result.content[0].text);

        expect(data.number).toBe('****-1234');
    });
});

// ── Full End-to-End Chain ────────────────────────────────

describe('Full fluent chain with redactPII — end-to-end', () => {
    it('should work with schema + rules + ui + redact + limit', async () => {
        await initRedactEngine();

        const presenter = createPresenter('MedicalRecord')
            .schema({
                patient_name: t.string,
                ssn: t.string,
                diagnosis: t.string,
                insurance_id: t.string,
            })
            .redactPII(['ssn', 'insurance_id'])
            .rules(['Format dates as ISO 8601'])
            .ui((record: { patient_name: string }) => [
                ui.markdown(`Patient: **${record.patient_name}**`),
            ])
            .limit(50);

        const result = presenter.make({
            patient_name: 'Martin',
            ssn: '123-45-6789',
            diagnosis: 'Healthy',
            insurance_id: 'INS-99887',
        }).build();

        const data = JSON.parse(result.content[0].text);

        // PII fields redacted
        expect(data.ssn).toBe('[REDACTED]');
        expect(data.insurance_id).toBe('[REDACTED]');

        // Non-PII preserved
        expect(data.patient_name).toBe('Martin');
        expect(data.diagnosis).toBe('Healthy');

        // UI block present
        const uiBlock = result.content.find(b => b.text.includes('Martin'));
        expect(uiBlock).toBeDefined();

        // Rules present
        const rulesBlock = result.content.find(b => b.text.includes('ISO 8601'));
        expect(rulesBlock).toBeDefined();
    });
});
