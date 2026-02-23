# Testing Guide

**MCP Fusion** tools are designed for testability. Every builder can be tested directly without an MCP server.

## Direct Execution (No Server Required)

Every `GroupedToolBuilder` has an `.execute()` method that runs the full pipeline — validation, middleware, handler — without any MCP infrastructure:

```typescript
import { describe, it, expect } from 'vitest';
import { createTool, success, error } from '@vinkius-core/mcp-fusion';

const calculator = createTool<void>('calculator')
    .action({
        name: 'add',
        handler: async (_ctx, args) => {
            const a = args.a as number;
            const b = args.b as number;
            return success(a + b);
        },
    });

describe('calculator', () => {
    it('adds two numbers', async () => {
        const result = await calculator.execute(undefined, {
            action: 'add',
            a: 2,
            b: 3,
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toBe('5');
    });
});
```

## Testing with Context

When tools require a typed context, create a mock context for tests:

::: code-group
```typescript [defineTool]
import { defineTool, success } from '@vinkius-core/mcp-fusion';

interface AppContext {
    db: { projects: { findMany: () => Promise<any[]> } };
    userId: string;
}

const projects = defineTool<AppContext>('projects', {
    actions: {
        list: {
            readOnly: true,
            handler: async (ctx, _args) => {
                const items = await ctx.db.projects.findMany();
                return success(items);
            },
        },
    },
});

// Test with a mock context
const mockCtx: AppContext = {
    db: {
        projects: {
            findMany: async () => [
                { id: '1', name: 'Alpha' },
                { id: '2', name: 'Beta' },
            ],
        },
    },
    userId: 'test-user',
};

const result = await projects.execute(mockCtx, { action: 'list' });
```
```typescript [createTool]
import { createTool, success } from '@vinkius-core/mcp-fusion';

interface AppContext {
    db: { projects: { findMany: () => Promise<any[]> } };
    userId: string;
}

const projects = createTool<AppContext>('projects')
    .action({
        name: 'list',
        readOnly: true,
        handler: async (ctx, _args) => {
            const items = await ctx.db.projects.findMany();
            return success(items);
        },
    });

// Same mock context, same execution
const result = await projects.execute(mockCtx, { action: 'list' });
```
:::

## Testing Error Cases

Verify error responses with `isError`:

```typescript
it('returns error for unknown action', async () => {
    const result = await calculator.execute(undefined, {
        action: 'unknown',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Unknown action');
});

it('returns error for missing discriminator', async () => {
    const result = await calculator.execute(undefined, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('action is required');
});
```

## Testing Middleware

Middleware is pre-compiled into the execution chain, so testing it is transparent:

```typescript
import { createTool, error, success, type MiddlewareFn } from '@vinkius-core/mcp-fusion';

interface AuthContext { token?: string; }

const requireAuth: MiddlewareFn<AuthContext> = async (ctx, _args, next) => {
    if (!ctx.token) return error('Unauthorized');
    return next();
};

const secureTool = createTool<AuthContext>('secure')
    .use(requireAuth)
    .action({
        name: 'data',
        handler: async (_ctx, _args) => success('secret'),
    });

it('blocks unauthenticated requests', async () => {
    const result = await secureTool.execute({}, { action: 'data' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('Unauthorized');
});

it('allows authenticated requests', async () => {
    const result = await secureTool.execute(
        { token: 'valid' },
        { action: 'data' },
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe('secret');
});
```

## Testing with ToolRegistry

For integration tests, use `ToolRegistry.routeCall()`:

```typescript
import { ToolRegistry, createTool, success } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<void>();

registry.register(
    createTool<void>('math')
        .action({ name: 'add', handler: async (_ctx, args) => success((args.a as number) + (args.b as number)) }),
);

it('routes to the correct tool', async () => {
    const result = await registry.routeCall(undefined, 'math', {
        action: 'add', a: 10, b: 20,
    });
    expect(result.content[0]?.text).toBe('30');
});

it('returns error for unknown tool', async () => {
    const result = await registry.routeCall(undefined, 'nonexistent', {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Unknown tool');
});
```

## Testing Streaming Progress

For async generator handlers, test that progress events are emitted:

```typescript
import { createTool, success, progress } from '@vinkius-core/mcp-fusion';

const importer = createTool<void>('importer')
    .action({
        name: 'run',
        handler: async function* (_ctx, _args) {
            yield progress(25, 'Loading...');
            yield progress(75, 'Processing...');
            return success('Done');
        },
    });

it('completes with success', async () => {
    const result = await importer.execute(undefined, { action: 'run' });
    expect(result.content[0]?.text).toBe('Done');
});
```

## Inspecting Tool Definitions

Use `buildToolDefinition()` to verify the generated MCP tool schema:

```typescript
it('generates correct schema', () => {
    const tool = calculator.buildToolDefinition();

    expect(tool.name).toBe('calculator');
    expect(tool.inputSchema.properties).toHaveProperty('action');
    expect(tool.description).toContain('Actions: add');
});
```

## Introspection API

Use `getActionMetadata()` for compliance audits or programmatic checks:

```typescript
it('marks destructive actions correctly', () => {
    const meta = tool.getActionMetadata();
    const deleteAction = meta.find(m => m.key === 'delete');

    expect(deleteAction?.destructive).toBe(true);
    expect(deleteAction?.readOnly).toBe(false);
});
```

## End-to-End Integration Testing

For comprehensive integration tests that validate **all modules working together** through the MCP Server layer, create a lightweight mock server and use `attachToServer()`:

```typescript
import { ToolRegistry, createTool, success, error } from '@vinkius-core/mcp-fusion';
import { createDebugObserver } from '@vinkius-core/mcp-fusion/observability';
import type { DebugEvent } from '@vinkius-core/mcp-fusion/observability';

// Lightweight mock that captures setRequestHandler calls
function createMockServer() {
    const handlers = new Map<string, Function>();
    return {
        setRequestHandler: (schema: any, handler: Function) => {
            handlers.set(schema.method, handler);
        },
        async callTool(name: string, args: Record<string, unknown>, extra?: any) {
            const handler = handlers.get('tools/call');
            return handler!({ params: { name, arguments: args } }, extra);
        },
        async callListTools() {
            const handler = handlers.get('tools/list');
            return handler!({});
        },
    };
}
```

### Happy path: context factory + debug observability

```typescript
interface Ctx { userId: string; role: string }

it('should wire context + debug through the full pipeline', async () => {
    const events: DebugEvent[] = [];

    const tool = createTool<Ctx>('tasks')
        .use(async (ctx, args, next) => {
            if (ctx.role !== 'admin') return error('Forbidden');
            return next(ctx, args);
        })
        .action({
            name: 'list',
            handler: async (ctx) => success(`Tasks for ${ctx.userId}`),
        });

    const registry = new ToolRegistry<Ctx>();
    registry.register(tool);

    const server = createMockServer();
    registry.attachToServer(server, {
        toolExposition: 'grouped',
        contextFactory: (extra: any) => ({
            userId: extra?.userId ?? 'anonymous',
            role: extra?.role ?? 'viewer',
        }),
        debug: createDebugObserver((e) => events.push(e)),
    });

    const result = await server.callTool(
        'tasks', { action: 'list' }, { userId: 'u_1', role: 'admin' },
    );

    expect(result.content[0].text).toBe('Tasks for u_1');
    expect(events.some(e => e.type === 'execute')).toBe(true);
});
```

### Sad path: validation failures, handler exceptions, middleware blocks

```typescript
it('should return isError=true for validation failures', async () => {
    const tool = createTool<void>('calc').action({
        name: 'add',
        schema: z.object({ a: z.number(), b: z.number() }),
        handler: async (_ctx, args) => success(`${args.a + args.b}`),
    });

    const registry = new ToolRegistry<void>();
    registry.register(tool);
    const server = createMockServer();
    registry.attachToServer(server, { toolExposition: 'grouped' });

    // Wrong type → structured validation error
    const r = await server.callTool('calc', { action: 'add', a: 'oops', b: 5 });
    expect(r.isError).toBe(true);

    // Unknown tool → UNKNOWN_TOOL with suggestions
    const r2 = await server.callTool('ghost', { action: 'run' });
    expect(r2.isError).toBe(true);
    expect(r2.content[0].text).toContain('UNKNOWN_TOOL');
});
```

::: tip Complete Reference
See [`tests/integration/FullStack.test.ts`](https://github.com/VinkiusLabs/mcp-fusion/blob/main/tests/integration/FullStack.test.ts) for a production-grade integration test suite with **37 tests** covering all modules — Builder, Registry, Server, Presenter, Middleware, Debug, Tracing, StateSync, PromptRegistry, and Flat Exposition — with both happy and sad paths.
:::

## Best Practices

1. **Test via `.execute()`** — avoids MCP infrastructure complexity for unit tests
2. **Create typed mock contexts** — keeps tests readable and type-safe
3. **Test error paths explicitly** — verify unknown actions, validation failures, middleware blocks
4. **Use `ToolRegistry.routeCall()`** for integration tests that span multiple tools
5. **Use `attachToServer()` with a mock** — for E2E tests that validate the full MCP pipeline including observability, prompts, and exposition strategies
6. **Test both happy AND sad paths** — the framework must resolve developer mistakes (wrong types, missing fields, invalid config) gracefully
7. **Check `buildToolDefinition()`** — ensures schema, description, and annotations are correct
8. **Freeze-after-build** — verify that `.action()` after `.buildToolDefinition()` throws

