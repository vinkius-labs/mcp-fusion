# Introspection

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Action Keys](#action-keys)
- [Action Metadata](#metadata)
- [Use Cases](#use-cases)
- [Build-Time Prompt Preview](#preview)

## Introduction {#introduction}

Runtime access to action metadata — registered tools, schemas, middleware coverage, destructive flags. Use it for compliance audits, admin dashboards, test coverage checks, and prompt previews. This is the development-time, single-builder complement to the server-scoped [Dynamic Manifest](/dynamic-manifest).

## Action Keys {#action-keys}

After building a tool, call `getActionNames()` to list available actions:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const listUsers = f.query('platform.users_list')
  .describe('List all users')
  .handle(async (input, ctx) => { /* ... */ });

const banUser = f.mutation('platform.users_ban')
  .describe('Ban a user')
  .withString('id', 'User ID')
  .handle(async (input, ctx) => { /* ... */ });

// Get action names from the built tool
console.log(listUsers.getActionNames()); // ['list']
console.log(banUser.getActionNames());   // ['ban']
```

For `GroupedToolBuilder` with hierarchical groups, `getActionNames()` returns the full dotted path: `['users.list', 'users.ban']`.

## Action Metadata {#metadata}

`getActionMetadata()` returns parsed metadata for every action:

```typescript
interface ActionMetadata {
    key: string;              // 'users.ban' or flat 'delete'
    actionName: string;       // 'ban'
    groupName?: string;       // 'users' (undefined for flat)
    description?: string;
    destructive: boolean;
    idempotent: boolean;
    readOnly: boolean;
    requiredFields: string[]; // extracted from Zod schema
    hasMiddleware: boolean;
}
```

`requiredFields` is extracted from the Zod shape graph via `SchemaUtils.getActionRequiredFields()` — it inspects the internal Zod structure and pushes non-optional keys.

## Use Cases {#use-cases}

### Compliance Audit

Ensure no destructive action ships without middleware:

```typescript
function auditDestructiveActions(builder: GroupedToolBuilder<AppContext>) {
    const report: Array<{ tool: string; action: string }> = [];
    const meta = builder.getActionMetadata();

    for (const action of meta) {
        if (action.destructive && !action.hasMiddleware) {
            report.push({
                tool: builder.getName(),
                action: action.key
            });
        }
    }

    if (report.length > 0) {
        console.warn('CRITICAL: DESTRUCTIVE ACTIONS WITHOUT MIDDLEWARE:');
        for (const entry of report) {
            console.warn(`  ${entry.tool} → ${entry.action}`);
        }
    }
}
```

### Admin Dashboard

Map execution scopes into a capabilities view:

```typescript
function getServerCapabilities(builders: GroupedToolBuilder<AppContext>[]) {
    return builders.map(builder => ({
        tool: builder.getName(),
        tags: builder.getTags(),
        actions: builder.getActionMetadata().map(action => ({
            key: action.key,
            description: action.description ?? '(no description)',
            readOnly: action.readOnly,
            requiredFields: action.requiredFields,
        })),
    }));
}
```

### Middleware Coverage

Track what percentage of actions have scoped middleware:

```typescript
function middlewareCoverageReport(builder: GroupedToolBuilder<AppContext>) {
    const meta = builder.getActionMetadata();
    const withMiddleware = meta.filter(a => a.hasMiddleware).length;

    console.log(`Coverage: ${Math.round(withMiddleware / meta.length * 100)}%`);

    const unprotected = meta.filter(a => !a.hasMiddleware);
    for (const action of unprotected) {
        if (action.destructive) {
          console.warn(`CRITICAL UNPROTECTED: ${action.key}`);
        }
    }
}
```

### Test Coverage

Compare deployed action keys against tested ones:

```typescript
import { describe, it } from 'vitest';

function ensureTestCoverage(builder: GroupedToolBuilder<AppContext>, testedActions: string[]) {
    const allActions = builder.getActionNames();
    const untested = allActions.filter(name => !testedActions.includes(name));

    if (untested.length > 0) {
        throw new Error(
            `Missing coverage for deployed endpoints: ${untested.join(', ')}`
        );
    }
}

describe('platform tool', () => {
    const testedActions: string[] = [];

    it('users.list works', async () => {
        testedActions.push('users.list');
        // ...
    });

    it('all actions have test coverage', () => {
        ensureTestCoverage(platformBuilder, testedActions);
    });
});
```

## Build-Time Prompt Preview {#preview}

`previewPrompt()` shows the exact MCP payload the LLM receives — no server needed:

```typescript
const projects = f.query('projects.list')
  .describe('List workspace projects')
  .withString('workspace_id', 'Workspace ID')
  .handle(async (input, ctx) => { /* ... */ });

console.log(projects.previewPrompt());
```

Output includes tool name, action count, tags, description, JSON Schema, annotations, and token estimate (~185 tokens / 740 chars in this example). Auto-calls `buildToolDefinition()` if not yet built.

Use it for token budgeting, prompt grammar checks, schema validation, and TOON comparison (`.toonDescription()`).

> [!TIP]
> Run `previewPrompt()` in a test suite to catch schema regressions and token budget overflows before deployment.

## Connection to the Engine

Introspection data is the same mapping engine that produces LLM payloads. The `destructive` flag in metadata identically matches how `AnnotationAggregator` sets `destructiveHint` on the wire.
