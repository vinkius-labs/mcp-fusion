# Introspection

The framework provides runtime access to action metadata — enabling compliance audits, admin dashboards, middleware validation, documentation generation, and test coverage reports.

---

## The Problem Introspection Solves

In production MCP servers, you need answers to questions that static code analysis cannot provide:

- **Compliance:** "Which actions are destructive? Do all of them have audit middleware?"
- **Dashboards:** "Show me every action registered on this server, grouped by tool, with their required fields."
- **Middleware coverage:** "Are there any actions without authentication middleware?"
- **Documentation:** "Generate API docs from the registered metadata."
- **Test coverage:** "Which actions exist that don't have corresponding tests?"

The introspection API answers all of these at runtime — with data that comes directly from the registered builders.

---

## `getActionNames()`

Returns all action keys as a string array.

```typescript
const tool = new GroupedToolBuilder<void>('projects')
    .action({ name: 'list', readOnly: true, handler: listHandler })
    .action({ name: 'create', schema: createSchema, handler: createHandler })
    .action({ name: 'delete', destructive: true, schema: deleteSchema, handler: deleteHandler });

tool.buildToolDefinition();

console.log(tool.getActionNames());
// ['list', 'create', 'delete']
```

For hierarchical tools:

```typescript
const platform = new GroupedToolBuilder<void>('platform')
    .group('users', g => {
        g.action({ name: 'list', handler: listUsers })
         .action({ name: 'ban', handler: banUser });
    })
    .group('billing', g => {
        g.action({ name: 'invoices', handler: listInvoices });
    });

platform.buildToolDefinition();

console.log(platform.getActionNames());
// ['users.list', 'users.ban', 'billing.invoices']
```

---

## `getActionMetadata()`

Returns detailed metadata for every registered action. Each entry contains:

```typescript
interface ActionMetadata {
    key: string;              // Compound key: 'users.ban' or simple: 'delete'
    actionName: string;       // Action name within group: 'ban'
    groupName?: string;       // Group name: 'users' (undefined for flat)
    description?: string;     // Human-readable description
    destructive: boolean;     // Whether the action destroys data
    idempotent: boolean;      // Whether the action is safe to retry
    readOnly: boolean;        // Whether the action only reads data
    requiredFields: string[]; // Required field names extracted from Zod schema
    hasMiddleware: boolean;   // Whether group-scoped middleware exists
}
```

The `requiredFields` array is extracted from the action's Zod schema using `SchemaUtils.getActionRequiredFields()` — it inspects each field in the schema shape and checks `isOptional()`.

---

## Real Use Cases

### Compliance Audit — Finding Unprotected Destructive Actions

```typescript
function auditDestructiveActions(registry: ToolRegistry<AppContext>) {
    const tools = registry.getAllTools();

    // For each registered builder (access builders via getActionMetadata)
    const report: Array<{ tool: string; action: string; hasMiddleware: boolean }> = [];

    // Example with a single builder:
    const meta = platformBuilder.getActionMetadata();

    for (const action of meta) {
        if (action.destructive && !action.hasMiddleware) {
            report.push({
                tool: platformBuilder.getName(),
                action: action.key,
                hasMiddleware: action.hasMiddleware,
            });
        }
    }

    if (report.length > 0) {
        console.warn('⚠️ DESTRUCTIVE ACTIONS WITHOUT MIDDLEWARE:');
        for (const entry of report) {
            console.warn(`  ${entry.tool} → ${entry.action}`);
        }
    }

    return report;
}
```

### Admin Dashboard — Listing All Server Capabilities

```typescript
function getServerCapabilities(builders: GroupedToolBuilder<AppContext>[]) {
    return builders.map(builder => ({
        tool: builder.getName(),
        tags: builder.getTags(),
        actions: builder.getActionMetadata().map(action => ({
            key: action.key,
            group: action.groupName ?? '(flat)',
            description: action.description ?? '(no description)',
            destructive: action.destructive,
            readOnly: action.readOnly,
            requiredFields: action.requiredFields,
            hasMiddleware: action.hasMiddleware,
        })),
    }));
}

// Output:
// [
//   {
//     tool: 'platform',
//     tags: ['public', 'v2'],
//     actions: [
//       { key: 'users.list', group: 'users', description: 'List all users', destructive: false, readOnly: true, requiredFields: ['workspace_id'], hasMiddleware: true },
//       { key: 'users.ban', group: 'users', description: 'Ban a user', destructive: true, readOnly: false, requiredFields: ['workspace_id', 'user_id'], hasMiddleware: true },
//       ...
//     ]
//   }
// ]
```

### Middleware Coverage Report

```typescript
function middlewareCoverageReport(builder: GroupedToolBuilder<AppContext>) {
    const meta = builder.getActionMetadata();
    const total = meta.length;
    const withMiddleware = meta.filter(a => a.hasMiddleware).length;
    const withoutMiddleware = meta.filter(a => !a.hasMiddleware);

    console.log(`Middleware coverage: ${withMiddleware}/${total} actions (${Math.round(withMiddleware / total * 100)}%)`);

    if (withoutMiddleware.length > 0) {
        console.log('Actions WITHOUT group-scoped middleware:');
        for (const action of withoutMiddleware) {
            const flags = [
                action.destructive ? '⚠️ DESTRUCTIVE' : null,
                action.readOnly ? '📖 read-only' : null,
            ].filter(Boolean).join(', ');
            console.log(`  ${action.key}${flags ? ` (${flags})` : ''}`);
        }
    }
}
```

### Programmatic Documentation Generation

```typescript
function generateActionDocs(builder: GroupedToolBuilder<AppContext>): string {
    const meta = builder.getActionMetadata();
    const lines: string[] = [`## ${builder.getName()}\n`];

    // Group by groupName
    const groups = new Map<string, ActionMetadata[]>();
    for (const action of meta) {
        const group = action.groupName ?? '(ungrouped)';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(action);
    }

    for (const [groupName, actions] of groups) {
        lines.push(`### ${groupName}\n`);
        for (const action of actions) {
            lines.push(`#### \`${action.key}\``);
            if (action.description) lines.push(action.description);
            if (action.requiredFields.length > 0) {
                lines.push(`**Required:** ${action.requiredFields.join(', ')}`);
            }
            if (action.destructive) lines.push(`> ⚠️ **DESTRUCTIVE** — this action permanently modifies data`);
            if (action.readOnly) lines.push(`> 📖 Read-only`);
            lines.push('');
        }
    }

    return lines.join('\n');
}
```

### Test Coverage Validation

```typescript
import { describe, it, expect } from 'vitest';

function ensureTestCoverage(builder: GroupedToolBuilder<AppContext>, testedActions: string[]) {
    const allActions = builder.getActionNames();
    const untested = allActions.filter(name => !testedActions.includes(name));

    if (untested.length > 0) {
        throw new Error(
            `Missing tests for actions: ${untested.join(', ')}\n` +
            `Total: ${allActions.length}, Tested: ${testedActions.length}, Missing: ${untested.length}`
        );
    }
}

// In your test suite:
describe('platform tool', () => {
    const testedActions: string[] = [];

    it('users.list', async () => {
        testedActions.push('users.list');
        // ... test implementation
    });

    it('users.ban', async () => {
        testedActions.push('users.ban');
        // ... test implementation
    });

    // After all tests:
    it('all actions have tests', () => {
        ensureTestCoverage(platformBuilder, testedActions);
    });
});
```

---

## Connection to AnnotationAggregator

The `getActionMetadata()` output directly reflects the per-action properties that the `AnnotationAggregator` uses to compute tool-level hints:

| Metadata Field | Aggregation Rule |
|---|---|
| `destructive: true` on ANY action | → `destructiveHint: true` on the tool |
| `readOnly: true` on ALL actions | → `readOnlyHint: true` on the tool |
| `idempotent: true` on ALL actions | → `idempotentHint: true` on the tool |

You can use introspection to validate that your per-action properties produce the expected tool-level annotations:

```typescript
const meta = builder.getActionMetadata();
const anyDestructive = meta.some(a => a.destructive);
const allReadOnly = meta.every(a => a.readOnly);
const allIdempotent = meta.every(a => a.idempotent);

const tool = builder.buildToolDefinition();
const annotations = (tool as any).annotations;

expect(annotations.destructiveHint).toBe(anyDestructive);
expect(annotations.readOnlyHint).toBe(allReadOnly);
expect(annotations.idempotentHint).toBe(allIdempotent);
```

---

## Connection to SchemaGenerator

The `requiredFields` in `ActionMetadata` uses the same `SchemaUtils.getActionRequiredFields()` function that the `SchemaGenerator` uses when computing the 4-tier field annotations. This means introspection data is always consistent with the generated schema — they share the same source of truth.
