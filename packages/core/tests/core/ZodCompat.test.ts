/**
 * ZodCompat — Zod 3/4 JSON Schema Compatibility Tests
 *
 * Validates that `zodToJson()` produces correct JSON Schema output
 * regardless of the installed Zod version (3 or 4).
 *
 * These tests run against whichever Zod version is installed in the
 * workspace. The ZodCompat module auto-detects and routes accordingly.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJson, zodToJsonWithOptions } from '../../src/core/schema/ZodCompat.js';

// Detect which Zod version we're testing against
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zodVersion = (z as any).version ?? 'unknown';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isZod4 = typeof (z as any)['toJSONSchema'] === 'function';

describe(`ZodCompat (Zod ${isZod4 ? '4' : '3'}, v${zodVersion})`, () => {

    // ── zodToJson ────────────────────────────────────────────

    describe('zodToJson', () => {
        it('converts a simple z.object to JSON Schema with properties', () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            });
            const result = zodToJson(schema);

            expect(result.type).toBe('object');
            expect(result.properties).toBeDefined();
            expect(result.properties!['name']).toBeDefined();
            expect(result.properties!['age']).toBeDefined();
        });

        it('preserves field descriptions', () => {
            const schema = z.object({
                app_name: z.string().describe('Application name'),
            });
            const result = zodToJson(schema);

            expect(result.properties).toBeDefined();
            const appName = result.properties!['app_name'] as { description?: string };
            expect(appName).toBeDefined();
            expect(appName.description).toBe('Application name');
        });

        it('includes required fields', () => {
            const schema = z.object({
                required_field: z.string(),
                optional_field: z.string().optional(),
            });
            const result = zodToJson(schema);

            expect(result.required).toBeDefined();
            expect(result.required).toContain('required_field');
            expect(result.required).not.toContain('optional_field');
        });

        it('strips $schema metadata in Zod 4 (Zod 3 preserves it)', () => {
            const schema = z.object({ id: z.string() });
            const result = zodToJson(schema);

            if (isZod4) {
                // Zod 4 path strips $schema
                expect(result.$schema).toBeUndefined();
            } else {
                // Zod 3 path preserves $schema from zod-to-json-schema
                expect(result.$schema).toBeDefined();
            }
        });

        it('handles z.enum correctly', () => {
            const schema = z.object({
                status: z.enum(['active', 'inactive']),
            });
            const result = zodToJson(schema);

            expect(result.properties).toBeDefined();
            const status = result.properties!['status'] as { enum?: string[] };
            expect(status).toBeDefined();
            expect(status.enum).toEqual(['active', 'inactive']);
        });

        it('handles z.number with constraints', () => {
            const schema = z.object({
                page: z.number().int().min(1).describe('Page number'),
            });
            const result = zodToJson(schema);

            expect(result.properties).toBeDefined();
            const page = result.properties!['page'] as { type?: string; description?: string };
            expect(page).toBeDefined();
            expect(page.description).toBe('Page number');
        });

        it('handles z.boolean', () => {
            const schema = z.object({
                active: z.boolean(),
            });
            const result = zodToJson(schema);

            expect(result.properties).toBeDefined();
            const active = result.properties!['active'] as { type?: string };
            expect(active).toBeDefined();
        });

        it('handles z.array', () => {
            const schema = z.object({
                tags: z.array(z.string()),
            });
            const result = zodToJson(schema);

            expect(result.properties).toBeDefined();
            const tags = result.properties!['tags'] as { type?: string; items?: { type?: string } };
            expect(tags).toBeDefined();
            expect(tags.type).toBe('array');
        });

        it('handles empty z.object', () => {
            const schema = z.object({});
            const result = zodToJson(schema);

            expect(result.type).toBe('object');
            expect(result.properties).toBeDefined();
            expect(Object.keys(result.properties!)).toHaveLength(0);
        });

        it('handles complex nested objects', () => {
            const schema = z.object({
                user: z.object({
                    name: z.string(),
                    email: z.string(),
                }),
            });
            const result = zodToJson(schema);

            expect(result.properties).toBeDefined();
            const user = result.properties!['user'] as { type?: string; properties?: Record<string, object> };
            expect(user).toBeDefined();
            expect(user.type).toBe('object');
            expect(user.properties?.['name']).toBeDefined();
        });
    });

    // ── zodToJsonWithOptions ─────────────────────────────────

    describe('zodToJsonWithOptions', () => {
        it('produces the same output as zodToJson for basic schemas', () => {
            const schema = z.object({
                name: z.string().describe('Name'),
            });

            const basic = zodToJson(schema);
            const withOpts = zodToJsonWithOptions(schema);

            expect(withOpts.properties).toEqual(basic.properties);
        });

        it('passes through options for Zod 3 (no-op for Zod 4)', () => {
            const schema = z.object({
                id: z.string(),
            });
            // This should NOT throw regardless of Zod version
            const result = zodToJsonWithOptions(schema, { $refStrategy: 'none' });

            expect(result.type).toBe('object');
            expect(result.properties).toBeDefined();
            expect(result.properties!['id']).toBeDefined();
        });
    });

    // ── Regression: Applitools MCP pattern ────────────────────

    describe('Regression: Applitools MCP pattern', () => {
        it('converts a single-field action schema (app_name)', () => {
            // This is exactly the pattern that was failing with Zod 4
            const actionSchema = z.object({
                app_name: z.string().describe('Application name'),
            });

            const result = zodToJson(actionSchema);

            expect(result.type).toBe('object');
            expect(result.properties).toBeDefined();
            expect(Object.keys(result.properties!).length).toBeGreaterThan(0);

            const appName = result.properties!['app_name'] as { type?: string; description?: string };
            expect(appName).toBeDefined();
            expect(appName.type).toBe('string');
            expect(appName.description).toBe('Application name');
        });
    });
});
