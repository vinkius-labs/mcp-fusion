# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.7.0] - 2026-02-25

### 🚀 DX Overhaul — Zero-Friction APIs, Functional Core, Standard Schema

Complete developer experience overhaul: 8 new APIs designed to eliminate boilerplate, enable instant autocomplete, and make the framework feel as effortless as tRPC or Hono.

### Added

- **`initFusion<TContext>()`** — tRPC-style context initialization. Define the context type once, every `f.tool()`, `f.presenter()`, `f.prompt()`, `f.middleware()`, `f.registry()` inherits it automatically. Zero generic repetition.
  - `f.tool({ name, input, handler })` — handler receives `{ input, ctx }` destructured (tRPC v11 pattern). `'domain.action'` naming auto-splits into tool name + action.
  - `f.presenter(config)` — delegates to `definePresenter()` with context typing
  - `f.prompt(name, config)` — context-typed prompt factory
  - `f.middleware(deriveFn)` — context derivation factory
  - `f.defineTool(name, config)` — full `ToolConfig` power with context typing
  - `f.registry()` — pre-typed `ToolRegistry` factory
  - Auto-wraps non-`ToolResponse` handler returns via `success()`

- **`definePresenter(config)`** — Declarative object-config API replacing fluent builder chains. Schema-driven type inference — zero generic noise, instant Ctrl+Space autocomplete.
  - `PresenterConfig<T>` — `{ name, schema, rules, ui, collectionUi, agentLimit, suggestActions, embeds, autoRules }`
  - `autoRules` (default: `true`) — auto-extracts Zod `.describe()` annotations and merges them with explicit rules
  - `extractZodDescriptions(schema)` — walks Zod AST, unwraps optional/nullable/default/branded wrappers, returns `"field: description"` strings
  - Produces standard `Presenter<T>` — interchangeable with `createPresenter()` anywhere

- **`autoDiscover(registry, dir, options?)`** — File-based routing. Scans a directory tree and auto-registers tool builders.
  - Resolution: `default` export → named `tool` export → any exported ToolBuilder
  - Options: `pattern` (regex filter), `recursive` (default: `true`), `loader` (`'esm'` | `'cjs'`), custom `resolve` function
  - Excludes `.test.`, `.spec.`, and `.d.ts` files automatically

- **`createDevServer(config)`** — HMR development server. File changes reload tools without restarting the LLM client.
  - `DevServerConfig` — `{ dir, extensions, debounce, setup, onReload, server }`
  - Sends `notifications/tools/list_changed` to MCP client on reload
  - ESM cache-busting via URL timestamp query parameter
  - CJS cache invalidation via `require.cache` cleanup
  - 300ms default debounce to prevent rapid-fire reloads

- **`createGroup(config)`** — Functional closure-based tool groups. Pre-composed middleware at creation time (O(1) dispatch), `Object.freeze()` by default.
  - `GroupConfig<TContext>` — `{ name, description, tags, middleware, actions }`
  - `CompiledGroup<TContext>` — `.execute(ctx, action, args)`, `.getAction(name)`, `.actionNames`
  - Middleware: right-to-left composition via `reduceRight`, per-action + global merge
  - Zod `.strict().parse()` validation per action

- **Standard Schema v1 Abstraction Layer** — Decouple from Zod, support any validator implementing the Standard Schema spec.
  - `StandardSchemaV1<TInput, TOutput>` interface
  - `FusionValidator<T>` — `.validate(value)`, `.vendor`, `.schema`
  - `toStandardValidator(schema)` — wrap Standard Schema v1 (Valibot, ArkType, etc.)
  - `fromZodSchema(schema)` — wrap Zod via `.safeParse()`
  - `autoValidator(schema)` — auto-detect schema type (Standard Schema → Zod → error)
  - `isStandardSchema(value)` — duck-type guard
  - `ValidationResult<T>`, `InferStandardOutput<T>`, `StandardSchemaIssue` types

- **Subpath Exports** — 10 tree-shakeable entry points:
  - `@vinkius-core/mcp-fusion` (full), `/client`, `/ui`, `/presenter`, `/prompt`, `/state-sync`, `/observability`, `/dev`, `/schema`, `/testing`

### Documentation

- **Presenter elevated to hero position** — README Quick Start now shows: `initFusion()` → `definePresenter()` → `f.tool({ returns: Presenter })` → `f.prompt({ fromView })` → Server bootstrap. The Presenter is THE first feature section with both APIs (`definePresenter()` + `createPresenter()`) and a full capabilities table (Egress Firewall, JIT Rules, Server-Rendered UI, Cognitive Guardrails, Action Affordances, Relational Composition, Prompt Bridge).
- **No-Zod JSON Descriptors shown everywhere** — All Quick Start examples, tool examples, and prompt examples use JSON param descriptors (`'string'`, `{ type: 'number', min: 0 }`, `{ enum: [...] as const }`) as the recommended API. Zod shown as the alternative tab.
- **Prompt Engine given equal DX treatment** — `f.prompt()` shown alongside `f.tool()` in every Quick Start. `PromptMessage.fromView()` bridge to Presenter shown prominently.
- **Comprehensive documentation rewrite** — 20+ doc files updated with `f.tool()` / `f.prompt()` tabs, No-Zod examples, Presenter integration. New `docs/dx-guide.md` covers all 8 new features.
- **README.md full rewrite** — New Quick Start (5 steps: init → Presenter → tools → prompts → server), Presenter hero section, expanded capabilities table, JSON Param Descriptor reference, Zod marked as optional.
- **llms.txt rewrite** — Presenter-first Quick Start, expanded Presenter API section with definePresenter + createPresenter + layers table, Prompt Engine with No-Zod examples and fromView bridge.
- New `docs/dx-guide.md` — comprehensive DX guide covering all 8 new features with migration table
- Updated `llms.txt` — new public API entries (Context Initialization, Declarative Presenter, Functional Groups, File-Based Routing, Dev Server, Standard Schema, Subpath Exports)

### Test Suite

- **67 new tests** across 7 test files:
  - `DefinePresenter.test.ts` (8 tests) — object config, auto-rules, Zod `.describe()` extraction, `collectionUi`, error cases
  - `ZodDescriptionExtractor.test.ts` (12 tests) — field extraction, optional/nullable/default unwrapping, nested objects, enums, edge cases
  - `InitFusion.test.ts` (11 tests) — `f.tool()` handler, `f.presenter()`, `f.prompt()`, `f.middleware()`, `f.registry()`, auto-wrap
  - `CreateGroup.test.ts` (10 tests) — dispatch, validation, middleware composition, frozen output, unknown action error
  - `StandardSchema.test.ts` (11 tests) — `toStandardValidator`, `fromZodSchema`, `autoValidator`, `isStandardSchema`, error mapping
  - `AutoDiscover.test.ts` (7 tests) — export types, type guard functions
  - `DevServer.test.ts` (7 tests) — config validation, module cache invalidation, cache-bust URL
- All **2159 tests** passing across 101 test files — zero regressions

## [2.6.0] - 2026-02-25

### 🛡️ Self-Healing HATEOAS · State Sync Observability · Client Middleware

Three-pillar enhancement across the framework: richer self-healing error envelopes, State Sync observability hooks, and a full-featured tRPC-style client.

### Added

- **Self-Healing Errors (Pillar A):**
  - `ErrorCode` union type — 15 canonical codes (`NOT_FOUND`, `RATE_LIMITED`, `CONFLICT`, `INTERNAL_ERROR`, etc.) plus any custom string via `string & {}`
  - `ErrorSeverity` type — `'warning' | 'error' | 'critical'` with semantic `isError` mapping (warnings are non-fatal)
  - `severity` attribute on `<tool_error>` XML envelope — agents can triage errors by impact level
  - `details` option — key-value metadata rendered as `<detail key="...">value</detail>` elements (safe for any key string)
  - `retryAfter` option — `<retry_after>N seconds</retry_after>` for transient errors
  - `error(message, code?)` — optional `code` parameter for structured minimal errors
  - Individual `<action>` child elements in `<available_actions>` (replaces comma-separated format)
  - Structured error boundary in `ExecutionPipeline.runChain()` — catch block now produces `toolError('INTERNAL_ERROR', ...)` with severity and recovery hint

- **State Sync Observability (Pillar B):**
  - `onInvalidation` callback — fires after successful causal invalidation with `{ causedBy, patterns, timestamp }`
  - `notificationSink` — emits MCP `notifications/resources/updated` per invalidated pattern (fire-and-forget, async-safe)
  - `detectOverlaps(policies)` — static analysis utility returning `OverlapWarning[]` for first-match-wins ordering bugs
  - `InvalidationEvent`, `ResourceNotification`, `OverlapWarning` types exported from barrel

- **FusionClient (Pillar C):**
  - `ClientMiddleware` type — `(action, args, next) → Promise<ToolResponse>` request interceptor
  - `FusionClientOptions` interface — `{ middleware?, throwOnError? }`
  - `FusionClientError` class — parses `<tool_error>` XML into typed fields (code, message, recovery, availableActions, severity, raw)
  - `executeBatch(calls, options?)` — parallel (default) or sequential batch execution
  - `throwOnError` option — error responses auto-throw as `FusionClientError` instead of returning
  - Middleware chain compiled once at client creation (O(1) per call)
  - XML entity unescaping in parsed error fields (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`)

### Fixed

- **[CRITICAL] XML injection via detail keys** — details keys were used as XML element names (`<key>value</key>`), allowing invalid XML for keys like `"123"` or `"a b"`. Now rendered as attributes: `<detail key="...">value</detail>`
- **Severity attribute not XML-escaped** — `severity` value in `<tool_error>` was unescaped; now uses `escapeXmlAttr()`
- **Async notificationSink unhandled rejection** — `try { void sink(n); } catch {}` didn't catch async rejections; now uses `Promise.resolve(...).catch()`
- **ResponseDecorator XML injection** — `cause` and `domains` attributes in `<cache_invalidation>` were not XML-escaped; now uses `escapeXmlAttr()`
- **parseToolErrorXml missing XML entity unescaping** — parsed error messages containing `&amp;`, `&lt;`, etc. were returned with raw entities; added `unescapeXml()` decoder
- **Misleading JSDoc** — StateSyncLayer cache key comment incorrectly referenced "JSON input schema hash"; corrected to reflect tool-name-only caching

### Documentation

- Updated `docs/error-handling.md` with ErrorCode table, severity levels, structured details, retryAfter, full HATEOAS envelope example
- Updated `docs/fusion-client.md` with client middleware, `throwOnError`, `FusionClientError`, `executeBatch()`, batch options
- Updated `docs/state-sync.md` with `onInvalidation`, `notificationSink`, `detectOverlaps()`, observability hooks section
- Updated `README.md` — Self-Healing Errors, Type-Safe Client, and State Sync feature sections + capabilities table
- Updated `llms.txt` — Public API section, Self-Healing Errors section, State Sync section, Response Helpers

### Test Suite

- **52 new tests** across 3 files:
  - `SelfHealing.test.ts` (15 tests) — severity, details, retryAfter, ErrorCode, XML-unsafe keys, empty details, error() with code
  - `StateSyncEnhanced.test.ts` (16 tests) — onInvalidation, notificationSink, async rejection safety, ResponseDecorator escaping, detectOverlaps
  - `FusionClientEnhanced.test.ts` (21 tests) — middleware pipeline, throwOnError, XML entity unescaping, executeBatch, empty batch, middleware exceptions, backward compat
- All **2092 tests** passing across 94 files

## [2.4.0] - 2026-02-24

### 🧪 Testing — Deterministic AI Governance Auditing

New `@vinkius-core/mcp-fusion-testing` package. The first and only framework capable of mathematically auditing AI Data Governance (SOC2) in a CI/CD pipeline — zero tokens, zero servers, deterministic.

### Added

- **`packages/testing/`:** New `@vinkius-core/mcp-fusion-testing` package:
  - `FusionTester` — In-memory MVA lifecycle emulator, runs the real pipeline (Zod → Middleware → Handler → Presenter → Egress Firewall) entirely in RAM
  - `createFusionTester(registry, options)` — Factory function for ergonomic test setup
  - `MvaTestResult` — Structured response decomposition with `data`, `systemRules`, `uiBlocks`, `isError`, `rawResponse` fields
  - `callAction(toolName, actionName, args?, overrideContext?)` — Execute any tool action with optional per-test context overrides
  - Symbol Backdoor (`MVA_META_SYMBOL`) — Extracts structured MVA layers from ToolResponse without XML parsing; invisible to `JSON.stringify`
  - Async `contextFactory` support for JWT/database resolution
  - Context isolation — overrides are shallow-merged per call, never mutated
  - 42 integration tests covering: Egress Firewall, System Rules, UI Blocks, Middleware Guards, OOM Guard, Error Handling, Raw Response, Agent Limit, Concurrent Calls, Sequential Reuse
  - Runner-agnostic — works with Vitest, Jest, Mocha, or Node's native `node:test`

### Documentation

- **15 testing documentation pages:** Deterministic AI Governance (landing), Quick Start, Command-Line Runner, Fixtures, Assertions, Test Doubles, Egress Firewall, System Rules, UI Blocks, Middleware Guards, OOM Guard, Error Handling, Raw Response, CI/CD Integration (with SOC2 automated audit examples), Convention
- **15 SEO entries** with FAQPage JSON-LD for all testing pages
- Updated `llms.txt` with FusionTester API, types, and usage examples
- Updated `README.md` with Testing section, capabilities table entry, and package reference

## [2.3.0] - 2026-02-23

### 🗄️ Prisma Generator — Schema Annotations to Hardened MCP Tools

New `mcp-fusion-prisma-gen` package. Reads `schema.prisma` annotations (`@fusion.hide`, `@fusion.describe`, `@fusion.tenantKey`) and emits typed Presenters and ToolBuilders during `npx prisma generate`.

### Added

- **`packages/prisma-gen/`:** New `mcp-fusion-prisma-gen` generator package:
  - `AnnotationParser` — Extracts `@fusion.hide`, `@fusion.describe("...")`, `@fusion.tenantKey` from Prisma DMMF `documentation` field
  - `PresenterEmitter` — Generates Zod `.strict()` response schemas with hidden fields physically excluded (Egress Firewall)
  - `ToolEmitter` — Generates 5 CRUD actions (`find_many`, `find_unique`, `create`, `update`, `delete`) with:
    - Asymmetric schemas (ResponseSchema ≠ CreateSchema ≠ UpdateSchema)
    - `PrismaFusionContext` type injection (shift-left security)
    - Tenant isolation in every query `WHERE` clause via `@fusion.tenantKey`
    - OOM pagination guard (`take` max 50, min 1, default 20)
    - MCP annotations (`readOnly`, `destructive`)
  - `NamingHelpers` — `toSnakeCase`, `toPascalCase`, `pluralize`
  - `generator.ts` — Prisma `generatorHandler()` entry point with barrel index generation
  - Shared `types.ts` for `GeneratedFile` interface (single source of truth)
- **Code quality fixes:** Removed duplicate `GeneratedFile` declarations, dead imports, dead variables, and fixed barrel `PrismaFusionContext` duplicate export across multi-model schemas

### Documentation

- **`docs/prisma-gen.md`:** Full VitePress documentation page — 3 Engineering Primitives, schema annotations, configuration reference, production example
- **`packages/prisma-gen/README.md`:** Package README with primitive breakdown and usage examples
- **`README.md`:** Added `mcp-fusion-prisma-gen` to Packages table and Documentation guides
- **`.vitepress/config.mts`:** Prisma Generator sidebar entry (already configured)

### Test Suite

- **100 new tests** across 3 files:
  - `AnnotationParser.test.ts` (23 tests) — multi-line DMMF, special characters, multiple annotations
  - `PresenterEmitter.test.ts` (29 tests) — egress firewall, relation filtering, scalar type mapping, `.describe()` injection
  - `ToolEmitter.test.ts` (48 tests) — tenant isolation, schema asymmetry, OOM guards, MCP annotations, integer ID models

## [2.2.0] - 2026-02-23

### 🔌 n8n Connector — Turn Workflows into MCP Tools

New `mcp-fusion-n8n` package. Auto-discovers n8n webhook workflows and produces MCP Fusion tool builders — so AI agents can call your automations natively.

### Added

- **`packages/n8n/`:** New `mcp-fusion-n8n` connector package:
  - `createN8nConnector()` — Auto-discovery mode: connects to n8n, finds webhook workflows, produces `SynthesizedTool[]`
  - `defineN8nTool()` — Manual/enterprise mode: surgically define a specific workflow as an MCP tool
  - `N8nClient` — HTTP client for n8n REST API with auth and timeout
  - `WorkflowDiscovery` — Filters webhook-triggered workflows, tag include/exclude
  - `SchemaInferrer` — Query params → strict Zod, body → `z.record(z.any())`, notes → `.describe()`
  - `ToolSynthesizer` — Workflow metadata → `defineTool()`-compatible configs
- **Hack Semântico:** Workflow "Notes" field becomes tool description — LLMs build correct payloads in zero-shot
- **CI publish step** for n8n package

### Documentation

- **`docs/n8n-connector.md`:** Full VitePress documentation page — 5 Engineering Primitives with impact sections
- **`packages/n8n/README.md`:** Package README with primitive breakdown and usage examples
- **`README.md`:** New "From Spaghetti Code to MCP Fusion" power statement — pain-first structure with full capability coverage
- **`README.md`:** Added `mcp-fusion-n8n` to Packages table and Documentation guides
- **`.vitepress/config.mts`:** Added n8n Connector sidebar entry

### Test Suite

- **34 new tests** covering `toToolName`, `SchemaInferrer`, `WorkflowDiscovery`, `ToolSynthesizer`, `defineN8nTool`

## [2.1.0] - 2026-02-23

### 🧬 OpenAPI Generator — Spec to MCP Server in One Command

New `mcp-fusion-openapi-gen` package that generates a complete **MCP Fusion** server from any OpenAPI 3.x specification. One command produces Zod schemas, Presenters, tool definitions, ToolRegistry, and server bootstrap — all following the MVA Convention.

### Added

- **`packages/openapi/`:** New `mcp-fusion-openapi-gen` package with full pipeline:
  - `OpenApiParser` — resolves `$ref`, extracts groups/actions/params/responses
  - `EndpointMapper` — `operationId` → `snake_case`, dedup, HTTP method → MCP annotations
  - `ZodCompiler` — `SchemaNode` → Zod code with coercion, formats, constraints
  - `CodeEmitter` — generates MVA structure (`models/`, `views/`, `agents/`, Registry, Server)
  - `ConfigLoader` — YAML config auto-detection with CLI flag overrides
  - `GeneratorConfig` — full config system with `mergeConfig()` and `DEFAULT_CONFIG`
- **`toolExposition` config** (`'flat'` | `'grouped'`): Controls how generated tools are exposed to the LLM via `attachToServer()`.
- **`actionSeparator` config** (string, default `'_'`): Controls flat mode delimiter in generated server bootstrap.
- **MVA Convention — `agents/` directory:** Renamed `tools/` → `agents/` to align directory names with MVA architectural layers (Model, View, Agent). Updated across all source, tests, and documentation.

### Documentation

- **`docs/openapi-gen.md`:** Full generator documentation — quick start, configuration reference, generated code walkthrough, exposition strategy, name resolution, programmatic API, and pipeline architecture.
- **`docs/mva-convention.md`:** MVA Convention reference — structure, dependency flow, file naming, header annotations, and separation of concerns.
- **VitePress sidebar:** Added OpenAPI Generator and MVA Convention pages.

### Test Suite

- **11 new tests** for `toolExposition` and `actionSeparator`:
  - `GeneratorConfig.test.ts` — 7 tests: default values, merge overrides for both configs
  - `CodeEmitter.test.ts` — 5 tests: emitter output for flat/grouped/custom separator
- **1,768 tests** across 82 files, all passing.

## [2.0.0] - 2026-02-23

### 🏗️ Monorepo Refactor — Multi-Package Architecture

**MCP Fusion** is now a monorepo with npm workspaces. The core framework lives in `packages/core/` and a new `packages/testing/` workspace provides testing utilities. This aligns with industry standards (tRPC, Vitest, Prisma) for package management and distribution.

### BREAKING

- **Project structure:** `src/` → `packages/core/src/`, `tests/` → `packages/core/tests/`. The npm package name and public API remain **unchanged** — `@vinkius-core/mcp-fusion` still exports the same modules.
- **Root `package.json`:** Now `private: true` with `"workspaces": ["packages/*"]`. The root is no longer the publishable package.
- **`tsconfig.json` → `tsconfig.base.json`:** Shared TypeScript configuration is now at the root level. Each package extends it via `"extends": "../../tsconfig.base.json"`.

### Added

- **`packages/core/`:** Contains the full framework source (`src/`), tests (`tests/`), and its own `package.json` with `@vinkius-core/mcp-fusion` as the publishable name.
- **`packages/testing/`:** New `@vinkius-core/mcp-fusion-testing` package (skeleton). Will contain mock servers, test clients, and assertion helpers.
- **Per-package CI:** `ci.yml` updated to `npm run build -ws` and `npm test -w packages/core`.
- **Per-package publish:** `publish-npm.yml` now publishes each workspace package independently.

### Fixed

- **`CursorCodec` Web Crypto API resolution:** Replaced `Function('m', 'return import(m)')` hack with variable-based indirection (`const mod = 'node:' + 'crypto'`) that works correctly in Vitest's module transformer while still avoiding TypeScript's static module resolution (no `@types/node` dependency).

### Documentation

- **`CONTRIBUTING.md`:** Project Structure updated to reflect the monorepo layout.
- **`docs/testing.md`:** Updated FullStack.test.ts link to new path.
- **`docs/performance.md`:** Updated 18 internal source references.
- **`docs/cost-and-hallucination.md`:** Updated 14 internal source references.

### Test Suite

- **1,573 tests** across 70 files, all passing.

## [1.11.0] - 2026-02-23

### 📄 Stateless Cursor Pagination for Prompts

**MCP Fusion** now provides O(1) memory, cryptographic cursor-based pagination for `prompts/list`. Instead of loading thousands of prompts into memory or sending large payloads to MCP clients, the framework emits pages using an RFC-compliant cursor algorithm powered by the native Web Crypto API.

### Added

- **`PromptRegistry.configurePagination({ pageSize })`:** Enables stateless pagination. By default, pagination is disabled (all prompts returned).
- **`CursorCodec` module:** Implements a robust encoded cursor utilizing native `globalThis.crypto.subtle`. Zero external crypto dependencies.
- **Server integration:** Automatically extracts the `cursor` param from the `prompts/list` MCP request, decodes it, applies filters, and generates the `nextCursor` transparently.
- **Tamper resistance:** Adulterated cursors fallback gracefully to the first page without crashing the server.
- **Progress Notifications Integration:** Full E2E testing of `ProgressSink` mapping to `notifications/progress`. Generator handlers firing `yield progress()` map seamlessly without overhead.
- **Cooperative Cancellation Integration:** Full E2E testing of `AbortSignal` interception causing runaway generators and chains to abort instantly.

## [1.10.0] - 2026-02-23

### Hydration Timeout Sandbox — Graceful Degradation for Prompt Hydration

**MCP Fusion** now protects prompt handlers from slow/failing external data sources via the **Hydration Timeout Sandbox**. When a handler fetches data from Jira, Stripe, databases, or any external source and the call hangs, the framework enforces a strict deadline, unblocks the UI immediately, and returns a structured SYSTEM ALERT.

### Added

- **`HydrationSandbox` module** (`src/prompt/HydrationSandbox.ts`): Core timeout mechanism using `Promise.race`. Wraps handler execution with a strict deadline and catches both timeouts and handler errors, converting them to graceful `<hydration_alert>` XML-structured messages.
- **`hydrationTimeout` config** on `definePrompt()`: Per-prompt deadline in milliseconds. Example: `definePrompt('briefing', { hydrationTimeout: 3000, handler: ... })`.
- **`setDefaultHydrationTimeout(ms)`** on `PromptRegistry`: Global safety net for ALL prompts. Individual prompt timeouts override the registry default.
- **Three-scenario coverage**: Handler completes → normal result. Handler exceeds deadline → TIMEOUT alert. Handler throws → ERROR alert. The UI ALWAYS unblocks.
- **Timer cleanup**: `clearTimeout` via `finally` block — no resource leaks, no dangling timers keeping Node.js alive.
- **Zero overhead**: When no timeout is configured, no timer is created, no `Promise.race` wrapping — the handler runs directly.
- **Interceptor composition**: Prompt Interceptors still execute after a timeout, ensuring compliance headers and tenant context are always injected.
- **`getHydrationTimeout()`** on `PromptBuilder` interface: Read the configured timeout for introspection and testing.
- **17 new tests**: Unit tests covering timeout, early completion, error-as-degradation, timer cleanup, non-Error throws, plus integration tests for per-prompt config, registry defaults, override precedence, backward compatibility, and interceptor composition after timeout.

### Design Influences

- Go's `context.WithDeadline` (structured cancellation)
- gRPC deadline propagation (strict, per-RPC)
- Resilience4j TimeLimiter (JVM circuit breaker pattern)

## [1.9.0] - 2026-02-23

### Intent Mutex (Anti-Race Condition)

**MCP Fusion** now provides automatic transactional isolation for AI agents via the **Intent Mutex**. When an LLM hallucinates and fires identical destructive calls in the exact same millisecond (e.g., double-deleting a user), the framework serializes them to guarantee isolation.

### Added

- **`MutationSerializer` class:** Implements an idiomatic JS async mutex using per-key promise-chaining. Strict FIFO queue order without external locks, Redis, or OS primitives.
- **Zero-Configuration Setup:** Automatically enabled strictly for actions marked with `destructive: true`. Fast-path bypass for all other actions (zero overhead).
- **Per-Action Serialization:** `billing.refund` and `billing.delete` run independently, but concurrent `billing.refund` requests are strictly serialized.
- **Cooperative Cancellation:** Waiters queued in the mutex instantly abort if the request `AbortSignal` fires before they acquire the lock.
- **Automatic Garbage Collection:** Completed promise chains are aggressively pruned to prevent memory leaks.
- **Builder Integration:** Handled inside `_executePipeline` seamlessly; `GroupedToolBuilder` manages the mutex internally.
- **14 New Tests:** Unit tests covering chain GC, error recovery, signal abortion, parallel execution, and builder integration with other guards.

## [1.8.0] - 2026-02-23

### Runtime Guards — Concurrency Limiter & Egress Guard

**MCP Fusion** now provides two built-in runtime guards that fulfill the MCP specification requirement: *"Servers MUST rate limit tool invocations."* Both guards have **zero overhead** when not configured — no objects created, no branches in the hot path.

### Added

- **Concurrency Guard (Semaphore + Queue):** Per-tool semaphore with configurable `maxActive` concurrent executions and `maxQueue` backpressure queue. Load shedding rejects excess calls with `toolError('SERVER_BUSY')` — a structured error that guides the LLM to reduce its cadence.
  - `ConcurrencyGuard` class in `src/core/execution/ConcurrencyGuard.ts`
  - `.concurrency({ maxActive, maxQueue })` fluent method on `GroupedToolBuilder`
  - `ConcurrencyConfig` type exported from root barrel
  - AbortSignal integration: queued waiters are cancelled cooperatively
  - Slot release guarantee via `try/finally` — no leaks on handler crash
- **Egress Guard (Payload Limiter):** Per-tool maximum response size in bytes. Truncates oversized payloads at UTF-8 character boundaries and injects a system intervention message forcing the LLM to use pagination.
  - `applyEgressGuard()` function in `src/core/execution/EgressGuard.ts`
  - `.maxPayloadBytes(bytes)` fluent method on `GroupedToolBuilder`
  - `EgressConfig` type exported from root barrel
  - UTF-8 safe truncation via `TextEncoder`/`TextDecoder`
  - Minimum enforced at 1024 bytes to prevent unusable responses
- **`_executeWithObservability()` internal method:** Extracted from `execute()` to keep the concurrency/egress guard integration clean. No behavioral change — same tracing/debug/fast paths.

### Documentation

- **New "Runtime Guards" page (`docs/runtime-guards.md`):** Problem statement, architecture diagram, Quick Start for both guards, combined usage, testing patterns, MCP spec compliance section, configuration reference, and compatibility matrix.
- **VitePress sidebar:** Added Runtime Guards under Production section.
- **SEO:** 7 new FAQs for the Runtime Guards page with FAQPage + TechArticle JSON-LD structured data.
- **llms.txt:** Updated with Runtime Guards section and public API entries.

### Test Suite

- **24 new tests** in `RuntimeGuards.test.ts`:
  - ConcurrencyGuard: Semaphore Basics (3 tests)
  - ConcurrencyGuard: Backpressure Queue (3 tests)
  - ConcurrencyGuard: AbortSignal Integration (2 tests)
  - EgressGuard: Payload Truncation (5 tests)
  - Builder Integration: .concurrency() (5 tests)
  - Builder Integration: .maxPayloadBytes() (3 tests)
  - Runtime Guards: Combined (2 tests + abort scenario)
- **Test count:** 1,525 tests across 70 files, all passing.

## [1.7.0] - 2026-02-23

### 🚫 Cancellation Propagation — Cooperative AbortSignal for MCP Tools

**MCP Fusion** now intercepts the `AbortSignal` from the MCP SDK and propagates it through the **entire execution pipeline** — middleware, handlers, and generators. When a user clicks "Stop" or the transport drops, all in-flight operations terminate immediately. Zero zombie processes. Zero resource leaks.

### Added

- **`extractSignal(extra)` in `ServerAttachment`:** Safely extracts `AbortSignal` from the MCP SDK's `RequestHandlerExtra` object. Returns `undefined` when not present (zero overhead).
- **`McpRequestExtra.signal`:** Extended interface to include `signal?: AbortSignal` from the SDK protocol layer.
- **`runChain()` cancellation gate:** Checks `signal.aborted` before invoking the pre-compiled middleware chain. Pre-cancelled requests return `error('Request cancelled.')` without executing any handler code.
- **`drainGenerator()` cancellation check:** Checks `signal.aborted` before each `yield` iteration. Aborted generators trigger `gen.return()` for `finally{}` cleanup, preventing zombie generators from continuing.
- **Signal propagation through the full pipeline:**
  - `RegistryDelegate.routeCall(ctx, name, args, sink, signal)`
  - `ToolBuilder.execute(ctx, args, sink, signal)`
  - `ToolRegistry.routeCall(ctx, name, args, sink, signal)`
  - `GroupedToolBuilder.execute(ctx, args, sink, signal)`
  - `_executePipeline(execCtx, ctx, args, sink, hooks, signal)`
  - `runChain(execCtx, resolved, ctx, args, sink, rethrow, signal)`
  - `drainGenerator(gen, sink, signal)`
- **`contextFactory` passthrough:** Developers can extract `extra.signal` in `contextFactory` and expose it as `ctx.signal` for use in `fetch()`, Prisma, and other I/O operations.
- **Loopback dispatcher propagation:** Prompts calling tools via `dispatchToolCall()` forward the signal to `registry.routeCall()`.
- **Flat exposition support:** Signal propagated in both grouped and flat exposition modes.

### Documentation

- **New "Cancellation" page (`docs/cancellation.md`):** Architecture diagram, Quick Start guide, generator cancellation, testing patterns, best practices (pass `ctx.signal` to I/O), and compatibility matrix.
- **VitePress sidebar:** Added Cancellation under Production section.
- **SEO:** 7 new FAQs for the Cancellation page with FAQPage + TechArticle JSON-LD structured data.

### Test Suite

- **9 new tests** in `CancellationPropagation.test.ts`:
  - Signal via contextFactory (1 test)
  - Pre-execution abort — handler never called (1 test)
  - Zero overhead — no signal present (1 test)
  - Generator abort — mid-iteration cancellation (1 test)
  - Generator abort — pre-aborted signal (1 test)
  - Flat exposition mode — signal propagated (1 test)
  - Direct builder execute — 4th parameter (2 tests)
  - Middleware chain — signal during middleware (1 test)
- **Test count:** 1,501 tests across 69 files, all passing.

## [1.6.2] - 2026-02-23

### 🧪 End-to-End Integration Test Suite

Comprehensive integration test suite (`tests/integration/FullStack.test.ts`) covering **all modules working together** through the MCP Server mock — happy paths AND sad paths. Ensures the framework resolves developer mistakes gracefully without crashing.

### Added

- **37 integration tests** in `FullStack.test.ts` organized across 22 `describe` blocks:

  **Happy paths (15 tests):**
  - Builder → Registry → Server → ContextFactory
  - Builder → Presenter → Server (auto-view composition)
  - Builder → Middleware → Debug Observability (cross-layer events)
  - Builder → Middleware → Tracing (OTel span lifecycle)
  - Builder → StateSync → Server (cache-control + invalidation)
  - PromptRegistry → Server (prompts/list + prompts/get)
  - Builder → Flat Exposition → Server (atomic tool projection)
  - Flat Exposition → Debug + Tracing (2 tests)
  - Full Stack — ALL modules in a single server attachment
  - Concurrent multi-tool calls (20 parallel + traced, 2 tests)
  - Presenter → Tracing → Server
  - Detach → Re-attach lifecycle
  - defineMiddleware → defineTool → Server

  **Sad paths (22 tests):**
  - **Routing Failures (4):** Unknown tool (`UNKNOWN_TOOL` + suggestions), unknown action, missing/null/empty discriminator, unknown flat tool name
  - **Validation Failures (3):** Wrong types, constraint violations (min/max/email), strict mode extra field rejection, flat mode validation
  - **Handler Exceptions (3):** Handler `throw` → `isError=true` (grouped + flat), soft fail vs hard fail tracing distinction (`UNSET` vs `ERROR` + `recordException`)
  - **Middleware Failures (3):** Middleware block + debug error event, middleware exception traced as system error, multi-middleware chain ordering (first blocker wins)
  - **Concurrent Mixed Results (1):** 5 simultaneous calls — 2 success + 1 validation error + 1 throw + 1 unknown action — isolated
  - **Debug + Tracing Error Correlation (2):** Debug error for unknown tool, traced validation error when both debug+tracing coexist
  - **defineTool Param Descriptor Errors (2):** Constraint violations via descriptors, shared param missing/empty
  - **StateSync Config Errors (2):** Invalid `cacheControl` directives rejected at attach time
  - **Detach Error Handling (2):** Post-detach calls return error, tools/list returns empty, double detach is idempotent

- **Mock strategy:** Only the MCP Server is mocked — no internal framework mocking. Tests exercise the full pipeline (routing → validation → middleware → handler → observability → response).

### Test Suite

- **1,492 tests** across 68 files, all passing.

## [1.6.1] - 2026-02-23

### 🛡️ XML Security & Error Protocol Hardening

Comprehensive security audit of the XML error protocol. Prevents XML injection, hardens type safety, and upgrades the registry-level error to the structured `toolError()` protocol.

### Security

- **XML injection prevention:** Introduced `escapeXml()` (element content — escapes `&` and `<`) and `escapeXmlAttr()` (attribute values — escapes all 5 XML special characters). Applied across `response.ts`, `ExecutionPipeline.ts`, `ValidationErrorFormatter.ts`, and `PromptExecutionPipeline.ts`.
- **Dual escaping strategy:** Element content preserves `>` for LLM readability (`>= 1`, `Must be > 0`). Attribute values use strict escaping.

### Fixed

- **Type safety in `parseDiscriminator`:** Replaced unsafe `as string` cast with runtime `typeof` check. Non-string discriminator values (numbers, booleans, objects) now return `MISSING_DISCRIMINATOR` instead of causing `TypeError: str.replace is not a function`.
- **Structured `UNKNOWN_TOOL` error:** `ToolRegistry.routeCall()` now returns `toolError('UNKNOWN_TOOL', ...)` with structured XML (code, message, available tools, recovery hint) instead of a freeform `error()` string. Consistent with pipeline-level errors (`MISSING_DISCRIMINATOR`, `UNKNOWN_ACTION`).

### Documentation

- **error-handling.md:** Added `UNKNOWN_TOOL` to the Unified XML Protocol table. Added XML Security tip callout.
- **llms.txt:** Added XML security note with pipeline error codes. Added `unknown_tool` to tracing error classification.

### DX

- **English error messages:** Translated remaining Portuguese error message in `defineTool.ts` to English.

### Test Suite

- **1,389 tests** across 417 suites, all passing.

## [1.6.0] - 2026-02-23

### 🔗 MVA-Driven Prompts — `PromptMessage.fromView()`

Bridge the Presenter layer into the Prompt Engine with zero duplication. `PromptMessage.fromView()` decomposes a `ResponseBuilder` into XML-tagged prompt messages (`<domain_rules>`, `<dataset>`, `<visual_context>`, `<system_guidance>`) — same source of truth as the Tool response.

### Added

- **`PromptMessage.fromView(builder)`:** Static method that decomposes a `ResponseBuilder` into `PromptMessagePayload[]`. Extracts rules, validated data, UI blocks, hints, and action suggestions into semantically separated XML-tagged blocks optimized for frontier LLMs.
- **`ResponseBuilder` introspection getters:** `getData()`, `getRules()`, `getUiBlocks()`, `getHints()`, `getSuggestions()` — read-only access to internal layers without calling `.build()`.

### Documentation

- **`prompts.md`:** New H2 section "MVA-Driven Prompts — `fromView()`" with Before/After comparison, decomposition architecture diagram, XML tag table, composability example.
- **`presenter.md`:** New section "Using Presenters in Prompts" with cross-reference to Prompt Engine docs. Added Prompt Engine link to Next Steps.
- **`api-reference.md`:** New Prompt Engine section with `definePrompt`, `PromptMessage` (all methods), `PromptMessage.fromView()` decomposition table, `PromptRegistry` methods, and Prompt types.
- **VitePress sidebar:** Prompts section expanded from 1 to 5 items. Reference section expanded from 1 to 12 anchor-linked entries.
- **README.md:** Complete rewrite — engineering-focused documentation matching Prisma/tRPC style. Every section: 1-line technical description + code + output.
- **llms.txt:** Prompt Engine and MVA-Driven Prompts sections with examples. Public API expanded with 11 Prompt entries and 5 Prompt types.

### Test Suite

- **14 new tests** in `PromptMessageFromView.test.ts` covering rules decomposition, data extraction (JSON fencing), UI blocks, hints, suggestions, full composition, Presenter integration, and edge cases.
- **Test count:** 1,356 tests across 61 files, all passing.

## [1.5.0] - 2026-02-23

### 💬 Prompt Engine — 100% MCP Spec Compliance

Full implementation of MCP `prompts/list` and `prompts/get` handlers with `definePrompt()`, `PromptMessage`, `PromptRegistry`, schema-informed coercion, middleware, tag-based filtering, and lifecycle sync (`notifications/prompts/list_changed`).

### Added

- **`definePrompt(name, config)`:** JSON-first prompt builder with flat schema constraint (primitives only — string, number, boolean, enum).
- **`PromptMessage`:** Factory methods — `.system()`, `.user()`, `.assistant()`, `.image()`, `.audio()`, `.resource()`.
- **`PromptRegistry<TContext>`:** Registration, tag-based RBAC filtering, `routeGet()` handler routing, `notifyChanged()` lifecycle sync, `attachToServer()`.
- **Schema-informed coercion:** Automatic string → number/boolean conversion based on declared schema types.
- **Flat schema constraint enforcement:** Nested objects/arrays rejected at definition time with actionable errors.
- **Middleware support:** Same `defineMiddleware()` chain as Tools — auth, RBAC, context derivation.

## [1.4.0] - 2026-02-23

### 🔀 Tool Exposition Strategies — Flat vs Grouped Topology Compiler

Two first-class exposition strategies for the same codebase: **flat** (one MCP tool per action — precision at action level) and **grouped** (one MCP tool per builder with discriminator enum — density at scale). Choose at attach time with `toolExposition: 'flat' | 'grouped'`. Same handlers, different wire format.

### Added

- **`ExpositionCompiler`:** New compile-time topology compiler that transforms builder action graphs into either flat atomic tools or grouped discriminator tools. Builds an O(1) routing map for flat mode dispatch.
- **`toolExposition` option in `AttachOptions`:** `'flat'` (default) expands each action into an independent MCP tool with isolated schema and annotations. `'grouped'` preserves the single-tool discriminator pattern.
- **`actionSeparator` option in `AttachOptions`:** Controls flat tool naming convention (default `'_'`). `projects` + `list` → `projects_list`.
- **MCP Annotation Refinement (`buildAtomicAnnotations`):** Annotations now follow correct MCP spec semantics:
  - Read-only actions → `{ readOnlyHint: true, destructiveHint: false }` (derived: read-only is never destructive)
  - Destructive actions → `{ destructiveHint: true }` (`readOnlyHint` omitted — spec default is `false`)
  - Normal actions → `{ destructiveHint: false }` (overrides spec default of `true` to prevent unnecessary safety warnings in Claude Desktop/Cursor)
  - `readOnlyHint: false` is never emitted (matches spec default)
- **Flat mode description synthesis:** Auto-generated descriptions tagged with `[READ-ONLY]` or `[DESTRUCTIVE]` prefixes, plus origin trail `(builder → action)`.
- **Flat mode StateSync integration:** Canonical dot-notation keys (`projects.create`) translate to/from flat wire names (`projects_create`) transparently.

### Documentation
- **New "Tool Exposition" page:** Stripe/Vercel-quality guide covering both strategies as equal peers, real-world SaaS admin example (10-action grouped), token math comparison, MCP annotation semantics callout, O(1) dispatch explanation, and decision guide table.
- **VitePress sidebar:** Added Tool Exposition under Core Concepts.
- **API Reference:** Updated `AttachOptions` with `toolExposition` and `actionSeparator` fields, added `ToolExposition` and `ExpositionConfig` type sections.
- **Routing page:** Cross-reference to Tool Exposition guide.
- **README:** Tool Exposition row in capability matrix and Learn by Doing guides table.
- **llms.txt:** Tool Exposition section with both strategies, MCP annotation semantics, and updated `AttachOptions` type.

### Test Suite
- **48 new tests** across 2 new test files:
  - `ToolExposition.test.ts` — 21 tests covering flat compilation, grouped passthrough, annotation isolation, hierarchical group expansion, multi-builder merging, separator customization, single-action builders.
  - `ToolExpositionSadPath.test.ts` — 27 sad-path tests covering builder-with-no-actions, empty separator, name collisions, schema shadowing, empty iterables, incorrect tool naming, mode confusion, detach/re-attach, late registration, custom discriminators, exception handling.
- **Test count:** 1,342 tests across 60 files, all passing.

## [1.3.0] - 2026-02-22

### 🔭 Native OpenTelemetry-Compatible Tracing

Production-grade tracing for AI-native MCP servers. Every tool call creates **one span** with rich semantic attributes — zero dependencies on `@opentelemetry/api`, zero overhead when disabled. Uses structural subtyping: pass `trace.getTracer()` directly.

### Added

- **`FusionTracer` / `FusionSpan` interfaces:** Structural subtyping contracts that match the real OpenTelemetry `Tracer` and `Span` — no `implements` or `import @opentelemetry/api` needed.
- **`SpanStatusCode` constants:** Exported `UNSET` (0), `OK` (1), `ERROR` (2) matching OTel values.
- **`.tracing(tracer)` on builders:** Per-tool tracing via fluent API on both `createTool()` and `defineTool()`.
- **`enableTracing(tracer)` on `ToolRegistry`:** Propagate tracer to all registered builders.
- **`AttachOptions.tracing`:** Pass tracer to `attachToServer()` for full server observability.
- **Enterprise error classification:** 5 distinct `mcp.error_type` values (`missing_discriminator`, `unknown_action`, `validation_failed`, `handler_returned_error`, `system_error`) with correct `SpanStatusCode` mapping — AI errors → `UNSET` (no alert), system failures → `ERROR` (PagerDuty).
- **`mcp.isError` attribute:** Consistent `boolean` on all 5 error paths for unified Datadog/Grafana filtering.
- **Enterprise metadata attributes:** `mcp.tags` (tool tags for dashboard filtering), `mcp.description` (tool description), `mcp.response_size` (response text length for billing/quota).
- **Pipeline span events:** `mcp.route`, `mcp.validate` (with `mcp.valid` and `mcp.durationMs`), `mcp.middleware` (with `mcp.chainLength`). Events are optional via `?.` for minimal tracers.
- **Graceful error handling:** Handler exceptions are caught, span gets `SpanStatusCode.ERROR` + `recordException()`, but method returns error response (no MCP server crash).
- **Leak-proof span lifecycle:** `finally { span.end() }` guarantees span closure on all paths including exceptions.
- **Symmetric coexistence warning:** `enableDebug()` ↔ `enableTracing()` emit `console.warn` in either order when both are enabled.
- **`runChain(rethrow)` parameter:** Optional flag (default `false`) allows traced path to receive raw handler exceptions for proper classification.

### Changed

- **`runChain()` signature:** Added optional `rethrow` parameter (backward compatible, default `false`).
- **`_executeTraced()` error path:** Returns graceful `error()` response instead of `throw` — prevents MCP server crashes while preserving `SpanStatusCode.ERROR` for ops alerting.

### Documentation
- **New "Tracing" page:** Dedicated documentation page covering FusionTracer interface, error classification matrix, span attribute reference, pipeline events, context propagation limitation, and production setup example (OTLP/Jaeger).
- **VitePress sidebar:** Added Tracing under Advanced Guides.

### Test Suite
- **36 new tracing tests** in `Tracing.test.ts`:
  - Span lifecycle — creation, end, attributes (4 tests)
  - Span events — route, validate, middleware, order (5 tests)
  - Enterprise metadata — tags, description, response size (5 tests)
  - Error classification — OK, UNSET, ERROR with `mcp.isError` (5 tests)
  - Span leak prevention — finally guarantees (2 tests)
  - Zero overhead — fast path when disabled (2 tests)
  - Registry propagation — enableTracing() (2 tests)
  - Coexistence — debug + tracing symmetric warnings (3 tests)
  - addEvent optional, SpanStatusCode constants, defineTool compat (3 tests)
  - Multiple sequential calls, concurrent calls (2 tests)
  - Server attachment integration (1 test)
- **Test count:** 116 tests across Tracing + DebugObserver + McpServerAdapter, all passing.

## [1.2.0] - 2026-02-22

### 🛡️ Agentic Error Presenter — LLM-Native Validation & Routing Errors

Validation and routing errors are now **formatted for autonomous agents**, not humans. When the LLM sends invalid arguments, it receives structured, uppercase, actionable correction prompts — with the exact field names, what was sent, what was expected, and a direct instruction to retry. The framework switches from `.strip()` to `.strict()`, meaning unknown fields now trigger **explicit rejection with field names** instead of silent removal.

### Changed

- **`.strip()` → `.strict()` in `ToolDefinitionCompiler.buildValidationSchema()`:** Unknown fields injected by the LLM are no longer silently discarded. They now trigger a validation error naming the unrecognized field(s) with a suggestion to check for typos. This gives the LLM a chance to self-correct instead of silently losing data.
- **`ValidationErrorFormatter` upgraded:**
  - New header: `⚠️ VALIDATION FAILED — ACTION 'X'` (uppercased for LLM visual parsing).
  - Anti-apology footer: `💡 Fix the fields above and call the tool again. Do not explain the error.`
  - Actionable hints per field with `You sent:` values and expected types/formats.
  - Unrecognized key errors include `💡 Check for typos` suggestion.
- **`ExecutionPipeline` routing errors:**
  - Missing discriminator: `❌ ROUTING ERROR: The required field 'action' is missing.` with available actions list and recovery hint.
  - Unknown action: `❌ UNKNOWN ACTION: The action 'x' does not exist.` with available actions list and recovery hint.

### Test Suite
- **1,254 tests** across 57 files, all passing.
- Updated assertions in 9 test files to match new error formats and `.strict()` behavior.

### 📡 Streaming Progress — End-to-End MCP Notification Wiring

Generator handlers that `yield progress()` now **automatically** send `notifications/progress` to the MCP client — zero configuration required. The framework detects `progressToken` from the client's request `_meta` and wires the notifications transparently. When no token is present, progress events are silently consumed with **zero overhead**.

### Added

- **MCP Progress Notification Wiring:** `ServerAttachment` now creates a `ProgressSink` from the MCP request `extra` object when the client includes `_meta.progressToken`. Each `yield progress(percent, message)` in a generator handler maps to `notifications/progress { progressToken, progress, total: 100, message }` on the wire. Fire-and-forget delivery — does not block the handler pipeline.
- **`ProgressSink` threading through the full pipeline:** `ToolBuilder.execute()`, `ToolRegistry.routeCall()`, `GroupedToolBuilder.execute()`, and `runChain()` all accept an optional `ProgressSink` parameter, allowing direct injection for testing and custom pipelines.
- **`McpRequestExtra` duck-typed interface:** New internal interface for extracting `_meta.progressToken` and `sendNotification` from the SDK's `extra` object without coupling to SDK internals.
- **`createProgressSink()` factory:** New private helper in `ServerAttachment.ts` that maps `ProgressEvent` to MCP wire format. Returns `undefined` when no token is present (zero overhead).
- **`isMcpExtra()` type guard:** Duck-type check for the MCP SDK's `extra` object.
- **`RegistryDelegate.routeCall()` signature updated:** Now accepts optional `progressSink` parameter.

### Documentation
- **Building Tools:** Streaming Progress section updated to explain automatic MCP notification wiring with wire format table.
- **API Reference:** `ProgressSink` type, MCP Notification Wiring subsection, updated `routeCall()` signature, and `attachToServer()` progress comment added.
- **Examples:** Streaming Progress example (§8) updated with a tip about automatic MCP notification wiring.

### Test Suite
- **8 new tests** in `ProgressWiring.test.ts`:
  - `builder.execute()` with `progressSink` — 3 tests (forward, backward compat, debug path).
  - `registry.routeCall()` with `progressSink` — 1 test (full routing pipeline).
  - MCP ServerAttachment integration — 4 tests (with token, without token, non-MCP extra, numeric token).
- **Test count:** 1,254 tests across 57 files, all passing.

## [1.1.0] - 2026-02-22

### 🔍 Dynamic Manifest — RBAC-Aware Server Capabilities via MCP Resources

Expose a **live capabilities manifest** (`fusion://manifest.json`) as a native MCP Resource. Orchestrators, admin dashboards, and AI agents can discover every tool, action, and presenter registered on the server — dynamically filtered by the requesting user's role and permissions.

### Added

- **Dynamic Manifest Resource:** New opt-in MCP Resource (`fusion://manifest.json`) that exposes the full server capabilities tree. Uses native MCP `resources/list` and `resources/read` protocol — no custom HTTP endpoints. Zero overhead when disabled.
- **ManifestCompiler:** New `compileManifest()` function that extracts metadata from all registered `ToolBuilder` instances and produces a structured `ManifestPayload` with tools, actions, input schemas, and presenter references. `cloneManifest()` provides deep-clone isolation for RBAC filtering.
- **IntrospectionResource:** New `registerIntrospectionResource()` function that registers `resources/list` and `resources/read` handlers on the low-level MCP Server. Supports custom URIs, RBAC filter callbacks, and context factory integration.
- **RBAC Filtering:** Filter callback receives a deep clone of the manifest plus the session context (from `contextFactory`). Delete tools, actions, or presenters the user should not see. Each request gets a fresh clone — concurrent sessions with different roles never interfere.
- **Presenter Introspection Accessors:** `getSchemaKeys()`, `getUiBlockTypes()`, and `hasContextualRules()` on the `Presenter` class — read-only accessors that extract metadata without executing `.make()`, no side effects, don't seal.
- **`ActionMetadata` Presenter Fields:** Extended `ActionMetadata` with `presenterName`, `presenterSchemaKeys`, `presenterUiBlockTypes`, and `presenterHasContextualRules` for action-level presenter metadata.
- **`ToolRegistry.getBuilders()`:** New method returning an iterable of all registered `ToolBuilder` instances for introspection.
- **`AttachOptions.introspection`:** New `IntrospectionConfig<TContext>` option with `enabled`, `uri`, and `filter` fields.
- **`AttachOptions.serverName`:** New option to set the manifest's server name (default: `'mcp-fusion-server'`).

### Documentation
- **New "Dynamic Manifest" page:** Dedicated documentation page with full configuration guide, RBAC patterns, payload structure reference, architecture diagram, and real-world examples (multi-tenant RBAC, compliance audits, admin dashboards).
- **SEO:** 8 new FAQs for the Dynamic Manifest page with full structured data (FAQPage + TechArticle JSON-LD).

### Test Suite
- **50 new tests** across 2 new test files:
  - `Introspection.test.ts` — 31 tests covering ManifestCompiler, Presenter accessors, RBAC filtering, cloneManifest, ToolRegistry.getBuilders, ActionMetadata presenter fields.
  - `IntrospectionIntegration.test.ts` — 19 mock-based integration tests covering handler registration, resources/list and resources/read, RBAC with context factory, zero-overhead guarantee, custom URIs, concurrent reads, dynamic registry, and full payload structure.
- **Test count:** 1,246 tests across 56 files, all passing.

## [1.0.0] - 2026-02-22

### 🎉 First Stable Release — MVA Architecture for AI-Native MCP Servers

This is the first stable release of `mcp-fusion`, introducing **MVA (Model-View-Agent)** — a new architectural pattern created by Renato Marinho at Vinkius Labs that replaces MVC for the AI era.

### Highlights

- **MVA Architecture:** The Presenter replaces the View with a deterministic perception layer — domain rules, rendered charts, action affordances, and cognitive guardrails. Every response is structured. Every action is explicit.
- **Presenter Engine:** `createPresenter()` with Zod schema validation, system rules (static & dynamic), UI blocks (ECharts, Mermaid, Summary), suggested actions (Agentic HATEOAS), cognitive guardrails (`.agentLimit()`), and Presenter composition via `.embed()`.
- **Action Consolidation:** 5,000+ operations behind ONE tool via `module.action` discriminator. 10x fewer tokens. Hierarchical groups with infinite nesting.
- **Two Builder APIs:** `defineTool()` (JSON-first, zero Zod imports) and `createTool()` (full Zod power). Both produce identical runtime behavior.
- **tRPC-style Middleware:** Pre-compiled at build time with `defineMiddleware()` for context derivation. Apply globally or per-group. Zero runtime allocation.
- **Self-Healing Errors:** `toolError()` with structured recovery hints and suggested retry arguments. AI agents self-correct without human intervention.
- **FusionClient:** tRPC-style end-to-end type safety with `createFusionClient<TRouter>()`. Full autocomplete, compile-time checking, zero code generation.
- **State Sync:** RFC 7234-inspired cache signals with `cacheSignal()` and `invalidates()` for cross-domain causal invalidation. Prevents temporal blindness.
- **Cognitive Guardrails:** `.agentLimit(n)` prevents context DDoS. Reduces token costs by up to 100x on large datasets.
- **TOON Encoding:** `toonSuccess()` reduces token count by ~40% vs standard JSON while remaining LLM-parseable.
- **Zero-Overhead Observability:** `createDebugObserver()` with typed events. Absolutely zero runtime cost when disabled.
- **Result Monad:** `succeed()` / `fail()` for composable, type-safe error handling with TypeScript type narrowing.
- **Streaming Progress:** Generator handlers with `yield progress()` for real-time updates.
- **Introspection:** `getActionNames()`, `getActionMetadata()`, `previewPrompt()` for runtime inspection and documentation generation.
- **Typed Handler Args:** `defineTool()` handlers receive fully-typed `args` inferred from params. No casts needed.
- **InferRouter:** Compile-time router type extraction with `InferRouter<typeof registry>`.
- **Freeze-After-Build:** `Object.freeze()` after `.buildToolDefinition()` ensures immutable, deterministic tool definitions.
- **Zod .strip() Security:** Only declared fields reach the AI. Internal fields silently removed.
- **Tag Filtering:** Role-based tool exposure per session without code changes.
- **Validation Error Formatter:** LLM-friendly Zod error messages with actionable correction guidance.

### Documentation
- **23 documentation pages** covering every feature with code examples and real-world patterns.
- **AEOS-optimized SEO:** 130+ unique FAQs across all pages as JSON-LD structured data, optimized for AI engines (ChatGPT, Perplexity, Gemini, Google SGE).
- **Per-page Open Graph, TechArticle, and FAQPage JSON-LD** via `transformHead` hook.
- **Global SoftwareSourceCode JSON-LD** with full metadata.
- **Comparison table** showing 20+ differentiators vs raw MCP.

### Test Suite
- **842 tests** across 36 files, all passing.
- Covers: invariant contracts, security vectors, adversarial inputs, schema collisions, concurrent stress, E2E integration, streaming, FusionClient contracts, and Presenter composition.

## [0.10.0] - 2026-02-22

### Added
- **`InferRouter<typeof registry>` — Compile-Time Router Type Extraction (Task 2.1):**
  - New `createTypedRegistry<TContext>()` curried factory that creates a `ToolRegistry` while preserving builder types for compile-time inference.
  - New `InferRouter<T>` type utility that extracts a fully typed `RouterMap` from a `TypedToolRegistry`, producing `{ 'toolName.actionName': ArgsType }` entries with zero runtime cost.
  - New `TypedToolRegistry<TContext, TBuilders>` interface for type-safe registry wrapping.
  - `GroupedToolBuilder` now carries `TName` (literal tool name) and `TRouterMap` (accumulated action entries) as phantom generics — each `.action()` call widens the type with the new action's key and args.
  - `createTool()` now captures the tool name as a string literal type for inference.
  - 19 new tests covering runtime behavior + type-level inference verification.

- **Typed Handler Args via Schema Inference (Task 2.2):**
  - **`defineTool()` path:** `ActionDef` is now generic over `TParams`, so when `params: { name: 'string' }` is specified, the handler receives `args: { name: string }` — no casts needed. Works with shared params too: `args: InferParams<TParams> & InferParams<TShared>`.
  - **`createTool()` path:** Already supported via typed overload — verified with new compile-time tests.
  - Removed legacy double-cast pattern `(args as Record<string, unknown>)['message'] as string` from existing tests — `args.message` now works directly.
  - 6 new type-level tests verifying both `defineTool()` and `createTool()` paths.

### Changed
- **`GroupedToolBuilder` generics:** Expanded from `<TContext, TCommon>` to `<TContext, TCommon, TName, TRouterMap>`. Fully backward-compatible — all new generics have default values.
- **`ActionDef` generics:** Expanded from `<TContext, TArgs>` to `<TContext, TSharedArgs, TParams>`. Handler args are now conditionally typed based on params presence.
- **`ToolConfig.actions` / `GroupDef.actions`:** Changed from `Record<string, ActionDef>` to mapped types `{ [K in string]: ActionDef }` for per-action param inference.
- **Test count:** 842 tests across 36 files, all passing.


## [0.9.1] - 2026-02-22

### Fixed
- **Sub-path export:** Added `"./client"` entry point in `package.json` exports so that the documented import (`@vinkius-core/mcp-fusion/client`) works natively.
- **Action Group Guard:** Added runtime guard in `defineTool()` throwing an error if both `actions` and `groups` are used simultaneously, aligning with `GroupedToolBuilder` mutual exclusivity.
- **Dead-code JSDoc stub:** Removed a malformed `export function defineTool(...)` stub that was incorrectly embedded inside the `defineTool` JSDoc text.
- **Type Safety & Strictness:** Resolved all remaining TypeScript lint errors across the core builders and schema generators (`no-explicit-any`, `strict-boolean-expressions`, and index signature properties). Removed `eslint-disable` escape hatches in favor of strict type inference using `infer` and pure TypeScript solutions.

### Added
- **API Parity (`omitCommon`):** `ActionDef` and `GroupDef` now accept `omitCommon?: string[]`, propagating it through `defineTool()` to the internal builders to match the builder API capability.

## [0.9.0] - 2026-02-22

### Added
- **`ValidationErrorFormatter`:** New pure-function module that translates raw Zod validation errors into LLM-friendly directive correction prompts. Instead of `"Validation failed: email: Invalid"`, the LLM now receives actionable guidance: `"❌ Validation failed for 'users/create': • email — Invalid email. You sent: 'bad'. Expected: a valid email address. 💡 Fix the fields above and call the action again."` Supports all major Zod issue codes: `invalid_type`, `invalid_string` (email, url, uuid, datetime, regex, ip), `too_small`/`too_big` (number, string, array, date bounds), `invalid_enum_value` (lists valid options), `invalid_literal`, `unrecognized_keys`, and `invalid_union`.
- **`omitCommon()`:** Surgical omission of common schema fields per action or group. Fields omitted are excluded from the LLM-facing schema and runtime validation. Supports per-action (`omitCommon: ['field']`) and group-level (`g.omitCommon('field')`) with automatic merge and deduplication.
- **`previewPrompt()`:** Build-time MCP payload preview with token estimate. Returns the full tool definition including generated description and schema, with an approximate token count for LLM context budgeting.
- **22 new tests** for `ValidationErrorFormatter` (17 unit + 5 integration).
- **18 new tests** for `omitCommon` covering flat/group/merge/edge cases.
- **Test count:** 819 tests across 35 files, all passing.

### Changed
- **`ExecutionPipeline.validateArgs()`:** Now delegates to `formatValidationError()` instead of raw `ZodIssue.message` joining. Backward-compatible — existing assertions on `'Validation failed'` still match.
- **SRP refactoring — `SchemaGenerator`:** Decomposed the monolithic `generateInputSchema` (120 lines, 4 responsibilities) into 5 focused helpers: `addDiscriminatorProperty()`, `buildOmitSets()`, `collectCommonFields()`, `collectActionFields()`, `applyAnnotations()`.
- **SRP refactoring — `ToolDefinitionCompiler`:** Extracted `applyCommonSchemaOmit()` — pure function for surgical Zod `.omit()` with empty-schema guard — from `buildValidationSchema()`.
- **SRP refactoring — `ActionGroupBuilder`:** Extracted `mapConfigToActionFields()` — shared `ActionConfig → InternalAction` mapper used by both `GroupedToolBuilder.action()` and `ActionGroupBuilder.action()`, eliminating 6-field duplication.
- **`InternalAction`:** Added `omitCommonFields?: readonly string[]` for runtime omission tracking.
- **`ActionConfig`:** Added `omitCommon?: string[]` to the public API.

## [0.6.0] - 2026-02-21

### Added
- **Strict TypeScript flags:** `noUncheckedIndexedAccess` and `noFallthroughCasesInSwitch` enabled in `tsconfig.json`.
- **ESLint type-aware rules:** Added `no-floating-promises`, `no-misused-promises`, `await-thenable`, `require-await`, `no-unnecessary-condition`, `consistent-type-imports`, and `consistent-type-exports`. Upgraded `no-explicit-any` from `warn` to `error`.
- **`createIcon()` factory function:** Creates immutable `Icon` instances.
- **`createToolAnnotations()` factory function:** Creates immutable `ToolAnnotations` instances.
- **`createAnnotations()` factory function:** Creates immutable `Annotations` instances.
- **Edge-case test suite (`EdgeCases.test.ts`):** 37 new tests covering `getActionMetadata()`, group-level middleware chains, frozen guard on all config methods, error paths (non-Error throws, middleware errors), `ResponseHelper` empty-string fallback, `ConverterBase` null filtering, custom discriminator routing, and description generator edge cases.
- **Enterprise-grade test suites:** Added `InvariantContracts.test.ts` (56 tests: determinism, execution isolation, context immutability, handler chaos, unicode/binary boundaries, re-entrancy, concurrent registry stress, API equivalence, FusionClient contracts), `DeepVerification.test.ts`, `LargeScaleScenarios.test.ts`, `SecurityDeep.test.ts` (15 attack vectors), `McpServerAdapter.test.ts` (duck-type detection, detach lifecycle), `StreamingProgress.test.ts`, `EndToEnd.test.ts` (full-stack integration), and `ToonDescription.test.ts`.
- **Test coverage improved:** 773 tests across 33 files, 100% function coverage. Comprehensive invariant, security, and adversarial testing.

### Changed
- **BREAKING:** `Icon`, `ToolAnnotations`, and `Annotations` converted from mutable classes to `readonly` interfaces with factory functions (`createIcon()`, `createToolAnnotations()`, `createAnnotations()`). Use factory functions instead of `new Icon()`, `new ToolAnnotations()`, `new Annotations()`.
- **Converter API simplified:** `ConverterBase` abstract methods renamed from `convertFromSingle`/`convertToSingle` to `convertFrom`/`convertTo`. Domain-specific converter bases (`GroupConverterBase`, `ToolConverterBase`, etc.) no longer have redundant bridge methods — they directly extend `ConverterBase<DomainType, DtoType>`.
- **`ConverterBase.filter()`** now uses `NonNullable<T>` type predicate for better type narrowing in batch operations.
- **`BaseModel`** properties (`name`, `nameSeparator`) made `readonly`.
- **`InternalAction`** and **`ActionMetadata`** properties made `readonly` for immutability.
- **`ToolRegistry._builders`** map made `readonly`.
- All `import type` declarations enforced across the codebase via ESLint auto-fix.
- Removed unnecessary `async` from `ToolRegistry` detach handler (fixes `require-await`).
- Removed unnecessary truthy check in `GroupedToolBuilder._buildValidationSchema` (fixes `no-unnecessary-condition`).

### Fixed
- **Non-null assertions eliminated:** All `!` operators in `GroupedToolBuilder.ts` replaced with explicit guards and checks.
- **`McpServerLike` typing:** Replaced `any` with `never[]` for duck-typing safety in `ToolRegistry`.

## [0.5.0] - 2026-02-21

### Added
- **`ConverterBase<TSource, TTarget>`:** Generic base class for all bidirectional converters. Consolidates the batch conversion logic (`map` + null filtering) that was previously duplicated across `GroupConverterBase`, `ToolConverterBase`, `PromptConverterBase`, `ResourceConverterBase`, and `ToolAnnotationsConverterBase`. Domain-specific converters now extend this base via bridge methods, eliminating the DRY violation while maintaining full backward compatibility.
- **`removeFromArray<T>()` utility:** Extracted duplicated `indexOf` + `splice` pattern into a reusable generic helper in `src/utils.ts`. Used by `GroupItem`, `Prompt`, and `Group`.
- **ESLint integration:** Added `eslint.config.js` (flat config) with `typescript-eslint` for type-aware linting. `npm run lint` / `npm run lint:fix` scripts available.
- **`JsonSchemaObject` interface:** Typed the `zodToJsonSchema` output in `SchemaGenerator.ts`, eliminating raw `as Record<string, unknown>` casts.

### Changed
- **BREAKING:** Java-style naming convention removed — all classes renamed to idiomatic TypeScript:
  - `AbstractBase` → `BaseModel` (file: `BaseModel.ts`)
  - `AbstractLeaf` → `GroupItem` (file: `GroupItem.ts`)
  - `AbstractConverter` → `ConverterBase` (file: `ConverterBase.ts`)
  - `AbstractGroupConverter` → `GroupConverterBase`
  - `AbstractToolConverter` → `ToolConverterBase`
  - `AbstractPromptConverter` → `PromptConverterBase`
  - `AbstractResourceConverter` → `ResourceConverterBase`
  - `AbstractToolAnnotationsConverter` → `ToolAnnotationsConverterBase`
  - `addLeaf()` / `removeLeaf()` → `addChild()` / `removeChild()` (private methods in `Group`)
- **BREAKING:** `ToolAnnotationsConverter` API normalized — method overloading removed. Use `convertFromToolAnnotation()` / `convertToToolAnnotation()` for single items, and `convertFromToolAnnotations()` / `convertToToolAnnotations()` for batch. Previous overloaded signatures no longer exist.
- **BREAKING:** `ToolAnnotationsConverterBase` abstract methods renamed from `convertFromToolAnnotationsSingle` / `convertToToolAnnotationsSingle` to `convertFromToolAnnotation` / `convertToToolAnnotation`.
- `success('')` now returns `'OK'` instead of an empty string — prevents confusing empty MCP responses.

### Fixed
- **`getGroupSummaries` dead field:** Removed unused `description` field from the return type — only `name` and `actions` were consumed.
- **Unused import:** Removed dead `z` import from `GroupedToolBuilder.ts`.
- **`ToolRegistry` typing:** Typed `callHandler` request parameter instead of `any`.

### Removed
- **BREAKING:** `hashCode()` and `equals()` methods removed from `BaseModel`. These were Java `Object` patterns with no runtime utility in TypeScript/JavaScript — use `===` for identity comparison.
- **BREAKING:** `toString()` methods removed from all domain model classes (`Group`, `Tool`, `Prompt`, `PromptArgument`, `Resource`, `Icon`, `ToolAnnotations`, `Annotations`). These used the Java `ClassName [field=value]` format — use `JSON.stringify()` or structured logging instead.
- Redundant null/undefined constructor guard removed from `BaseModel` — TypeScript strict mode handles this at compile time.

## [0.4.0] - 2026-02-20

### Changed
- **BREAKING:** Domain model migrated from Java-style getter/setter methods to idiomatic TypeScript public fields. All `getX()`/`setX()` methods removed — use direct property access instead (e.g. `tool.name` instead of `tool.getName()`, `tool.title = 'Deploy'` instead of `tool.setTitle('Deploy')`).
- **BREAKING:** `getParentGroups()` and `getParentGroupRoots()` removed from `GroupItem`. Use `instance.parentGroups` directly; for roots use `instance.parentGroups.map(g => g.getRoot())`.
- **BREAKING:** `getChildrenGroups()`, `getChildrenTools()`, `getChildrenPrompts()`, `getChildrenResources()`, `getParent()`, `setParent()` removed from `Group`. Use `instance.childGroups`, `instance.childTools`, `instance.childPrompts`, `instance.childResources`, `instance.parent` directly.
- **BREAKING:** `Annotations` constructor parameters are now optional: `new Annotations()` is valid. Previously all three were required.
- `ToolAnnotations` empty constructor removed — class is now a plain data class with public fields.

### Fixed
- **Comma operator anti-pattern:** Replaced obscure `indexOf === -1 && (push, true)` pattern with readable `includes()` + explicit return in `GroupItem.addParentGroup()` and `Prompt.addPromptArgument()`.
- **Unused parameter removed:** `sb: string` parameter in `Group.getFullyQualifiedNameRecursive()` was a Java `StringBuilder` remnant — removed.
- **Dead import removed:** Unused `import { z } from 'zod'` in `ToonDescriptionGenerator.ts`.

### Documentation
- `docs/api-reference.md` rewritten for new public-field API with usage examples.

## [0.2.1] - 2026-02-17

### Fixed
- **O(1) Action Routing:** Replaced `Array.find()` linear scan with `Map.get()` in `execute()`. The `_actionMap` is built once during `buildToolDefinition()` and reused across all invocations — fulfilling the README's O(1) performance promise.

### Added
- **Build-Time Schema Collision Detection:** `SchemaGenerator` now calls `assertFieldCompatibility()` to detect incompatible field types across actions at build time. The 3-layer check hierarchy detects base type mismatches (e.g. `string` vs `number`), enum presence conflicts (e.g. `z.enum()` vs `z.string()`), and enum value-set differences — while correctly treating `integer` as compatible with `number`. Throws actionable errors with field name, action key, conflicting types, and guidance.
- **`SchemaUtils.assertFieldCompatibility()`:** Extracted collision detection into `SchemaUtils` as a pure, reusable helper alongside the existing `getActionRequiredFields()`. Keeps `SchemaGenerator` focused on generation, not validation.
- **`SchemaCollision.test.ts`:** 50 dedicated tests covering all primitive type pairs, enum conflicts, integer/number compatibility, nullable edge cases, commonSchema vs action conflicts, hierarchical groups, multi-action chains, error message quality, and runtime behavior after valid builds.

## [0.2.0] - 2026-02-12

### Changed
- **BREAKING:** `zod` moved from `dependencies` to `peerDependencies` with range `^3.25.1 || ^4.0.0`. Projects using zod 4 no longer hit version conflicts.
- **BREAKING:** `@modelcontextprotocol/sdk` moved from `dependencies` to `peerDependencies`. Projects already have it installed — no duplication.

### Fixed
- GitHub URLs in `package.json` and `CONTRIBUTING.md` corrected from `vinkius-labs` to `vinkius-labs`.

## [0.1.1] - 2026-02-12

### Added
- Scaling guide (`docs/scaling.md`) — technical deep-dive into how grouping, tag filtering, TOON compression, schema unification, Zod `.strip()`, and structured errors prevent LLM hallucination at scale.
- Link to scaling guide in README documentation table and Token Management section.

## [0.1.0] - 2026-02-12

### Added
- Core framework with `Tool`, `Resource`, and `Prompt` abstractions.
- `Group` class for logical organization of MCP capabilities.
- Discriminator-based routing for efficient tool selection.
- Strongly typed arguments and outputs using Zod.
- Initial project configuration and CI/CD setup.
- Basic documentation structure.

