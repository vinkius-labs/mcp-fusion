# API Reference

Complete reference for every public class, function, type, and interface exported by the framework.

---

## Response Helpers

Imported from root: `import { success, error, required, toonSuccess } from '@vinkius-core/mcp-fusion'`

### `success(data: string | object): ToolResponse`

Creates a success response. Auto-detects the input type:
- `string` → used as-is in the text field
- `object` → serialized with `JSON.stringify(data, null, 2)`

```typescript
return success('Task created');
return success({ id: '1', title: 'My task', status: 'open' });
```

### `error(message: string): ToolResponse`

Creates an error response with `isError: true`.

```typescript
return error('Task not found');
return error('Forbidden: admin role required');
```

### `required(field: string): ToolResponse`

Shorthand for a missing required field error. Returns `isError: true` with message `"Error: {field} required"`.

```typescript
return required('project_id');  // → { content: [{ type: "text", text: "Error: project_id required" }], isError: true }
```

### `toonSuccess(data: unknown, options?: EncodeOptions): ToolResponse`

Creates a success response with TOON-encoded payload via `@toon-format/toon` `encode()`. Default delimiter: `|`.

```typescript
return toonSuccess(users);                        // Pipe-delimited
return toonSuccess(users, { delimiter: ',' });    // Comma-delimited
```

### `ToolResponse` (type)

```typescript
interface ToolResponse {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}
```

---

## GroupedToolBuilder

Imported from root: `import { GroupedToolBuilder } from '@vinkius-core/mcp-fusion'`

### `constructor(name: string)`

Creates a new builder with the given tool name. The name is used as the MCP tool name in `tools/list`.

```typescript
const tool = new GroupedToolBuilder<AppContext>('projects');
```

### `.description(desc: string): this`

Sets the tool description. This becomes the first line of the auto-generated LLM description.

### `.discriminator(field: string): this`

Changes the discriminator field name. Default: `"action"`. The discriminator is the field the LLM uses to select which operation to perform.

```typescript
builder.discriminator('operation');
// LLM now sends { operation: "list" } instead of { action: "list" }
```

### `.annotations(a: Record<string, unknown>): this`

Sets explicit MCP tool annotations. These override the `AnnotationAggregator`'s computed values.

```typescript
builder.annotations({ readOnlyHint: true });
```

### `.tags(...tags: string[]): this`

Sets capability tags for selective tool exposure via `ToolRegistry.getTools()`.

```typescript
builder.tags('public', 'v2');
```

### `.commonSchema<TSchema>(schema: TSchema): GroupedToolBuilder<TContext, TSchema["_output"]>`

Sets a Zod schema shared by all actions. Fields from this schema are:
- Included in every action's validation
- Typed into every handler's `args` parameter via generic propagation
- Annotated as `(always required)` in the generated schema if required in the Zod schema

**Type propagation:** The return type narrows to include `TSchema["_output"]` in the `TCommon` generic parameter. This means `args` in every subsequent handler is typed as `TSchema["_output"] & TActionSchema["_output"]`.

```typescript
const builder = new GroupedToolBuilder<AppContext>('projects')
    .commonSchema(z.object({ workspace_id: z.string() }));
// Subsequent handlers: args has { workspace_id: string } merged with their action schema
```

### `.toonDescription(): this`

Enables TOON-encoded descriptions. Instead of markdown workflow sections, the `ToonDescriptionGenerator` encodes action metadata as compact pipe-delimited tabular data.

### `.use(mw: MiddlewareFn<TContext>): this`

Adds global middleware. Runs for every action (outermost in the chain).

### `.action(config: ActionConfig<TContext>): this`

Registers a flat action. Only available in flat mode (cannot be mixed with `.group()`).

**Typed overload** (when `schema` is provided):

```typescript
builder.action({
    name: 'create',
    description: 'Create a project',
    schema: z.object({ name: z.string(), template: z.string().optional() }),
    destructive: false,
    idempotent: false,
    readOnly: false,
    handler: async (ctx, args) => {
        // args is typed: { name: string, template?: string } & TCommon
        return success({ id: '1', name: args.name });
    },
});
```

**Untyped overload** (no `schema`):

```typescript
builder.action({
    name: 'list',
    readOnly: true,
    handler: async (ctx, args) => {
        // args is Record<string, unknown>
        return success([]);
    },
});
```

**ActionConfig fields:**

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | Action name. Must not contain dots. |
| `description` | `string` | — | Human-readable description |
| `schema` | `ZodObject` | — | Zod schema for action-specific parameters |
| `destructive` | `boolean` | `false` | Marks action as destructive (⚠️ DESTRUCTIVE in description) |
| `idempotent` | `boolean` | `false` | Hints that the action is safe to retry |
| `readOnly` | `boolean` | `false` | Hints that the action does not modify state |
| `handler` | function | required | `(ctx, args) => Promise<ToolResponse>` |

### `.group(name, configure)` / `.group(name, description, configure)`

Registers a group of actions with `module.action` compound keys. Only available in hierarchical mode (cannot be mixed with `.action()`).

```typescript
builder.group('users', 'User management', g => {
    g.use(requireAdmin)
     .action({ name: 'list', readOnly: true, handler: listUsers })
     .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
});
```

The `configure` callback receives an `ActionGroupBuilder` with:
- `.use(mw)` — group-scoped middleware
- `.action(config)` — same as builder's `.action()`, but keys become `groupName.actionName`

### `.buildToolDefinition(): McpTool`

Generates and caches the MCP tool definition. After this call, the builder is frozen — all mutation methods throw.

Internally executes:
1. `DescriptionGenerator` (or `ToonDescriptionGenerator`) → description string
2. `SchemaGenerator` → inputSchema with 4-tier field annotations
3. `AnnotationAggregator` → conservative behavioral hints
4. `MiddlewareCompiler` → pre-compiled chain `Map<string, ChainFn>`
5. `Object.freeze(this._actions)` → immutable

### `.execute(ctx, args): Promise<ToolResponse>`

Routes a call to the correct action handler through the pre-compiled middleware chain.

**Execution pipeline:**
1. Auto-build if not built yet
2. Parse discriminator → error if missing (lists available actions)
3. Find action → error if not found (lists available actions)
4. Zod validate: `commonSchema.merge(action.schema).strip().safeParse()` → structured error if failed
5. Call pre-compiled chain → wrapped in try/catch with `[toolName/action]` prefix

### `.getName(): string`

Returns the tool name.

### `.getTags(): string[]`

Returns a **copy** of the tags array (defensive copy prevents external mutation).

### `.getActionNames(): string[]`

Returns all action keys. Flat mode: `['list', 'create', 'delete']`. Hierarchical mode: `['users.list', 'users.ban', 'billing.refund']`.

### `.getActionMetadata(): ActionMetadata[]`

Returns detailed metadata for every action:

```typescript
interface ActionMetadata {
    key: string;            // 'users.ban' or 'delete'
    actionName: string;     // 'ban' or 'delete'
    groupName?: string;     // 'users' (undefined for flat actions)
    description?: string;
    destructive: boolean;
    idempotent: boolean;
    readOnly: boolean;
    requiredFields: string[];  // Extracted from Zod schema via SchemaUtils
    hasMiddleware: boolean;    // true if group-scoped middleware exists
}
```

---

## ToolRegistry

Imported from root: `import { ToolRegistry } from '@vinkius-core/mcp-fusion'`

### `constructor()`

Creates a registry for `ToolBuilder<TContext>` instances.

```typescript
const registry = new ToolRegistry<AppContext>();
```

### `.register(builder: ToolBuilder<TContext>): void`

Registers a single builder. Throws on duplicate name. Calls `buildToolDefinition()` to trigger validation and caching.

### `.registerAll(...builders: ToolBuilder<TContext>[]): void`

Registers multiple builders at once.

```typescript
registry.registerAll(projectsTool, tasksTool, usersTool);
```

### `.getAllTools(): McpTool[]`

Returns all registered tool definitions (no filtering).

### `.getTools(filter: ToolFilter): McpTool[]`

Returns tool definitions filtered by tags.

```typescript
interface ToolFilter {
    tags?: string[];     // Builder must have ALL these tags
    exclude?: string[];  // Builder must not have ANY of these tags
}
```

### `.routeCall(ctx, name, args): Promise<ToolResponse>`

Routes a call to the correct builder by tool name. Returns a clear error if the tool is not found, listing all available tool names.

### `.attachToServer(server, options?): DetachFn`

Attaches the registry to an MCP server — registers `tools/list` and `tools/call` handlers.

**Parameters:**

- `server: unknown` — accepts both `Server` (low-level) and `McpServer` (high-level) via duck-typed resolution
- `options.filter?: ToolFilter` — optional tag filter for `tools/list`
- `options.contextFactory?: (extra: unknown) => TContext` — optional per-request context factory. The `extra` parameter is the MCP session info.

**Returns:** `DetachFn` — a function that resets both handlers to no-ops.

```typescript
// Minimal
const detach = registry.attachToServer(server);

// With filtering and context
const detach = registry.attachToServer(server, {
    filter: { tags: ['public'] },
    contextFactory: (extra) => createContext(extra),
});

// Clean teardown
detach();
```

### `.has(name: string): boolean`

Checks if a tool is registered.

### `.clear(): void`

Removes all registered tools.

### `.size: number`

Number of registered tools (getter).

---

## MiddlewareFn (type)

```typescript
type MiddlewareFn<TContext> = (
    ctx: TContext,
    args: Record<string, unknown>,
    next: () => Promise<ToolResponse>,
) => Promise<ToolResponse>;
```

---

## Domain Model Classes

All domain model classes use **public fields** for direct property access — idiomatic TypeScript, no getter/setter boilerplate.

### `BaseModel`

Base class for all MCP entities.

| Property/Method | Type | Description |
|---|---|---|
| `name` | `readonly string` | Entity name (set via constructor) |
| `nameSeparator` | `readonly string` | FQN separator (default: `"."`) |
| `title` | `string?` | Human-readable title |
| `description` | `string?` | Entity description |
| `meta` | `Map<string, unknown>?` | Arbitrary metadata |
| `icons` | `Icon[]?` | Icon definitions |
| `getFullyQualifiedName()` | `string` | Abstract — implemented by subclasses |

```typescript
const tool = new Tool('deploy');
tool.title = 'Deploy Service';
tool.description = 'Deploys the app to production';
console.log(tool.name);  // 'deploy'
```

### `Group`

Tree node with parent-child relationships for all MCP primitive types.

| Property/Method | Type | Description |
|---|---|---|
| `parent` | `Group \| null` | Parent group (null for root) |
| `childGroups` | `readonly Group[]` | Child groups |
| `childTools` | `readonly Tool[]` | Child tools |
| `childPrompts` | `readonly Prompt[]` | Child prompts |
| `childResources` | `readonly Resource[]` | Child resources |
| `getRoot()` | `Group` | Recursive root traversal |
| `isRoot()` | `boolean` | True if no parent |
| `addChildGroup(group)` / `removeChildGroup(group)` | `boolean` | Manage child groups (sets/clears parent) |
| `addChildTool(tool)` / `removeChildTool(tool)` | `boolean` | Manage child tools |
| `addChildPrompt(prompt)` / `removeChildPrompt(prompt)` | `boolean` | Manage child prompts |
| `addChildResource(resource)` / `removeChildResource(resource)` | `boolean` | Manage child resources |
| `getFullyQualifiedName()` | `string` | Recursive dot-separated path: `root.parent.child` |

Constructor accepts optional `nameSeparator` (default: `"."`).

```typescript
const root = new Group('devops');
const ci = new Group('ci');
root.addChildGroup(ci);
console.log(ci.parent?.name);             // 'devops'
console.log(ci.getFullyQualifiedName());  // 'devops.ci'
```

### `Tool` (extends GroupItem)

| Property | Type | Description |
|---|---|---|
| `inputSchema` | `string?` | Input schema string |
| `outputSchema` | `string?` | Output schema string |
| `toolAnnotations` | `ToolAnnotations?` | Tool annotation hints |

### `ToolAnnotations`

| Property | Type | Description |
|---|---|---|
| `title` | `string?` | Annotation title |
| `readOnlyHint` | `boolean?` | Read-only hint |
| `destructiveHint` | `boolean?` | Destructive hint |
| `idempotentHint` | `boolean?` | Idempotent hint |
| `openWorldHint` | `boolean?` | Open world hint |
| `returnDirect` | `boolean?` | Return direct flag |

```typescript
const ta = new ToolAnnotations();
ta.destructiveHint = true;
ta.readOnlyHint = false;
```

### `Prompt` (extends GroupItem)

| Property/Method | Type | Description |
|---|---|---|
| `promptArguments` | `readonly PromptArgument[]` | Argument list |
| `addPromptArgument(arg)` / `removePromptArgument(arg)` | `boolean` | Manage arguments |

### `PromptArgument` (extends BaseModel)

| Property | Type | Description |
|---|---|---|
| `required` | `boolean` | Required flag (default: `false`) |

### `Resource` (extends GroupItem)

| Property | Type | Description |
|---|---|---|
| `uri` | `string?` | Resource URI |
| `size` | `number?` | Resource size in bytes |
| `mimeType` | `string?` | MIME type |
| `annotations` | `Annotations?` | Resource annotations |

### `Annotations`

Constructor parameters are all optional: `new Annotations(audience?, priority?, lastModified?)`.

| Property | Type | Description |
|---|---|---|
| `audience` | `Role[]?` | Target audience (USER, ASSISTANT) |
| `priority` | `number?` | Priority value |
| `lastModified` | `string?` | Last modified timestamp |

### `GroupItem`

| Property/Method | Type | Description |
|---|---|---|
| `parentGroups` | `readonly Group[]` | All parent groups |
| `addParentGroup(group)` / `removeParentGroup(group)` | `boolean` | Multi-parent support |

### `Icon`

| Property | Type | Description |
|---|---|---|
| `src` | `string?` | Icon source URL |
| `mimeType` | `string?` | Icon MIME type |
| `sizes` | `string[]?` | Available sizes |
| `theme` | `string?` | Theme (light/dark) |

### `Role` (enum)

```typescript
enum Role {
    USER = "USER",
    ASSISTANT = "ASSISTANT"
}
```

---

## Bidirectional Converters

All converters share a common base class `ConverterBase<TSource, TTarget>` that implements batch conversion with null filtering. Domain-specific converters extend this base and add typed method aliases.

### `ConverterBase<TSource, TTarget>`

Generic base class providing batch conversion logic in both directions.

| Method | Type | Description |
|---|---|---|
| `convertFromBatch(sources)` | `TTarget[]` | Batch convert source → target (null-filtered) |
| `convertFromSingle(source)` | `TTarget` | *protected abstract* — single-item conversion |
| `convertToBatch(targets)` | `TSource[]` | Batch convert target → source (null-filtered) |
| `convertToSingle(target)` | `TSource` | *protected abstract* — single-item conversion |

### Domain-Specific Converters

Each extends `ConverterBase` and delegates batch operations to the base class:

| Converter | Extends | Converts Between |
|---|---|---|
| `GroupConverterBase<T>` | `ConverterBase<Group, T>` | `Group` ↔ `T` |
| `ToolConverterBase<T>` | `ConverterBase<Tool, T>` | `Tool` ↔ `T` |
| `PromptConverterBase<T>` | `ConverterBase<Prompt, T>` | `Prompt` ↔ `T` |
| `ResourceConverterBase<T>` | `ConverterBase<Resource, T>` | `Resource` ↔ `T` |
| `ToolAnnotationsConverterBase<T>` | `ConverterBase<ToolAnnotations, T>` | `ToolAnnotations` ↔ `T` |

Usage: extend the domain-specific abstract class and implement the single-item conversion methods.

```typescript
class MyToolConverter extends ToolConverterBase<ExternalTool> {
    convertFromTool(tool: Tool): ExternalTool {
        return { name: tool.name, schema: tool.inputSchema };
    }
    convertToTool(external: ExternalTool): Tool {
        const tool = new Tool(external.name);
        if (external.schema) tool.inputSchema = external.schema;
        return tool;
    }
}

const converter = new MyToolConverter();
const externalTools = converter.convertFromTools(tools);  // Batch, null-filtered
```

For custom domain types not covered by the built-in converters, extend `ConverterBase` directly:

```typescript
class MyCustomConverter extends ConverterBase<MySource, MyTarget> {
    protected convertFromSingle(source: MySource): MyTarget {
        return { /* ... */ };
    }
    protected convertToSingle(target: MyTarget): MySource {
        return { /* ... */ };
    }
}
```
