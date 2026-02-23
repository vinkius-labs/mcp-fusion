import { describe, it, expect } from 'vitest';
import { parseAnnotations, type DMMFModel, type DMMFField } from '../src/parser/AnnotationParser.js';
import { emitTool } from '../src/emitter/ToolEmitter.js';

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
        field({ name: 'creditScore', type: 'Int', documentation: '@fusion.describe("Financial score 0-1000")' }),
        field({ name: 'role', hasDefaultValue: true }),
        field({ name: 'isActive', type: 'Boolean', isRequired: false }),
        field({ name: 'balance', type: 'Float' }),
        field({ name: 'tenantId', documentation: '@fusion.tenantKey' }),
        field({ name: 'createdAt', type: 'DateTime', hasDefaultValue: true }),
        // Relations — must be filtered
        field({ name: 'posts', kind: 'object', type: 'Post', isList: true, isRequired: false }),
        field({ name: 'profile', kind: 'object', type: 'Profile', isRequired: false }),
    ]);
}

// Helper to extract a specific CRUD section
function extractActionSection(content: string, action: string): string {
    const regex = new RegExp(`${action}:\\s*\\{`, 'g');
    const match = regex.exec(content);
    if (!match) return '';
    // Find balanced braces
    let depth = 0;
    let start = match.index;
    for (let i = start; i < content.length; i++) {
        if (content[i] === '{') depth++;
        if (content[i] === '}') {
            depth--;
            if (depth === 0) return content.slice(start, i + 1);
        }
    }
    return content.slice(start);
}

// ============================================================================
// ToolEmitter Tests — Production Edge Cases
// ============================================================================

describe('ToolEmitter', () => {

    // ── PrismaFusionContext (Shift-Left Security) ────────

    describe('PrismaFusionContext (Shift-Left TS Safety)', () => {
        it('should emit PrismaFusionContext interface', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('export interface PrismaFusionContext');
        });

        it('should include prisma property in context', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('readonly prisma:');
        });

        it('should include tenantId when @fusion.tenantKey exists', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('readonly tenantId: string');
        });

        it('should NOT include tenantId when no @fusion.tenantKey', () => {
            const m = model('Config', [
                field({ name: 'id', isId: true, hasDefaultValue: true }),
                field({ name: 'key' }),
                field({ name: 'value' }),
            ]);
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('export interface PrismaFusionContext');
            expect(file.content).not.toContain('readonly tenantId');
        });

        it('should use custom tenantKey field name in context', () => {
            const m = model('Invoice', [
                field({ name: 'id', isId: true, hasDefaultValue: true }),
                field({ name: 'amount', type: 'Float' }),
                field({ name: 'companyId', documentation: '@fusion.tenantKey' }),
            ]);
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('readonly companyId: string');
        });

        it('should use PrismaFusionContext as defineTool generic', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain("defineTool<PrismaFusionContext>('db_user'");
        });
    });

    // ── Tenant Isolation Injection ───────────────────────

    describe('Tenant Isolation Injection', () => {
        it('should inject tenant filter in find_many WHERE', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const findMany = extractActionSection(file.content, 'find_many');
            expect(findMany).toContain("where['tenantId'] = ctx.tenantId");
        });

        it('should inject tenant filter in find_unique WHERE', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const findUnique = extractActionSection(file.content, 'find_unique');
            expect(findUnique).toContain('tenantId: ctx.tenantId');
        });

        it('should inject tenant in create data', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const create = extractActionSection(file.content, 'create');
            expect(create).toContain('tenantId: ctx.tenantId');
        });

        it('should inject tenant in update WHERE', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const update = extractActionSection(file.content, 'update');
            expect(update).toContain('tenantId: ctx.tenantId');
        });

        it('should inject tenant in delete WHERE', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const deleteSection = extractActionSection(file.content, 'delete');
            expect(deleteSection).toContain('tenantId: ctx.tenantId');
        });

        it('should NOT inject tenant when no @fusion.tenantKey', () => {
            const m = model('Config', [
                field({ name: 'id', isId: true, hasDefaultValue: true }),
                field({ name: 'key' }),
                field({ name: 'value' }),
            ]);
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).not.toContain('ctx.tenantId');
        });
    });

    // ── Schema Asymmetry (Input ≠ Output) ────────────────

    describe('Schema Asymmetry (Input ≠ Output)', () => {
        it('should INCLUDE @fusion.hide fields in create params', () => {
            // The LLM needs to send passwordHash to create the user
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const create = extractActionSection(file.content, 'create');
            expect(create).toContain('passwordHash: z.string()');
        });

        it('should EXCLUDE @id @default from create params', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const create = extractActionSection(file.content, 'create');
            // id has @id @default — auto-generated by DB
            expect(create).not.toMatch(/params:[\s\S]*id: z\.string\(\)/);
        });

        it('should EXCLUDE @fusion.tenantKey from create params', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const create = extractActionSection(file.content, 'create');
            // tenantId injected from ctx, NOT from LLM input
            const paramsBlock = create.split('handler:')[0] ?? '';
            expect(paramsBlock).not.toContain('tenantId: z');
        });

        it('should EXCLUDE createdAt @default from create params', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const create = extractActionSection(file.content, 'create');
            expect(create.split('handler:')[0]).not.toContain('createdAt');
        });

        it('should make all fields .optional() in update params', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const update = extractActionSection(file.content, 'update');
            const paramsBlock = update.split('handler:')[0] ?? '';
            // Match field declaration lines: "                fieldName: z.type()..."
            // Must have deep indentation (16+ spaces) to be inside z.object({})
            const fieldLines = paramsBlock.split('\n').filter(l =>
                l.match(/^\s{16}\w+: z\./) !== null,
            );
            const nonIdFields = fieldLines.filter(l => !l.trim().startsWith('id:'));
            expect(nonIdFields.length).toBeGreaterThan(0);
            for (const line of nonIdFields) {
                expect(line).toContain('.optional()');
            }
        });

        it('should require ID field in update params', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const update = extractActionSection(file.content, 'update');
            // ID should NOT be optional — it's required to identify the record
            expect(update).toMatch(/id: z\.string\(\)/);
        });
    });

    // ── OOM Guard (Pagination) ───────────────────────────

    describe('OOM Guard (Pagination)', () => {
        it('should enforce maximum take of 50 rows', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('.max(50)');
        });

        it('should enforce minimum take of 1', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('.min(1)');
        });

        it('should set default take to 20', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('.default(20)');
        });

        it('should include skip parameter with default 0', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('skip: z.number()');
            expect(file.content).toContain('.default(0)');
        });

        it('should pass take and skip to Prisma findMany', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const findMany = extractActionSection(file.content, 'find_many');
            expect(findMany).toContain('take: args.take');
            expect(findMany).toContain('skip: args.skip');
        });
    });

    // ── MCP Annotations ──────────────────────────────────

    describe('MCP Annotations', () => {
        it('should mark find_many as readOnly', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const findMany = extractActionSection(file.content, 'find_many');
            expect(findMany).toContain('readOnly: true');
        });

        it('should mark find_unique as readOnly', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const findUnique = extractActionSection(file.content, 'find_unique');
            expect(findUnique).toContain('readOnly: true');
        });

        it('should mark delete as destructive', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const deleteSection = extractActionSection(file.content, 'delete');
            expect(deleteSection).toContain('destructive: true');
        });

        it('should NOT mark create as readOnly or destructive', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const create = extractActionSection(file.content, 'create');
            expect(create).not.toContain('readOnly');
            expect(create).not.toContain('destructive');
        });

        it('should NOT mark update as readOnly or destructive', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const update = extractActionSection(file.content, 'update');
            expect(update).not.toContain('readOnly');
            expect(update).not.toContain('destructive');
        });

        it('should have exactly 2 readOnly annotations (find_many + find_unique)', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const matches = file.content.match(/readOnly: true/g);
            expect(matches?.length).toBe(2);
        });

        it('should have exactly 1 destructive annotation (delete)', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const matches = file.content.match(/destructive: true/g);
            expect(matches?.length).toBe(1);
        });
    });

    // ── Flat-Only MVA (Relation Filtering) ───────────────

    describe('Flat-Only MVA (Relation Filtering)', () => {
        it('should not include any relation fields in tool', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).not.toContain('posts');
            expect(file.content).not.toContain('profile');
            expect(file.content).not.toContain('Post');
            expect(file.content).not.toContain('Profile');
        });
    });

    // ── Filterable Fields ────────────────────────────────

    describe('Filterable Fields', () => {
        it('should generate _contains filters for String fields', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            // email is a String field, non-hidden, non-tenant
            expect(file.content).toContain('email_contains: z.string()');
        });

        it('should NOT generate _contains for hidden fields', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).not.toContain('passwordHash_contains');
            expect(file.content).not.toContain('stripeToken_contains');
        });

        it('should NOT generate _contains for tenant key field', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).not.toContain('tenantId_contains');
        });

        it('should NOT generate _contains for non-String fields', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).not.toContain('creditScore_contains');
            expect(file.content).not.toContain('isActive_contains');
            expect(file.content).not.toContain('balance_contains');
        });
    });

    // ── Presenter Binding ────────────────────────────────

    describe('Presenter Binding', () => {
        it('should bind returns: Presenter on find_many', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const findMany = extractActionSection(file.content, 'find_many');
            expect(findMany).toContain('returns: UserPresenter');
        });

        it('should bind returns: Presenter on find_unique', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const findUnique = extractActionSection(file.content, 'find_unique');
            expect(findUnique).toContain('returns: UserPresenter');
        });

        it('should bind returns: Presenter on create', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            const create = extractActionSection(file.content, 'create');
            expect(create).toContain('returns: UserPresenter');
        });

        it('should import Presenter from correct path', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain("from './userPresenter.js'");
        });
    });

    // ── File Metadata ────────────────────────────────────

    describe('File Metadata', () => {
        it('should generate correct file path', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.path).toBe('userTools.ts');
        });

        it('should include @generated tag', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain('@generated');
        });

        it('should import zod', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain("import { z } from 'zod'");
        });

        it('should import defineTool', () => {
            const m = makeUserModel();
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain("import { defineTool } from '@vinkius-core/mcp-fusion'");
        });

        it('should generate tool name with db_ prefix + snake_case', () => {
            const m = model('UserProfile', [
                field({ name: 'id', isId: true, hasDefaultValue: true }),
                field({ name: 'name' }),
            ]);
            const file = emitTool(m, parseAnnotations(m));
            expect(file.content).toContain("defineTool<PrismaFusionContext>('db_user_profile'");
        });
    });

    // ── Model Without Tenant Key ─────────────────────────

    describe('Model without tenant key', () => {
        const simpleModel = model('Config', [
            field({ name: 'id', isId: true, hasDefaultValue: true }),
            field({ name: 'key' }),
            field({ name: 'value' }),
        ]);

        it('should emit queries without tenant filter', () => {
            const file = emitTool(simpleModel, parseAnnotations(simpleModel));
            expect(file.content).not.toContain('ctx.tenantId');
        });

        it('should emit create without tenant injection', () => {
            const file = emitTool(simpleModel, parseAnnotations(simpleModel));
            const create = extractActionSection(file.content, 'create');
            expect(create).toContain('data: args');
        });

        it('should emit all 5 CRUD actions', () => {
            const file = emitTool(simpleModel, parseAnnotations(simpleModel));
            expect(file.content).toContain('find_many:');
            expect(file.content).toContain('find_unique:');
            expect(file.content).toContain('create:');
            expect(file.content).toContain('update:');
            expect(file.content).toContain('delete:');
        });
    });

    // ── Integer ID Models ────────────────────────────────

    describe('Integer ID models', () => {
        it('should use z.number().int() for Int ID field', () => {
            const m = model('Product', [
                field({ name: 'id', type: 'Int', isId: true, hasDefaultValue: true }),
                field({ name: 'name' }),
            ]);
            const file = emitTool(m, parseAnnotations(m));
            // find_unique and delete should use Int ID
            expect(file.content).toContain('id: z.number().int()');
        });
    });
});
