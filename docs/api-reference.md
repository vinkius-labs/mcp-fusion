# API Reference

A highly dense reference manual for every public class, function, type, and interface exported by the MCP Fusion framework.

---

## Response Helpers

Because MCP dictates strict return structures, rather than sending complex JSON array trees by hand, use the Fusion helper libraries for instant payload mappings.

### `success(data)`

Creates a success response payload. Auto-detects the input type. If a string is passed, it is used as is. If an object is passed, it is intelligently serialized via `JSON.stringify`.

```typescript
import { success } from '@vinkius-core/mcp-fusion';

return success('Task created');
return success({ id: '1', title: 'My task', status: 'open' });
```

### `error(message)`

Instantly yields an error response strictly flagged with `isError: true`. The language model recognizes this flag.

```typescript
import { error } from '@vinkius-core/mcp-fusion';

return error('Task not found');
return error('Forbidden: admin role required');
```

### `required(field)`

A fast shorthand for throwing a cleanly formatted missing required field text string back to the LLM context.

```typescript
import { required } from '@vinkius-core/mcp-fusion';

// Emits { content: [{ type: "text", text: "Error: project_id required" }], isError: true }
return required('project_id');  
```

### `toonSuccess(data)`

Creates a standard success response with a TOON-encoded payload via the `@toon-format/toon` compression schema.

```typescript
import { toonSuccess } from '@vinkius-core/mcp-fusion';

return toonSuccess(users);                        // Pipe-delimited natively
return toonSuccess(users, { delimiter: ',' });    // Custom delimiter
```

---

## The Execution Engine

### `GroupedToolBuilder`

The primary object model for consolidating API scopes.

```typescript
import { createTool } from '@vinkius-core/mcp-fusion';

const tool = createTool<AppContext>('projects');
```

| Method | Returns | Description |
|---|---|---|
| `.description(desc)` | `this` | The highest-level tool description summary sent to the LLM. |
| `.discriminator(field)` | `this` | Overrides the field key the LLM uses to select operations (default: `action`). |
| `.annotations(map)` | `this` | Sets explicit ToolAnnotations (e.g. `{ readOnlyHint: true }`). |
| `.tags(...tags)` | `this` | Embeds categorical tags for `ToolRegistry.getTools({ filter })` exclusions. |
| `.toonDescription()` | `this` | Injects TOON tabular compression instead of standard Markdown spacing. |

#### Structural Composition

| Method | Returns | Description |
|---|---|---|
| `.commonSchema(zod)` | `this` | Appends a base Zod schema applied identically across every tool branch. |
| `.use(middleware)` | `this` | Pushes a Global Middleware function to the very top of the execution graph. |
| `.action(config)` | `this` | Mounts a flat execution route. Incompatible with `.group()`. |
| `.group(name, ...)` | `this` | Mounts a hierarchical sub-route. Incompatible with `.action()`. |

#### Introspection & Execution

| Method | Returns | Description |
|---|---|---|
| `.buildToolDefinition()` | `McpTool` | Triggers framework compilation loop and freezes internal mappings. |
| `.execute(ctx, args)` | `Promise` | Safely evaluates discriminator chains and fires the middleware array. |
| `.getActionNames()` | `string[]` | Dumps native flat keys or dot-notated compound keys. |
| `.getActionMetadata()` | `Object[]` | Pulls deep context mapping arrays about execution boundaries natively. |

---

## ToolRegistry

The unified global router that manages attaching and filtering compiled Builders against the actual bare-metal MCP connection arrays.

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
```

| Method | Returns | Description |
|---|---|---|
| `.register(builder)` | `void` | Mounts a single builder and implicitly fires compilation natively. |
| `.registerAll(...)` | `void` | Maps variable array of builders seamlessly into memory. |
| `.getTools(filter)` | `McpTool[]` | Filters payload dumps based strictly on inclusion/exclusion tags. |
| `.routeCall(...)` | `Promise` | Proxies execution requests deeply down into the assigned `Builder`. |

### `.attachToServer(server, options?)`

Mounts the registry directly to the underlying MCP Server Protocol instances silently via generic duck-typing logic.

```typescript
const detach = registry.attachToServer(server, {
    // Limits the exposure of available Tools strictly to allowed tags:
    filter: { tags: ['public'] },
    
    // Injects highly specific Context variables per MCP execution context:
    contextFactory: (extra) => resolveSessionContext(extra),
});

// Optionally strip handlers gracefully from the server memory on shutdown:
detach();
```

---

## Domain Model Classes

All underlying structural classes use public fields for highly dense, performant direct property access.

### `Group`

Base hierarchical tree node for plotting Tool paths natively.

| Field | Type | Description |
|---|---|---|
| `parent` | `Group \| null` | Upstream target nullated if root block. |
| `childGroups` | `Group[]` | Recursive sub-group tracking arrays. |
| `getFullyQualifiedName()`| `string` | Spits out recursive dot-separated identifiers (e.g. `root.parent.child`). |

### `Tool`

The strictly evaluated LLM parameter payload logic.

| Field | Type | Description |
|---|---|---|
| `inputSchema` | `string` | Fully expanded JSON Schema string definitions natively. |
| `toolAnnotations` | `Annotations` | Bound behavior hint blocks evaluated by language models. |
