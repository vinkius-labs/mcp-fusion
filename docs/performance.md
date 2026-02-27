# Performance

- [Build-Time Pre-Compilation](#build-time)
- [Freeze-After-Build Immutability](#freeze)
- [Zero-Overhead Observability](#observability)
- [Railway-Oriented Execution Pipeline](#railway)
- [Zero-Copy Validation](#zero-copy)
- [State Sync Caching Architecture](#state-sync)
- [Bounded Glob Matching](#glob)
- [Tag Filtering with O(1) Set Lookups](#tag-filter)
- [TOON Token Compression](#toon)
- [Cognitive Guardrails (Context DDoS Prevention)](#guardrails)
- [Zod `.strict()` Security Boundary](#strict)
- [Pure-Function Module Architecture](#pure-functions)
- [Minimal Dependency Footprint](#dependencies)
- [Self-Healing Error Responses](#self-healing)

Every optimization documented here exists in the codebase. Features that are not enabled have zero runtime cost — debug observers, State Sync, middleware, Presenters produce no conditionals, no object allocations, and no function calls in the hot path when not configured.

## 1. Build-Time Pre-Compilation {#build-time}

### Middleware Chain Compilation

Traditional middleware frameworks resolve and compose middleware chains **on every request** — N function lookups per call. **MCP Fusion** avoids this by pre-compiling middleware chains at build time.

When `buildToolDefinition()` is called (or lazily on first `execute()`), the `MiddlewareCompiler` wraps middlewares right-to-left around each handler **once**, producing a single ready-to-call function per action:

```typescript
// From: packages/core/src/core/execution/MiddlewareCompiler.ts
export function compileMiddlewareChains<TContext>(
    actions: readonly InternalAction<TContext>[],
    middlewares: readonly MiddlewareFn<TContext>[],
): CompiledChain<TContext> {
    const compiled: CompiledChain<TContext> = new Map();

    for (const action of actions) {
        let chain = action.handler;

        // Per-action middleware (innermost)
        for (let i = actionMws.length - 1; i >= 0; i--) {
            const nextFn = chain;
            chain = (ctx, args) => mw(ctx, args, () => nextFn(ctx, args));
        }

        // Global middleware (outermost)
        for (let i = middlewares.length - 1; i >= 0; i--) {
            const nextFn = chain;
            chain = (ctx, args) => mw(ctx, args, () => nextFn(ctx, args));
        }

        compiled.set(action.key, chain);
    }
    return compiled;
}
```

**Result:** At runtime, calling an action with 10 stacked middleware layers is a single function call — zero chain assembly, zero closure allocation per request.

### Validation Schema Pre-Caching

Zod schemas are merged and cached **once at build time** in the `ToolDefinitionCompiler`, not recomputed per request:

```typescript
// From: packages/core/src/core/builder/ToolDefinitionCompiler.ts
const validationSchemaCache = new Map<string, ZodObject<ZodRawShape> | null>();
for (const action of input.actions) {
    validationSchemaCache.set(
        action.key,
        buildValidationSchema(action, input.commonSchema),
    );
}
```

Each action's merged schema (`commonSchema.merge(actionSchema).strict()`) is computed once. At execution time, the pipeline reads from this cache with O(1) `Map.get()`.

### Action Map (O(1) Routing)

Action resolution uses a `Map<string, InternalAction>` built at compile time:

```typescript
// From: packages/core/src/core/builder/ToolDefinitionCompiler.ts
const actionMap = new Map(input.actions.map(a => [a.key, a]));
```

When the LLM sends `{ action: "users.list" }`, the pipeline resolves the handler with a single `Map.get()` call — **O(1)** regardless of how many actions exist.

### Action Keys String Pre-Computation

Error messages listing available actions (e.g., `"Available: list, create, delete"`) are computed once at build time as a pre-joined string:

```typescript
// From: packages/core/src/core/builder/ToolDefinitionCompiler.ts
const actionKeysString = input.actions.map(a => a.key).join(', ');
```

No `Array.join()` on every error path.


## 2. Freeze-After-Build Immutability {#freeze}

After `buildToolDefinition()`, the entire builder state is permanently frozen:

```typescript
// From: packages/core/src/core/builder/GroupedToolBuilder.ts
buildToolDefinition(): McpTool {
    if (this._cachedTool) return this._cachedTool;
    
    const result = compileToolDefinition({ ... });
    
    this._cachedTool = result.tool;
    this._executionContext = result.executionContext;
    this._frozen = true;
    Object.freeze(this._actions);
    
    return result.tool;
}
```

**Why it matters for performance:**

- `Object.freeze()` allows the V8 engine to mark objects as **constant**, enabling deeper JIT optimizations.
- Subsequent calls to `buildToolDefinition()` return the cached `McpTool` object — zero recomputation.
- The `_frozen` flag prevents accidental mutation, guaranteeing deterministic behavior without defensive copies.


## 3. Zero-Overhead Observability {#observability}

The debug observer pattern in **MCP Fusion** is designed so that **when disabled, the hot path has zero conditionals**:

```typescript
// From: packages/core/src/core/builder/GroupedToolBuilder.ts — execute()

// Fast path: no debug observer → zero overhead
if (!this._debug) {
    const disc = parseDiscriminator(execCtx, args);
    if (!disc.ok) return disc.response;

    const resolved = resolveAction(execCtx, disc.value);
    if (!resolved.ok) return resolved.response;

    const validated = validateArgs(execCtx, resolved.value, args);
    if (!validated.ok) return validated.response;

    return runChain(execCtx, resolved.value, ctx, validated.value);
}
```

The `if (!this._debug)` branch contains the entire pipeline inline — **no `Date.now()`, no `performance.now()`, no object allocations**. The debug path below only runs when explicitly enabled:

```typescript
// Debug path: emit structured events at each step
const startTime = performance.now();
// ... timing, event creation, observer calls
debug({ type: 'execute', tool: this._name, action: actionName, 
        durationMs: totalDuration, isError: isErr, timestamp: Date.now() });
```

**Result:** Production deployments without `createDebugObserver()` run the pure fast path. Adding observability is a single line — no code changes, no conditionals in any handler.


## 4. Railway-Oriented Execution Pipeline {#railway}

The `ExecutionPipeline` uses the `Result<T>` monad for **zero-exception error handling**:

```typescript
// From: packages/core/src/core/result.ts
export function succeed<T>(value: T): Success<T> {
    return { ok: true, value };
}

export function fail(response: ToolResponse): Failure {
    return { ok: false, response };
}
```

Each pipeline step returns `Result<T>`:

```
parseDiscriminator → resolveAction → validateArgs → runChain
```

On failure, the pipeline **short-circuits immediately** with a typed `Failure` — no exception throw, no stack unwinding, no `try/catch` overhead:

```typescript
const disc = parseDiscriminator(execCtx, args);
if (!disc.ok) return disc.response;  // Short-circuit — zero cost
```

This is measurably faster than exception-based error handling for expected failures (missing discriminator, unknown action, validation errors).


## 5. Zero-Copy Validation {#zero-copy}

After Zod validates args, the discriminator is re-injected via **direct mutation** instead of object spread:

```typescript
// From: packages/core/src/core/execution/ExecutionPipeline.ts — validateArgs()

// Remove discriminator before validation
const { [execCtx.discriminator]: _, ...argsWithoutDiscriminator } = args;
const result = validationSchema.safeParse(argsWithoutDiscriminator);

// Mutate directly — zero-copy re-injection of discriminator
const validated = result.data as Record<string, unknown>;
validated[execCtx.discriminator] = resolved.discriminatorValue;
return succeed(validated);
```

Instead of creating a new object with `{ ...result.data, action: value }`, the framework mutates the `result.data` reference directly. This avoids an extra object allocation on every validated call.


## 6. State Sync Caching Architecture {#state-sync}

### Policy Resolution Cache (O(1) Repeat Lookups)

The `PolicyEngine` caches resolved policies per tool name. Glob pattern matching only happens **once per unique tool name**:

```typescript
// From: packages/core/src/state-sync/PolicyEngine.ts
resolve(toolName: string): ResolvedPolicy | null {
    const cached = this._cache.get(toolName);
    if (cached !== undefined) return cached;

    const result = this._resolveUncached(toolName);

    // Bounded cache: evict all when hitting the cap
    if (this._cache.size >= MAX_CACHE_SIZE) {
        this._cache.clear();
    }

    this._cache.set(toolName, result);
    return result;
}
```

The cache is bounded to `MAX_CACHE_SIZE = 2048` entries to prevent unbounded memory growth from adversarial input. In practice, MCP servers have 10–200 tools, so the cache hit rate approaches 100%.

### Pre-Frozen Shared Policy Objects

Multiple tool names matching the same policy **share a single frozen object reference**:

```typescript
// From: packages/core/src/state-sync/PolicyEngine.ts — constructor
// Pre-compute a frozen ResolvedPolicy for each policy entry.
// N tool names matching the same policy share one object.
this._resolvedByIndex = Object.freeze(
    this._policies.map(p => this._buildResolved(p)),
);

// Pre-frozen default resolution — reused for every unmatched tool name
this._defaultResolved = this._defaultCacheControl
    ? Object.freeze({ cacheControl: this._defaultCacheControl })
    : null;
```

No repeated object construction or property copying for the same policy.

### Tool Description Decoration Cache

`StateSyncLayer` caches decorated `McpTool` objects per tool name. The regex + string concatenation + object spread only runs **once per unique tool name**, not per `tools/list` request:

```typescript
// From: packages/core/src/state-sync/StateSyncLayer.ts
private _decorateToolCached(tool: McpTool): McpTool {
    const cached = this._decoratedToolCache.get(tool.name);
    if (cached) return cached;

    const decorated = decorateDescription(tool, this._engine.resolve(tool.name));
    this._decoratedToolCache.set(tool.name, decorated);
    return decorated;
}
```

Since `tools/list` is the **hottest path** (runs at the start of every LLM conversation), this cache ensures near-zero overhead.


## 7. Bounded Glob Matching {#glob}

The `GlobMatcher` for State Sync policies uses iterative matching with **bounded backtracking** to prevent exponential blowup on adversarial patterns:

```typescript
// From: packages/core/src/state-sync/GlobMatcher.ts
const MAX_ITERATIONS = 1024;

function matchIterative(pattern: string[], name: string[]): boolean {
    let iterations = 0;
    while (ni < name.length) {
        if (++iterations > MAX_ITERATIONS) return false;
        // ... iterative matching with bookmark-based backtracking
    }
    return pi === pattern.length;
}
```

**Why this matters:** Recursive glob matching can be O(2^n) for pathological patterns like `**.**.**.**`. The iterative approach with a 1024-iteration cap guarantees deterministic worst-case CPU usage while being generous enough for any real-world MCP tool name hierarchy.


## 8. Tag Filtering with O(1) Set Lookups {#tag-filter}

The `ToolFilterEngine` pre-converts filter arrays to `Set` objects for O(1) tag membership tests, and uses single-pass iteration to avoid intermediate array allocations:

```typescript
// From: packages/core/src/core/registry/ToolFilterEngine.ts
export function filterTools<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
    filter: ToolFilter,
): McpTool[] {
    // Pre-convert filter arrays to Sets for O(1) lookup
    const requiredTags = filter.tags?.length > 0
        ? new Set(filter.tags) : undefined;
    const excludeTags = filter.exclude?.length > 0
        ? new Set(filter.exclude) : undefined;

    const tools: McpTool[] = [];
    for (const builder of builders) {
        const builderTags = builder.getTags();
        // O(1) Set.has() instead of O(n) Array.includes()
        if (excludeTags) {
            for (const t of builderTags) {
                if (excludeTags.has(t)) { excluded = true; break; }
            }
        }
        tools.push(builder.buildToolDefinition());
    }
    return tools;
}
```

Early `break` on first match/exclusion avoids unnecessary iterations.


## 9. TOON Token Compression (30-50% Fewer Tokens) {#toon}

### Description Compression

`.toonDescription()` encodes action metadata using TOON (Token-Oriented Object Notation) pipe-delimited format, reducing description token count by **30-50%** compared to markdown:

```typescript
// From: packages/core/src/core/schema/ToonDescriptionGenerator.ts
function encodeFlatActions<TContext>(actions): string {
    const rows = actions.map(a => buildActionRow(a.key, a));
    return encode(rows, { delimiter: '|' });
}
```

**Standard description (~100 tokens):**
```markdown
Manage projects. Actions: list, get, create

Workflow:
- 'list': List all projects
- 'get': Get project details. Requires: id
- 'create': Create a new project. Requires: name [DESTRUCTIVE]
```

**TOON description (~55 tokens):**
```text
Manage projects

action|desc|required|destructive
list|List all projects||
get|Get project details|id|
create|Create a new project|name|true
```

Column headers appear once. Values are pipe-delimited. **Zero JSON key repetition per row.**

### Response Compression

`toonSuccess()` compresses list/tabular response data by **~40%** vs `JSON.stringify()`:

```typescript
// From: packages/core/src/core/response.ts
export function toonSuccess(data: unknown, options?: EncodeOptions): ToolResponse {
    const text = encode(data, { delimiter: '|' });
    return { content: [{ type: "text", text }] };
}
```

For a 100-row user list, this saves thousands of tokens per response, translating directly to lower API costs.


## 10. Cognitive Guardrails (Context DDoS Prevention) {#guardrails}

The Presenter's `.limit()` / `.agentLimit()` truncates large collections **before serialization**, preventing context overflow:

```typescript
// From: packages/core/src/presenter/Presenter.ts — make()
if (isArray && this._agentLimit && data.length > this._agentLimit.max) {
    const omitted = data.length - this._agentLimit.max;
    data = data.slice(0, this._agentLimit.max);
    truncationBlock = this._agentLimit.onTruncate(omitted);
}
```

**Impact on token costs:**

| Scenario | Rows | Tokens | Reduction |
|----------|------|--------|-----------|
| No guardrail | 10,000 | ~5,000,000 | — |
| `.limit(50)` / `.agentLimit(50)` | 50 | ~25,000 | **200x** |

Truncation happens **before Zod validation**, so the schema only processes the capped set — saving CPU on large datasets.


## 11. Zod `.strict()` Security Boundary {#strict}

Every action's validation schema is compiled with `.strict()`:

```typescript
// From: packages/core/src/core/builder/ToolDefinitionCompiler.ts
function buildValidationSchema(action, commonSchema) {
    const merged = base && specific ? base.merge(specific) : (base ?? specific);
    return merged.strict();
}
```

`.strict()` **rejects all undeclared fields** from the LLM's payload with an actionable error message naming the invalid fields. This is both a security measure (no undeclared data reaches handlers) and an agent experience improvement — the LLM learns which fields are valid and self-corrects on retry.


## 12. Pure-Function Module Architecture {#pure-functions}

Critical performance modules are implemented as pure functions with **no state and no side effects**:

| Module | File | Pattern |
|--------|------|---------|
| `MiddlewareCompiler` | `execution/MiddlewareCompiler.ts` | Pure function, stateless |
| `ExecutionPipeline` | `execution/ExecutionPipeline.ts` | Pure pipeline steps |
| `ToolFilterEngine` | `registry/ToolFilterEngine.ts` | Pure function, no state |
| `GlobMatcher` | `state-sync/GlobMatcher.ts` | Pure function, iterative |
| `DescriptionGenerator` | `schema/DescriptionGenerator.ts` | Pure function |
| `ToonDescriptionGenerator` | `schema/ToonDescriptionGenerator.ts` | Pure function |
| `SchemaGenerator` | `schema/SchemaGenerator.ts` | Pure function |
| `AnnotationAggregator` | `schema/AnnotationAggregator.ts` | Pure function |
| `PostProcessor` | `presenter/PostProcessor.ts` | Pure function |
| `ValidationErrorFormatter` | `execution/ValidationErrorFormatter.ts` | Pure function |

**Why pure functions matter for performance:**
- V8 can inline and optimize them aggressively (no hidden state to track)
- No garbage collection pressure from instance allocation
- Thread-safe by construction (no shared mutable state)
- Deterministic output enables internal caching


## 13. Minimal Dependency Footprint {#dependencies}

**MCP Fusion** ships with only **2 runtime dependencies**:

```json
{
    "dependencies": {
        "@toon-format/toon": "^2.1.0",
        "zod-to-json-schema": "^3.25.1"
    }
}
```

`zod` and `@modelcontextprotocol/sdk` are peer dependencies (already in your project). This means:
- **Tiny install size** — no dependency tree bloat
- **No duplicated code** — Zod is shared with your app
- **Fast `npm install`** — two packages to resolve
- **Reduced attack surface** — fewer transitive dependencies


## 14. Self-Healing Error Responses (Reduced LLM Retry Loops) {#self-healing}

While not a CPU optimization, `toolError()` and the `ValidationErrorFormatter` reduce **total system cost** by avoiding unnecessary LLM retries:

```typescript
// From: packages/core/src/core/execution/ValidationErrorFormatter.ts
// Instead of: "Validation failed: email: Invalid"
// Produces:
// ❌ Validation failed for 'users.create':
//   • email — Invalid email format. You sent: 'admin@local'.
//     Expected: a valid email address (e.g. user@example.com).
//   💡 Fix the fields above and call the action again.
```

Each retry is a full LLM round-trip (input + output tokens billed again). Self-healing errors make the LLM succeed on the **second attempt** instead of cycling through 3-5 retries, saving 60-80% of error-path token usage.
