import { describe, it, expect } from 'vitest';
import {
    defineMiddleware,
    resolveMiddleware,
    isMiddlewareDefinition,
} from '../../src/core/middleware/ContextDerivation.js';
import { success } from '../../src/core/response.js';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { defineTool } from '../../src/core/builder/defineTool.js';
import { type MiddlewareFn } from '../../src/core/types.js';

// ============================================================================
// defineMiddleware() — Unit Tests
// ============================================================================

describe('defineMiddleware()', () => {
    it('should create a MiddlewareDefinition with brand', () => {
        const mw = defineMiddleware(async (ctx: { token: string }) => {
            return { user: { id: '42', name: 'Alice' } };
        });
        expect(mw.__brand).toBe('MiddlewareDefinition');
        expect(typeof mw.derive).toBe('function');
        expect(typeof mw.toMiddlewareFn).toBe('function');
    });

    it('should convert to MiddlewareFn via toMiddlewareFn()', () => {
        const mw = defineMiddleware(async () => ({ role: 'admin' }));
        const fn = mw.toMiddlewareFn();
        expect(typeof fn).toBe('function');
    });

    it('should produce a new MiddlewareFn each time toMiddlewareFn is called', () => {
        const mw = defineMiddleware(async () => ({ x: 1 }));
        const fn1 = mw.toMiddlewareFn();
        const fn2 = mw.toMiddlewareFn();
        expect(fn1).not.toBe(fn2);
    });

    it('should merge derived properties into context', async () => {
        const mw = defineMiddleware(async (_ctx: { base: string }) => {
            return { derived: 'value' };
        });

        const fn = mw.toMiddlewareFn();
        const ctx = { base: 'original' } as Record<string, unknown>;

        const result = await fn(
            ctx as any,
            {},
            async () => success(`${ctx['base']}_${ctx['derived']}`),
        );

        expect(result.content[0].text).toBe('original_value');
    });

    it('should support sync derive functions', async () => {
        const mw = defineMiddleware((_ctx: { x: number }) => {
            return { doubled: 42 };
        });

        const fn = mw.toMiddlewareFn();
        const ctx = { x: 21 } as Record<string, unknown>;

        const result = await fn(
            ctx as any,
            {},
            async () => success(String(ctx['doubled'])),
        );

        expect(result.content[0].text).toBe('42');
    });

    it('should propagate errors from derive', async () => {
        const mw = defineMiddleware(async (_ctx: { token: string }) => {
            throw new Error('Unauthorized');
        });

        const fn = mw.toMiddlewareFn();

        await expect(
            fn({ token: '' } as any, {}, async () => success('ok')),
        ).rejects.toThrow('Unauthorized');
    });

    it('should not call next() if derive throws', async () => {
        let nextCalled = false;

        const mw = defineMiddleware(async () => {
            throw new Error('Early abort');
        });

        const fn = mw.toMiddlewareFn();

        try {
            await fn({} as any, {}, async () => {
                nextCalled = true;
                return success('should not reach');
            });
        } catch {
            // Expected
        }

        expect(nextCalled).toBe(false);
    });

    it('should overwrite existing context property with derived value', async () => {
        const mw = defineMiddleware(async (_ctx: { role: string }) => {
            return { role: 'admin' };
        });

        const fn = mw.toMiddlewareFn();
        const ctx = { role: 'guest' } as Record<string, unknown>;

        await fn(
            ctx as any,
            {},
            async () => success('ok'),
        );

        expect(ctx['role']).toBe('admin');
    });

    it('should handle derive returning empty object', async () => {
        const mw = defineMiddleware(async () => {
            return {};
        });

        const fn = mw.toMiddlewareFn();
        const ctx = { existing: 'value' } as Record<string, unknown>;

        const result = await fn(
            ctx as any,
            {},
            async () => success(String(ctx['existing'])),
        );

        expect(result.content[0].text).toBe('value');
    });

    it('should handle derive with async delay', async () => {
        const mw = defineMiddleware(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return { delayed: true };
        });

        const fn = mw.toMiddlewareFn();
        const ctx = {} as Record<string, unknown>;

        await fn(ctx as any, {}, async () => success('ok'));
        expect(ctx['delayed']).toBe(true);
    });
});

// ============================================================================
// isMiddlewareDefinition() — Type Guard
// ============================================================================

describe('isMiddlewareDefinition()', () => {
    it('should return true for MiddlewareDefinition', () => {
        const mw = defineMiddleware(async () => ({ x: 1 }));
        expect(isMiddlewareDefinition(mw)).toBe(true);
    });

    it('should return false for plain functions', () => {
        const fn: MiddlewareFn<void> = async (_ctx, _args, next) => next();
        expect(isMiddlewareDefinition(fn)).toBe(false);
    });

    it('should return false for null', () => {
        expect(isMiddlewareDefinition(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(isMiddlewareDefinition(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
        expect(isMiddlewareDefinition(42)).toBe(false);
        expect(isMiddlewareDefinition('string')).toBe(false);
        expect(isMiddlewareDefinition(true)).toBe(false);
    });

    it('should return false for objects with wrong __brand', () => {
        expect(isMiddlewareDefinition({ __brand: 'ProgressEvent' })).toBe(false);
        expect(isMiddlewareDefinition({ __brand: 'Other' })).toBe(false);
    });

    it('should return false for arrays', () => {
        expect(isMiddlewareDefinition([])).toBe(false);
    });

    it('should return true for structurally valid manual construction', () => {
        const manual = {
            __brand: 'MiddlewareDefinition',
            derive: async () => ({}),
            toMiddlewareFn: () => async (_ctx: any, _args: any, next: any) => next(),
        };
        expect(isMiddlewareDefinition(manual)).toBe(true);
    });
});

// ============================================================================
// resolveMiddleware() — Converter
// ============================================================================

describe('resolveMiddleware()', () => {
    it('should pass through regular MiddlewareFn', () => {
        const fn: MiddlewareFn<void> = async (_ctx, _args, next) => next();
        expect(resolveMiddleware(fn)).toBe(fn);
    });

    it('should convert MiddlewareDefinition to MiddlewareFn', () => {
        const mw = defineMiddleware(async () => ({ x: 1 }));
        const fn = resolveMiddleware(mw as any);
        expect(typeof fn).toBe('function');
        expect(fn).not.toBe(mw);
    });

    it('should produce a working middleware after resolution', async () => {
        const mw = defineMiddleware(async () => ({ resolved: true }));
        const fn = resolveMiddleware(mw as any);

        const ctx = {} as Record<string, unknown>;
        const result = await fn(ctx as any, {}, async () => success('ok'));
        expect(ctx['resolved']).toBe(true);
        expect(result.content[0].text).toBe('ok');
    });
});

// ============================================================================
// Context Derivation — createTool Integration
// ============================================================================

describe('Context Derivation with createTool()', () => {
    it('should inject derived properties into handler context', async () => {
        const addRole = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { role: 'admin' };
        });

        const tool = createTool<Record<string, unknown>>('ctx_tool')
            .use(addRole.toMiddlewareFn())
            .action({
                name: 'whoami',
                handler: async (ctx) => success(String(ctx['role'])),
            });

        const result = await tool.execute({}, { action: 'whoami' });
        expect(result.content[0].text).toBe('admin');
    });

    it('should chain multiple derived middlewares', async () => {
        const addUser = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { userId: 'u42' };
        });

        const addPermissions = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { permissions: ['read', 'write'] };
        });

        const tool = createTool<Record<string, unknown>>('chained')
            .use(addUser.toMiddlewareFn())
            .use(addPermissions.toMiddlewareFn())
            .action({
                name: 'info',
                handler: async (ctx) => {
                    const perms = (ctx['permissions'] as string[]).join(',');
                    return success(`${ctx['userId']}:${perms}`);
                },
            });

        const result = await tool.execute({}, { action: 'info' });
        expect(result.content[0].text).toBe('u42:read,write');
    });

    it('should short-circuit if derive throws (no token)', async () => {
        const requireAuth = defineMiddleware(async (ctx: Record<string, unknown>) => {
            if (!ctx['token']) throw new Error('No token');
            return { user: 'Alice' };
        });

        const tool = createTool<Record<string, unknown>>('auth_tool')
            .use(requireAuth.toMiddlewareFn())
            .action({
                name: 'secret',
                handler: async (ctx) => success(`Hello ${ctx['user']}`),
            });

        const fail = await tool.execute({}, { action: 'secret' });
        expect(fail.isError).toBe(true);
        expect(fail.content[0].text).toContain('No token');

        const ok = await tool.execute({ token: 'valid' }, { action: 'secret' });
        expect(ok.content[0].text).toBe('Hello Alice');
    });

    it('should allow later middleware to read earlier derived context', async () => {
        const addUser = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { userId: 'u99' };
        });

        const addGreeting = defineMiddleware(async (ctx: Record<string, unknown>) => {
            return { greeting: `Hello user ${ctx['userId']}` };
        });

        const tool = createTool<Record<string, unknown>>('cascaded')
            .use(addUser.toMiddlewareFn())
            .use(addGreeting.toMiddlewareFn())
            .action({
                name: 'greet',
                handler: async (ctx) => success(String(ctx['greeting'])),
            });

        const result = await tool.execute({}, { action: 'greet' });
        expect(result.content[0].text).toBe('Hello user u99');
    });

    it('should mix derived middleware with regular middleware', async () => {
        const order: string[] = [];

        const regularMw: MiddlewareFn<Record<string, unknown>> = async (_ctx, _args, next) => {
            order.push('regular');
            return next();
        };

        const derived = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            order.push('derived');
            return { x: 1 };
        });

        const tool = createTool<Record<string, unknown>>('mixed_mw')
            .use(regularMw)
            .use(derived.toMiddlewareFn())
            .action({
                name: 'run',
                handler: async () => { order.push('handler'); return success('ok'); },
            });

        await tool.execute({}, { action: 'run' });
        expect(order).toEqual(['regular', 'derived', 'handler']);
    });

    it('should isolate context mutations across different execute calls', async () => {
        const addCounter = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { count: 1 };
        });

        const tool = createTool<Record<string, unknown>>('isolation')
            .use(addCounter.toMiddlewareFn())
            .action({
                name: 'check',
                handler: async (ctx) => success(String(ctx['count'])),
            });

        const r1 = await tool.execute({}, { action: 'check' });
        const r2 = await tool.execute({}, { action: 'check' });
        expect(r1.content[0].text).toBe('1');
        expect(r2.content[0].text).toBe('1');
    });
});

// ============================================================================
// Context Derivation — defineTool Integration
// ============================================================================

describe('Context Derivation with defineTool()', () => {
    it('should work as middleware in defineTool config', async () => {
        const addRole = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { role: 'viewer' };
        });

        const tool = defineTool<Record<string, unknown>>('dt_mw', {
            middleware: [addRole.toMiddlewareFn()],
            actions: {
                check: {
                    handler: async (ctx) => success(String(ctx['role'])),
                },
            },
        });

        const result = await tool.execute({}, { action: 'check' });
        expect(result.content[0].text).toBe('viewer');
    });

    it('should chain derivation + validation error in defineTool', async () => {
        const requirePerms = defineMiddleware(async (ctx: Record<string, unknown>) => {
            if (!ctx['admin']) throw new Error('Admin required');
            return { level: 'elevated' };
        });

        const tool = defineTool<Record<string, unknown>>('dt_secure', {
            middleware: [requirePerms.toMiddlewareFn()],
            actions: {
                nuke: {
                    handler: async (ctx) => success(`Level: ${ctx['level']}`),
                },
            },
        });

        const fail = await tool.execute({}, { action: 'nuke' });
        expect(fail.isError).toBe(true);
        expect(fail.content[0].text).toContain('Admin required');

        const ok = await tool.execute({ admin: true }, { action: 'nuke' });
        expect(ok.content[0].text).toBe('Level: elevated');
    });

    it('should handle derive returning complex nested objects', async () => {
        const addSession = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return {
                session: {
                    id: 'sess_123',
                    permissions: ['read', 'write'],
                    metadata: { ip: '10.0.0.1', agent: 'bot' },
                },
            };
        });

        const tool = createTool<Record<string, unknown>>('complex')
            .use(addSession.toMiddlewareFn())
            .action({
                name: 'info',
                handler: async (ctx) => {
                    const session = ctx['session'] as any;
                    return success(session.id);
                },
            });

        const result = await tool.execute({}, { action: 'info' });
        expect(result.content[0].text).toBe('sess_123');
    });
});
