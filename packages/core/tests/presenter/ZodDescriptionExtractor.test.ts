/**
 * Tests for ZodDescriptionExtractor — Auto-extraction of .describe() from Zod schemas
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractZodDescriptions } from '../../src/presenter/ZodDescriptionExtractor.js';

describe('extractZodDescriptions', () => {
    it('should extract .describe() from simple fields', () => {
        const schema = z.object({
            amount_cents: z.number().describe('CRITICAL: in CENTS. Divide by 100.'),
            status: z.enum(['paid', 'pending']).describe('Always display with emoji'),
        });

        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toEqual([
            'amount_cents: CRITICAL: in CENTS. Divide by 100.',
            'status: Always display with emoji',
        ]);
    });

    it('should skip fields without .describe()', () => {
        const schema = z.object({
            id: z.string(),
            name: z.string().describe('Full name'),
            age: z.number(),
        });

        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toEqual(['name: Full name']);
    });

    it('should return empty array for non-object schemas', () => {
        const schema = z.string();
        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toEqual([]);
    });

    it('should return empty array when no fields have descriptions', () => {
        const schema = z.object({
            id: z.string(),
            count: z.number(),
        });

        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toEqual([]);
    });

    it('should unwrap optional fields and extract description', () => {
        const schema = z.object({
            email: z.string().email().optional().describe('User email in lowercase'),
        });

        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toEqual(['email: User email in lowercase']);
    });

    it('should unwrap nullable fields and extract description', () => {
        const schema = z.object({
            phone: z.string().nullable().describe('E.164 format'),
        });

        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toEqual(['phone: E.164 format']);
    });

    it('should unwrap default fields and extract description', () => {
        const schema = z.object({
            limit: z.number().default(50).describe('Max items per page'),
        });

        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toEqual(['limit: Max items per page']);
    });

    it('should extract description from multiple wrapped fields', () => {
        const schema = z.object({
            name: z.string().describe('Full name required'),
            age: z.number().optional().describe('Age in years'),
            email: z.string().email().nullable().optional().describe('Primary email'),
        });

        const descriptions = extractZodDescriptions(schema);
        expect(descriptions).toHaveLength(3);
        expect(descriptions).toContain('name: Full name required');
        expect(descriptions).toContain('age: Age in years');
        expect(descriptions).toContain('email: Primary email');
    });
});

describe('definePresenter + Zod-Driven Prompts Integration', () => {
    it('should auto-inject Zod descriptions as system rules', async () => {
        const { definePresenter } = await import('../../src/presenter/definePresenter.js');

        const presenter = definePresenter({
            name: 'Invoice',
            schema: z.object({
                amount_cents: z.number().describe('CRITICAL: value is in CENTS.'),
                currency: z.string(),
            }),
        });

        const result = presenter.make({ amount_cents: 5000, currency: 'USD' }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('amount_cents: CRITICAL: value is in CENTS.');
    });

    it('should merge Zod descriptions with explicit rules', async () => {
        const { definePresenter } = await import('../../src/presenter/definePresenter.js');

        const presenter = definePresenter({
            name: 'Order',
            schema: z.object({
                total: z.number().describe('Total in USD.'),
            }),
            rules: ['Always round to 2 decimal places.'],
        });

        const result = presenter.make({ total: 99.9 }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('total: Total in USD.');
        expect(text).toContain('Always round to 2 decimal places.');
    });

    it('should skip auto-extraction when autoRules is false', async () => {
        const { definePresenter } = await import('../../src/presenter/definePresenter.js');

        const presenter = definePresenter({
            name: 'Raw',
            schema: z.object({
                secret: z.string().describe('Should NOT appear'),
            }),
            autoRules: false,
        });

        const result = presenter.make({ secret: 'test' }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).not.toContain('Should NOT appear');
    });

    it('should merge Zod descriptions with dynamic rules function', async () => {
        const { definePresenter } = await import('../../src/presenter/definePresenter.js');

        const presenter = definePresenter({
            name: 'User',
            schema: z.object({
                email: z.string().describe('Always lowercase'),
            }),
            rules: () => ['Custom dynamic rule'],
        });

        const result = presenter.make({ email: 'test@test.com' }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('email: Always lowercase');
        expect(text).toContain('Custom dynamic rule');
    });
});
