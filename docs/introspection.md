# Introspection

The framework provides runtime access to internal action metadata. This exposes exactly how **MCP Fusion** registers tools, enabling you to build compliance audits, admin dashboards, middleware validation checks, programmatic documentation generation, and strict test coverage reports natively.

---

## The Problem Introspection Solves

In production MCP servers deployed alongside language models, you need answers to questions that static code analysis simply cannot provide:

- **Compliance:** "Which actions are destructive? Do all of them have audit middleware?"
- **Admin Dashboards:** "Show me every action registered on this server, grouped by tool, with their required fields."
- **Middleware Coverage:** "Are there any actions exposed to the LLM without authentication middleware?"
- **Test coverage:** "Which actions exist that don't have corresponding unit tests?"

The Introspection API answers all of these natively at runtime — with data parsed directly from the builder schemas.

---

## Fetching Action Keys

Use `getActionNames()` to quickly dump an array of every registered action discriminator key.

```typescript
const tool = createTool<void>('projects')
    .action({ name: 'list', /* ... */ })
    .action({ name: 'create', /* ... */ })
    .action({ name: 'delete', /* ... */ });

// Initialize the engine
tool.buildToolDefinition();

console.log(tool.getActionNames());
// ['list', 'create', 'delete']
```

For hierarchically grouped namespaces, the framework automatically produces the compound keys:

```typescript
const platform = new GroupedToolBuilder<void>('platform')
    .group('users', g => {
        g.action({ name: 'list', handler: listUsers })
         .action({ name: 'ban', handler: banUser });
    });

platform.buildToolDefinition();

console.log(platform.getActionNames());
// ['users.list', 'users.ban']
```

---

## Fetching Deep Metadata

If you need deeper runtime knowledge of your execution schemas, `getActionMetadata()` returns the heavily parsed metadata object underlying every action.

```typescript
interface ActionMetadata {
    key: string;              // Compound key: 'users.ban' or flat key: 'delete'
    actionName: string;       // Action name within group: 'ban'
    groupName?: string;       // Group name: 'users' (undefined for flat)
    description?: string;     // Internal human-readable description
    destructive: boolean;     // Defines if the action strictly destroys data
    idempotent: boolean;      // Defines if the action is fully safe to auto-retry
    readOnly: boolean;        // Defines if the action never mutates data
    requiredFields: string[]; // Natively parsed from the underlying Zod schema!
    hasMiddleware: boolean;   // Identifies if group-scoped isolated middleware protects it
}
```

::: info Magic Zod Parsing
The `requiredFields` array is uniquely extracted from the action's underlying Zod schema via `SchemaUtils.getActionRequiredFields()`. It natively inspects the internal Zod shape graph and pushes non-optional keys.
:::

---

## Real-World Use Cases

Here are robust examples demonstrating how you can wire the Introspection engine into complex backend systems.

### 1. Compliance Audit

Ensure no destructive command is ever deployed without proper middleware protection.

```typescript
function auditDestructiveActions(registry: ToolRegistry<AppContext>) {
    // Iterate over all builders mounted to the registry
    const report: Array<{ tool: string; action: string }> = [];
    const meta = platformBuilder.getActionMetadata();

    for (const action of meta) {
        if (action.destructive && !action.hasMiddleware) {
            report.push({
                tool: platformBuilder.getName(),
                action: action.key
            });
        }
    }

    if (report.length > 0) {
        console.warn('CRITICAL: [DESTRUCTIVE] ACTIONS LEAKED WITHOUT MIDDLEWARE:');
        for (const entry of report) {
            console.warn(`  ${entry.tool} → ${entry.action}`);
        }
    }
}
```

### 2. Admin Dashboards

Easily map MCP execution scopes into dynamic web portal capabilities views.

```typescript
function getServerCapabilities(builders: GroupedToolBuilder<AppContext>[]) {
    return builders.map(builder => ({
        tool: builder.getName(),
        tags: builder.getTags(),
        actions: builder.getActionMetadata().map(action => ({
            key: action.key,
            description: action.description ?? '(no description)',
            readOnly: action.readOnly,
            // Renders explicitly required Schema args to the Admin UI
            requiredFields: action.requiredFields, 
        })),
    }));
}
```

### 3. Middleware Coverage Reporting

Prevent security holes by tracking the exact percentage of your grouped tools protected by explicit scoped middleware.

```typescript
function middlewareCoverageReport(builder: GroupedToolBuilder<AppContext>) {
    const meta = builder.getActionMetadata();
    const withMiddleware = meta.filter(a => a.hasMiddleware).length;

    console.log(`Coverage: ${Math.round(withMiddleware / meta.length * 100)}%`);

    const unprotected = meta.filter(a => !a.hasMiddleware);
    for (const action of unprotected) {
        if (action.destructive) {
          console.warn(`CRITICAL UNPROTECTED ROW: ${action.key}`);
        }
    }
}
```

### 4. Test Coverage Checking

Because `getActionNames()` strictly returns dynamic runtime keys, you can ensure your test pipelines cover exactly what is deployed.

```typescript
import { describe, it } from 'vitest';

function ensureTestCoverage(builder: GroupedToolBuilder<AppContext>, testedActions: string[]) {
    const allActions = builder.getActionNames();
    const untested = allActions.filter(name => !testedActions.includes(name));

    if (untested.length > 0) {
        throw new Error(
            `Missing coverage for deployed LLM endpoints: ${untested.join(', ')}`
        );
    }
}

// In the suite:
describe('platform tool', () => {
    const testedActions: string[] = [];

    it('users.list works', async () => {
        testedActions.push('users.list');
        // ...
    });

    it('all actions have verified test coverage', () => {
        ensureTestCoverage(platformBuilder, testedActions);
    });
});
```

---

## Build-Time Prompt Preview

Use `previewPrompt()` to see the exact MCP payload the LLM will receive — without starting a server:

```typescript
const projects = defineTool<AppContext>('projects', {
    description: 'Manage workspace projects',
    tags: ['api'],
    actions: {
        list:   { readOnly: true, handler: listProjects },
        create: { params: { name: 'string' }, handler: createProject },
        delete: { destructive: true, params: { id: 'string' }, handler: deleteProject },
    },
});

console.log(projects.previewPrompt());
```

**Output:**

```
┌────────────────────────────────────────────────────────┐
│  MCP Tool Preview: projects
├─── Summary ────────────────────────────────────────────┤
│  Name: projects
│  Actions: 3 (list, create, delete)
│  Tags: api
├─── Description ────────────────────────────────────────┤
│  Manage workspace projects. Actions: list, create, delete
│
│  Workflow:
│  - 'create': Requires: name
│  - 'delete':  [DESTRUCTIVE]
├─── Input Schema ───────────────────────────────────────┤
│  {
│    "type": "object",
│    "properties": {
│      "action": { "type": "string", "enum": ["list", "create", "delete"] },
│      "name": { "type": "string" },
│      "id": { "type": "string" }
│    },
│    "required": ["action"]
│  }
├─── Annotations ────────────────────────────────────────┤
│  {
│    "readOnlyHint": false,
│    "destructiveHint": true,
│    "idempotentHint": false
│  }
├─── Token Estimate ─────────────────────────────────────┤
│  ~185 tokens (740 chars)
└────────────────────────────────────────────────────────┘
```

This is invaluable for:

- **Token budgeting** — know exactly how many tokens each tool consumes before deployment
- **Prompt grammar** — verify the auto-generated description reads well for LLMs
- **Schema validation** — check that the union schema is correct before an LLM tries it
- **TOON comparison** — preview with `.toonDescription(true)` vs standard to measure savings

::: tip
`previewPrompt()` auto-calls `buildToolDefinition()` if the tool hasn't been built yet, so you can call it at any point.
:::

---

## Connection to the Execution Engine

The Introspection data you retrieve is exactly the same underlying mapping engine that generates your final LLM payloads. For instance, the result of whether `destructive` exists identically matches how `AnnotationAggregator` enforces the `destructiveHint` tag to the language model.
