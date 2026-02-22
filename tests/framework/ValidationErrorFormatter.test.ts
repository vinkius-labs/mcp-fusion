import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder, success } from '../../src/framework/index.js';
import type { ToolResponse } from '../../src/framework/index.js';
import { formatValidationError } from '../../src/framework/execution/ValidationErrorFormatter.js';

// ============================================================================
// Helpers
// ============================================================================
const dummyHandler = async (_ctx: unknown, _args: Record<string, unknown>): Promise<ToolResponse> =>
    success('ok');

// ============================================================================
// Unit Tests: formatValidationError (direct)
// ============================================================================

describe('ValidationErrorFormatter — Unit Tests', () => {
    it('should format invalid_type errors with sent value and expected type', () => {
        const schema = z.object({ age: z.number() });
        const result = schema.safeParse({ age: 'twenty' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            { age: 'twenty' },
        );

        expect(msg).toContain('⚠️ VALIDATION FAILED');
        expect(msg).toContain('USERS/CREATE');
        expect(msg).toContain('age');
        expect(msg).toContain("You sent: 'twenty'");
        expect(msg).toContain('Expected type: number');
        expect(msg).toContain('💡 Fix the fields above');
    });

    it('should format email validation errors with guidance', () => {
        const schema = z.object({ email: z.string().email() });
        const result = schema.safeParse({ email: 'not-an-email' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            { email: 'not-an-email' },
        );

        expect(msg).toContain('email');
        expect(msg).toContain("You sent: 'not-an-email'");
        expect(msg).toContain('valid email address');
    });

    it('should format URL validation errors', () => {
        const schema = z.object({ website: z.string().url() });
        const result = schema.safeParse({ website: 'not-a-url' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'profile/update',
            { website: 'not-a-url' },
        );

        expect(msg).toContain('website');
        expect(msg).toContain('valid URL');
    });

    it('should format UUID validation errors', () => {
        const schema = z.object({ id: z.string().uuid() });
        const result = schema.safeParse({ id: 'abc' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'items/get',
            { id: 'abc' },
        );

        expect(msg).toContain('id');
        expect(msg).toContain('UUID');
    });

    it('should format datetime validation errors', () => {
        const schema = z.object({ created: z.string().datetime() });
        const result = schema.safeParse({ created: 'not-a-date' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'events/create',
            { created: 'not-a-date' },
        );

        expect(msg).toContain('created');
        expect(msg).toContain('ISO 8601');
    });

    it('should format too_small (number minimum) with bound hint', () => {
        const schema = z.object({ age: z.number().min(18) });
        const result = schema.safeParse({ age: 10 });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            { age: 10 },
        );

        expect(msg).toContain('age');
        expect(msg).toContain('You sent: 10');
        expect(msg).toContain('>= 18');
    });

    it('should format too_big (number maximum) with bound hint', () => {
        const schema = z.object({ count: z.number().max(100) });
        const result = schema.safeParse({ count: 200 });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'batch/process',
            { count: 200 },
        );

        expect(msg).toContain('count');
        expect(msg).toContain('You sent: 200');
        expect(msg).toContain('<= 100');
    });

    it('should format too_small (string minLength)', () => {
        const schema = z.object({ name: z.string().min(3) });
        const result = schema.safeParse({ name: 'ab' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            { name: 'ab' },
        );

        expect(msg).toContain('name');
        expect(msg).toContain("You sent: 'ab'");
        expect(msg).toContain('3 characters');
    });

    it('should format too_big (string maxLength)', () => {
        const schema = z.object({ code: z.string().max(10) });
        const result = schema.safeParse({ code: 'very-long-code-value' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'coupons/create',
            { code: 'very-long-code-value' },
        );

        expect(msg).toContain('code');
        expect(msg).toContain('10 characters');
    });

    it('should format invalid_enum_value with valid options', () => {
        const schema = z.object({ role: z.enum(['admin', 'user', 'guest']) });
        const result = schema.safeParse({ role: 'superadmin' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            { role: 'superadmin' },
        );

        expect(msg).toContain('role');
        expect(msg).toContain("You sent: 'superadmin'");
        expect(msg).toContain("'admin'");
        expect(msg).toContain("'user'");
        expect(msg).toContain("'guest'");
    });

    it('should format missing required fields with "(missing)"', () => {
        const schema = z.object({
            name: z.string(),
            email: z.string().email(),
        });
        const result = schema.safeParse({});
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            {},
        );

        expect(msg).toContain('name');
        expect(msg).toContain('(missing)');
        expect(msg).toContain('email');
    });

    it('should format multiple errors in a single response', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number().min(18),
            role: z.enum(['admin', 'user']),
        });
        const result = schema.safeParse({ name: 42, age: 5, role: 'boss' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            { name: 42, age: 5, role: 'boss' },
        );

        // All three errors should be present
        expect(msg).toContain('name');
        expect(msg).toContain('age');
        expect(msg).toContain('role');
        expect(msg).toContain('You sent: 42');
        expect(msg).toContain('You sent: 5');
        expect(msg).toContain("You sent: 'boss'");
    });

    it('should truncate very long sent values', () => {
        const schema = z.object({ bio: z.string().max(10) });
        const longValue = 'a'.repeat(100);
        const result = schema.safeParse({ bio: longValue });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'profile/update',
            { bio: longValue },
        );

        // Should contain truncated value with "..."
        expect(msg).toContain('...');
        // Should NOT contain the full 100-char string
        expect(msg).not.toContain(longValue);
    });

    it('should handle null values gracefully', () => {
        const schema = z.object({ name: z.string() });
        const result = schema.safeParse({ name: null });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'users/create',
            { name: null },
        );

        expect(msg).toContain('name');
        expect(msg).toContain('null');
    });

    it('should handle array values in sent display', () => {
        const schema = z.object({ tags: z.string() });
        const result = schema.safeParse({ tags: [1, 2, 3] });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'items/create',
            { tags: [1, 2, 3] },
        );

        expect(msg).toContain('tags');
        expect(msg).toContain('array(3)');
    });

    it('should handle regex validation errors', () => {
        const schema = z.object({ code: z.string().regex(/^[A-Z]{3}-\d{4}$/) });
        const result = schema.safeParse({ code: 'abc-1234' });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'coupons/validate',
            { code: 'abc-1234' },
        );

        expect(msg).toContain('code');
        expect(msg).toContain("You sent: 'abc-1234'");
        expect(msg).toContain('pattern');
    });

    it('should format too_small (array minLength)', () => {
        const schema = z.object({ items: z.array(z.string()).min(2) });
        const result = schema.safeParse({ items: ['one'] });
        if (result.success) throw new Error('Expected failure');

        const msg = formatValidationError(
            result.error.issues,
            'orders/create',
            { items: ['one'] },
        );

        expect(msg).toContain('items');
        expect(msg).toContain('2 items');
    });
});

// ============================================================================
// Integration Tests: Through the Builder Pipeline
// ============================================================================

describe('ValidationErrorFormatter — Integration via GroupedToolBuilder', () => {
    it('should produce LLM-friendly errors for wrong types', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'create',
                schema: z.object({ title: z.string(), count: z.number() }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'create',
            title: 123,
            count: 'five',
        });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;

        // New format: actionable, not raw
        expect(errorText).toContain('⚠️ VALIDATION FAILED');
        expect(errorText).toContain('TEST/CREATE');
        expect(errorText).toContain('title');
        expect(errorText).toContain('count');
        expect(errorText).toContain('💡 Fix the fields above');
    });

    it('should show sent values for enum violations via pipeline', async () => {
        const builder = new GroupedToolBuilder('config')
            .action({
                name: 'set',
                schema: z.object({
                    level: z.enum(['debug', 'info', 'warn', 'error']),
                }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'set',
            level: 'verbose',
        });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;
        expect(errorText).toContain("You sent: 'verbose'");
        expect(errorText).toContain("'debug'");
        expect(errorText).toContain("'info'");
        expect(errorText).toContain("'warn'");
        expect(errorText).toContain("'error'");
    });

    it('should show (missing) for required fields not provided', async () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .action({
                name: 'create',
                schema: z.object({
                    name: z.string(),
                    email: z.string().email(),
                }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'create',
            // Everything missing
        });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;
        expect(errorText).toContain('workspace_id');
        expect(errorText).toContain('(missing)');
        expect(errorText).toContain('name');
        expect(errorText).toContain('email');
    });

    it('should produce correct errors for grouped actions', async () => {
        const builder = new GroupedToolBuilder('platform')
            .group('users', 'Users', g => {
                g.action({
                    name: 'create',
                    schema: z.object({
                        email: z.string().email(),
                        role: z.enum(['admin', 'user']),
                    }),
                    handler: dummyHandler,
                });
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined as any, {
            action: 'users.create',
            email: 'bad-email',
            role: 'superadmin',
        });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;
        expect(errorText).toContain('PLATFORM/USERS.CREATE');
        expect(errorText).toContain('email');
        expect(errorText).toContain("You sent: 'bad-email'");
        expect(errorText).toContain('role');
        expect(errorText).toContain("You sent: 'superadmin'");
        expect(errorText).toContain("'admin'");
        expect(errorText).toContain("'user'");
    });

    it('should show number bounds for min/max violations via pipeline', async () => {
        const builder = new GroupedToolBuilder('config')
            .action({
                name: 'set',
                schema: z.object({
                    retries: z.number().min(1).max(10),
                }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();

        // Too low
        const r1 = await builder.execute(undefined as any, {
            action: 'set',
            retries: 0,
        });
        expect(r1.isError).toBe(true);
        expect(r1.content[0].text).toContain('You sent: 0');
        expect(r1.content[0].text).toContain('>= 1');

        // Too high
        const r2 = await builder.execute(undefined as any, {
            action: 'set',
            retries: 99,
        });
        expect(r2.isError).toBe(true);
        expect(r2.content[0].text).toContain('You sent: 99');
        expect(r2.content[0].text).toContain('<= 10');
    });
});
