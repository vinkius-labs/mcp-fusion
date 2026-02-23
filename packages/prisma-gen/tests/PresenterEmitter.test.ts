import { describe, it, expect } from 'vitest';
import { parseAnnotations, type DMMFModel, type DMMFField } from '../src/parser/AnnotationParser.js';
import { emitPresenter } from '../src/emitter/PresenterEmitter.js';

// ── Mock Helpers ─────────────────────────────────────────

function field(overrides: Partial<DMMFField> & { name: string }): DMMFField {
    return {
        kind: 'scalar',
        type: 'String',
        isList: false,
        isRequired: true,
        isId: false,
        hasDefaultValue: false,
        isUnique: false,
        ...overrides,
    };
}

function model(name: string, fields: DMMFField[]): DMMFModel {
    return { name, fields };
}

// ── Production-realistic model ───────────────────────────

function makeUserModel(): DMMFModel {
    return model('User', [
        field({ name: 'id', isId: true, hasDefaultValue: true }),
        field({ name: 'email', isUnique: true }),
        field({ name: 'passwordHash', documentation: '@fusion.hide' }),
        field({ name: 'stripeToken', documentation: 'Payment token.\n@fusion.hide' }),
        field({ name: 'creditScore', type: 'Int', documentation: '@fusion.describe("Financial score from 0 to 1000. Above 700 is PREMIUM.")' }),
        field({ name: 'role', hasDefaultValue: true }),
        field({ name: 'isActive', type: 'Boolean', isRequired: false }),
        field({ name: 'balance', type: 'Float' }),
        field({ name: 'tenantId', documentation: '@fusion.tenantKey' }),
        field({ name: 'createdAt', type: 'DateTime', hasDefaultValue: true }),
        // Relation fields — must NOT appear in output
        field({ name: 'posts', kind: 'object', type: 'Post', isList: true, isRequired: false }),
        field({ name: 'profile', kind: 'object', type: 'Profile', isRequired: false }),
    ]);
}

// ============================================================================
// PresenterEmitter Tests — Production Edge Cases
// ============================================================================

describe('PresenterEmitter', () => {

    // ── Egress Firewall (@fusion.hide) ───────────────────

    describe('Egress Firewall (@fusion.hide)', () => {
        it('should physically exclude @fusion.hide fields from ResponseSchema', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).not.toContain('passwordHash');
            expect(file.content).not.toContain('stripeToken');
        });

        it('should exclude @fusion.hide even when doc is multi-line', () => {
            const m = model('Secret', [
                field({ name: 'apiKey', documentation: 'Internal API key.\n@fusion.hide\nNever expose.' }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).not.toContain('apiKey');
        });

        it('should handle model where ALL fields are hidden', () => {
            const m = model('Secrets', [
                field({ name: 'key1', documentation: '@fusion.hide' }),
                field({ name: 'key2', documentation: '@fusion.hide' }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            // Schema should still be valid — empty .strict() object
            expect(file.content).toContain('z.object({');
            expect(file.content).toContain('}).strict()');
            expect(file.content).not.toContain('key1');
            expect(file.content).not.toContain('key2');
        });
    });

    // ── Flat-Only MVA (Relation Filtering) ───────────────

    describe('Flat-Only MVA (Relation Filtering)', () => {
        it('should filter out object relations', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).not.toContain('posts');
            expect(file.content).not.toContain('profile');
            expect(file.content).not.toContain('Post');
            expect(file.content).not.toContain('Profile');
        });

        it('should keep scalar and enum fields only', () => {
            const m = model('Product', [
                field({ name: 'id', isId: true }),
                field({ name: 'name' }),
                field({ name: 'status', kind: 'enum', type: 'ProductStatus' }),
                field({ name: 'category', kind: 'object', type: 'Category' }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain('id: z.string()');
            expect(file.content).toContain('name: z.string()');
            expect(file.content).toContain('status: z.string()'); // Enum → z.string()
            expect(file.content).not.toContain('category');
        });
    });

    // ── Prisma Scalar Type Mapping ───────────────────────

    describe('Prisma Scalar Type Mapping', () => {
        it.each([
            ['String', 'z.string()'],
            ['Int', 'z.number().int()'],
            ['Float', 'z.number()'],
            ['Decimal', 'z.number()'],
            ['Boolean', 'z.boolean()'],
            ['DateTime', 'z.coerce.date()'],
            ['BigInt', 'z.bigint()'],
            ['Json', 'z.unknown()'],
        ] as const)('should map Prisma %s → %s', (prismaType, expectedZod) => {
            const m = model('Test', [
                field({ name: 'value', type: prismaType }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain(`value: ${expectedZod}`);
        });

        it('should map optional fields with .optional()', () => {
            const m = model('Test', [
                field({ name: 'nickname', isRequired: false }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain('nickname: z.string().optional()');
        });

        it('should map optional fields with .describe() before .optional()', () => {
            const m = model('Test', [
                field({ name: 'bio', isRequired: false, documentation: '@fusion.describe("User bio")' }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain("bio: z.string().describe('User bio').optional()");
        });
    });

    // ── @fusion.describe → .describe() ───────────────────

    describe('@fusion.describe injection', () => {
        it('should inject .describe() on required field', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain(".describe('Financial score from 0 to 1000. Above 700 is PREMIUM.')");
        });

        it('should correctly order .describe() on Int type', () => {
            const m = model('Test', [
                field({ name: 'score', type: 'Int', documentation: '@fusion.describe("0 to 100")' }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain("score: z.number().int().describe('0 to 100')");
        });

        it('should escape single quotes in description', () => {
            const m = model('Test', [
                field({ name: 'note', documentation: "@fusion.describe(\"Don't use special chars\")" }),
            ]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain("Don\\'t use special chars");
        });
    });

    // ── Schema Structure ─────────────────────────────────

    describe('Schema Structure', () => {
        it('should apply .strict() to ResponseSchema', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain('.strict()');
        });

        it('should export ResponseSchema', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain('export const UserResponseSchema');
        });

        it('should import zod', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain("import { z } from 'zod'");
        });

        it('should import createPresenter', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain("import { createPresenter } from '@vinkius-core/mcp-fusion'");
        });
    });

    // ── Presenter Binding ────────────────────────────────

    describe('Presenter Binding', () => {
        it('should export Presenter with schema binding', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain('export const UserPresenter');
            expect(file.content).toContain(".schema(UserResponseSchema)");
        });

        it('should include createPresenter call with model name', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain("createPresenter('User')");
        });

        it('should include systemRules', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain('.systemRules(');
        });
    });

    // ── File Metadata ────────────────────────────────────

    describe('File Metadata', () => {
        it('should generate correct file path (camelCase model name)', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.path).toBe('userPresenter.ts');
        });

        it('should handle PascalCase model names correctly', () => {
            const m = model('UserProfile', [field({ name: 'id' })]);
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.path).toBe('userProfilePresenter.ts');
            expect(file.content).toContain('UserProfileResponseSchema');
            expect(file.content).toContain('UserProfilePresenter');
        });

        it('should include @generated tag', () => {
            const m = makeUserModel();
            const file = emitPresenter(m, parseAnnotations(m));
            expect(file.content).toContain('@generated');
        });
    });

    // ── Field Count Verification ─────────────────────────

    describe('Field Count (Integration)', () => {
        it('should emit exactly the visible scalar fields', () => {
            const m = makeUserModel();
            // Total: 12 fields
            // Relations: posts, profile (2) → filtered
            // Hidden: passwordHash, stripeToken (2) → excluded
            // Remaining visible scalars: id, email, creditScore, role, isActive, balance, tenantId, createdAt = 8
            const file = emitPresenter(m, parseAnnotations(m));

            const fieldLines = file.content
                .split('\n')
                .filter(line => line.match(/^\s{4}\w+: z\./));
            expect(fieldLines).toHaveLength(8);
        });
    });
});
