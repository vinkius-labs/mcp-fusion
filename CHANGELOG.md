# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.25] - 2026-03-06

### Fixed

- `ServerAttachment` `createToolCallHandler` now enforces the FSM State Gate at dispatch — previously only filtered `tools/list`, allowing clients that knew a tool's name to bypass the gate and call it regardless of FSM state; rejected calls return a structured `toolError('FORBIDDEN')` with current state, blocked tool name, and available actions
- `ServerAttachment` in-memory FSM snapshot store now uses a bounded LRU map (max 10 000 entries) — previously used an unbounded `Map` that never evicted entries, causing linear memory growth proportional to unique session count in long-running servers

## [3.1.24] - 2026-03-06

### Fixed

- `ApiKeyManager._timingSafeCompare` now uses constant-time XOR accumulation over both buffers — previously early-returned on length mismatch, leaking key length via timing side-channel
- `MiddlewareCompiler.isAsyncGeneratorFunction` now includes a duck-type fallback checking `Symbol.asyncIterator` on the function prototype — previously only checked `Symbol.toStringTag` and `constructor.name`, which fail for transpiled async generators
- `PromptRegistry.listPrompts` cursor fallback now skips to end of list when cursor target is removed — previously used lexicographic `>` comparison on insertion-ordered Map keys, which could return incorrect pages

## [3.1.23] - 2026-03-06

### Fixed

- `.env` parser (`loadEnv`) now strips inline comments (`KEY=value # comment` → `value`) for unquoted values and only removes matching quote pairs — previously inline `#` was kept verbatim and mismatched quotes (e.g. `'bar"`) were independently stripped
- `MCP_FUSION_VERSION` now reads from `package.json` at runtime via `createRequire` — previously hardcoded as `'1.1.0'`, causing stale version in CLI output and lockfile digests
- `FusionTester.callAction()` now places the discriminator (`action`) **after** the user-provided args spread — previously placed it before, allowing user args `{ action: 'override' }` to shadow the programmatic discriminator
- Inspector `Simulator` now emits exactly **one** `execute` event per pipeline — previously emitted an unconditional first `execute` plus a second inside the if/else branches, doubling `callCount` and live-traffic entries
- `autoDiscover` `walkDir()` now sorts directory entries alphabetically via `localeCompare` — previously returned files in filesystem-dependent order, causing non-deterministic tool registration across OS/deploys
- Cloudflare adapter now uses `ctx.waitUntil(server.close())` for non-blocking cleanup — previously used `finally { await server.close() }`, which delayed every response until cleanup completed

## [3.1.22] - 2026-03-06

### Fixed

- `prisma-gen` `emitFindUnique()` now generates `findUnique` + null-check returning an error response — previously used `findUniqueOrThrow`, which leaked Prisma's opaque `PrismaClientKnownRequestError` (P2025) to the LLM
- `PromptRegistry` interceptor builder `prependSystem` and `appendSystem` now use `role: 'assistant'` — previously all four methods used `role: 'user'`, making system/user insertion functionally identical
- `materializeContract()` now integrates `EntitlementScanner` to populate real handler entitlements from static source analysis — previously returned hardcoded all-false placeholder, leaving downstream blast-radius analysis blind
- `profileResponse()` overhead token slice now uses `.slice(-overheadBlocks)` to correctly measure trailing overhead blocks — previously sliced from the beginning, inverting data and overhead counts
- `scaffold()` now skips the generic RBAC `auth.ts` push when `vector === 'oauth'` — previously wrote it twice (generic first, then OAuth-specific), causing wasted I/O and inflated progress count
- CLI `parseArgs` now validates that flag-value arguments (`--server`, `--name`, `--cwd`, `--transport`, `--vector`, `--dir`, `--token`, `--server-id`) are followed by an actual value — previously consumed the next flag silently (e.g. `--server --dir ./src` set server to `"--dir"`)
- `ask()` now listens for the readline `close` event and resolves with the fallback value — previously, if stdin was piped or closed (Ctrl+D/EOF), the returned Promise would hang forever

## [3.1.21] - 2026-03-06

### Fixed

- `validateArgs` now strips the `_select` framework field in the no-schema early-return path — previously leaked to handlers when no Zod validation schema was defined
- `ServerAttachment` now caches the `compileExposition()` result across requests — avoids redundant recompilation on every `tools/call` and `tools/list` when the builder set hasn't changed
- `DevServer` now calls `cacheBustUrl()` inside `invalidateModule()` and exports `cacheBustUrl` — previously defined but never invoked, ESM modules were served stale on hot-reload
- Cloudflare and Vercel adapters now wrap `contextFactory()` in try/catch — previously, a thrown error (auth failure, DB error) caused an uncaught exception and a generic 500 instead of a JSON-RPC error envelope
- AWS connector polling loop now has a re-entrancy guard — prevents concurrent `refresh()` calls when discovery takes longer than `pollInterval`

## [3.1.20] - 2026-03-06

### Fixed

- SSE server template now wraps the async HTTP handler body in `try/catch` — previously, a rejected promise from `server.connect()` or `transport.handlePostMessage()` would crash the generated server with an unhandled rejection
- `scaffold()` now cleans up the target directory when a write operation fails mid-way (e.g. permission denied, disk full) — partially-written project files are removed instead of left as broken orphans
- `fusion deploy` now prompts for user confirmation before auto-installing `esbuild` — previously ran `npm install -D esbuild` silently with `stdio: 'ignore'`, modifying `package.json` without consent
- `fusion deploy` now validates `serverId` format against `[a-zA-Z0-9_-]+` and applies `encodeURIComponent` — previously, a malicious `.fusionrc` with `serverId: "../../admin/nuke"` could traverse the API path
- `FusionClient` now accepts a `discriminatorKey` option (defaults to `'action'`) — previously hard-coded `action` as the key, breaking grouped tool calls when the server uses a custom discriminator like `.discriminator('command')`

## [3.1.19] - 2026-03-06

### Fixed

- CLI entry-point guard now handles Windows shim extensions (`.cmd`, `.ps1`, `.cjs`, `.mjs`, `.exe`) — previously `main()` was silently skipped when invoked via npx/pnpm/yarn on Windows
- `fusion dev` reload now resolves the new registry before clearing the old one — if resolution fails (e.g. syntax error in user code), existing tools remain available instead of vanishing
- `fusion deploy` now warns when the deploy token would be sent over plaintext HTTP, adds a 60-second fetch timeout, and wraps `res.json()` in try/catch for non-JSON responses
- FSM state gate now clones per-request even without an external `fsmStore` — concurrent SSE/stdio clients no longer share and mutate the same FSM instance, preventing cross-session workflow corruption
- `FluentToolBuilder` inline `.use()` middleware no longer merges enriched context via `Object.assign` — dangerous keys (`__proto__`, `constructor`, `prototype`) are now filtered to prevent prototype pollution

## [3.1.18] - 2026-03-05

### Fixed

- `TokenManager` now restricts file permissions on Windows via `icacls` — `mode: 0o600` is silently ignored on NTFS, so saved tokens and device codes were readable by any local user
- `ZodCompiler.compileArray()` now prefers `minItems`/`maxItems` over legacy `minLength`/`maxLength` for array constraints — previously emitted `.min()`/`.max()` based on string-level fields, producing incorrect validation for arrays
- `HttpHandlerFactory` no longer adds `Content-Type: application/json` to GET and HEAD requests — prevents servers from rejecting body-less requests that carry an unexpected content header
- `RefResolver` deep-clones `$ref` targets before recursive resolution — multiple `$ref` pointers to the same definition no longer share a single mutable object, preventing cross-contamination during in-place resolution
- `ToolSynthesizer.toToolName()` in the n8n package now throws when the sanitized name is empty (e.g. `"---"`, `"   "`) — previously returned `""`, which produced an invalid MCP tool definition

## [3.1.17] - 2026-03-05

### Fixed

- `SandboxEngine` abort handler no longer disposes the shared isolate when concurrent executions are in flight — prevents collateral `'Isolate was disposed'` errors misclassified as `MEMORY`
- `SandboxEngine` output size guard now uses UTF-8 byte length (`TextEncoder`) instead of `.length` (UTF-16 code units) — correctly rejects CJK/emoji output that exceeds `maxOutputBytes`
- `ExecutionPipeline` discriminator re-injection now guards against `__proto__`, `constructor`, and `prototype` names — prevents prototype pollution via poisoned discriminator configuration
- `EgressGuard` byte-level truncation now backtrack to a valid UTF-8 character boundary instead of producing U+FFFD replacement characters for incomplete multi-byte sequences
- `ToolRegistry.routeCall` no longer leaks all registered tool names in the "unknown tool" error response — prevents exposing tools hidden by tag-based filtering; suggests `tools/list` instead
- `JwtVerifier` now accepts an `algorithm` field in `JwtVerifierConfig` for public key verification — no longer hardcoded to `RS256`, enabling ES256/ES384/ES512 elliptic curve keys

## [3.1.16] - 2026-03-05

### Fixed

- `coercePromptArgs` no longer coerces empty string `""` to `0` for ZodNumber fields — leaves it unset so Zod correctly rejects it as missing
- `PromptRegistry.listPrompts` cursor now finds the nearest successor when the cursor target is removed between pages, preventing silent restart from page 1
- `isToolResponse` type guard now verifies that `content[0]` has a string `type` property, preventing domain objects with `content` arrays from bypassing the MVA pipeline
- `ServerAttachment` flat-mode tool dispatch reuses the exposition compiled for telemetry routing instead of calling `recompile()` twice per call
- `DevServer.invalidateModule` now recursively invalidates transitive CJS dependents (`require.cache` children), ensuring hot-reload propagates through import chains
- `DevServer` file watcher now registers an `'error'` handler to prevent unhandled `ENOSPC`/filesystem errors from crashing the process
- `StateMachineGate` now exports `resetXStateCache()` to allow test environments to re-trigger xstate dynamic import after mock changes

## [3.1.15] - 2026-03-05

### Fixed

- **`GovernanceObserver.observe()` sync mishandles async callbacks (Bug #50)** — `observe<T>(fn: () => T): T` accepted async callbacks since `() => Promise<T>` is assignable to `() => T`. The span ended immediately, `durationMs` was near-zero, async rejections were never caught, and the debug event registered success before async work completed. Fixed by adding a runtime guard that throws when the result is thenable, directing users to `observeAsync()`.

- **`FusionClient.terminalCall` — user `action` field overwrites routing field (Bug #51)** — `{ action: actionName, ...args }` placed the routing `action` before user args. If the user's schema had a field named `action`, the user's value silently overwrote the routing field, causing the server to route to the wrong handler. Fixed by inverting spread order to `{ ...args, action: actionName }`.

- **`Group.addChildGroup()` without cycle detection — infinite recursion (Bug #52)** — Adding a group as a child of itself or creating an indirect cycle caused infinite recursion in `getRoot()` and `getFullyQualifiedNameRecursive()`. Fixed by walking the parent chain before adding; if the child is an ancestor, throw.

- **`GroupItem.addParentGroup()` is public — allows inconsistent bidirectional links (Bug #53)** — `addParentGroup()` added a group to the item's `parentGroups` but did not add the item to the group's `childTools`. The two collections became inconsistent. Fixed by marking as `@internal` with documentation directing users to `Group.addChildTool()` / `addChildPrompt()` / `addChildResource()`.

- **`ExpositionCompiler` action schema silently overwrites common schema fields (Bug #54)** — When both common and action schemas defined a field with the same name, the action version silently won with no warning. Fixed by emitting `console.warn()` when an action field overwrites a common field.

- **`CryptoAttestation` top-level `await` breaks CommonJS consumers (Bug #55)** — `const subtle = globalThis.crypto?.subtle ?? (await import('node:crypto')).webcrypto.subtle` used top-level await, requiring ESM. The module failed to load in CJS contexts. Fixed by replacing with lazy async `getSubtle()` resolution per-call, following the same pattern as `canonicalize.ts`.

## [3.1.14] - 2026-03-05

### Fixed

- **`startServer` edge interceptor returns `server: null` typed as `Server` (Bug #45)** — In edge/interceptor mode (Vinkius Cloud V8 Isolate), `startServer` returned `{ server: null as any }`, hiding the null from TypeScript. Callers accessing `result.server.close()` crashed with null dereference. Fixed by changing `StartServerResult.server` type to `Server | null` and removing the `as any` cast.

- **`TokenEconomics` overhead ratio is 0 when ALL blocks are overhead (Bug #46)** — `overheadRatio = dataTokens > 0 ? overheadTokens / dataTokens : 0` reported 0 (minimum) when all blocks were overhead (100% overhead case), semantically inverting the metric. The `OVERHEAD WARNING` advisory never triggered for the most extreme case. Fixed by returning `Infinity` when `dataTokens === 0 && overheadTokens > 0`.

- **`ToolContract.materializeBehavior` fingerprint includes schema keys in condition gate (Bug #47)** — Condition `presenterSchemaKeys.size > 0 || staticRuleStrings.length > 0` caused the fingerprint to change from `'none'` to `'static:e3b0c44...'` (hash of empty string) when Presenter had schema keys but zero rules. Adding/removing schema keys changed the fingerprint without any rules changing. Fixed by checking only `staticRuleStrings.length > 0`.

- **Static rules silently discarded when dynamic rules coexist (Bug #48)** — When any action had `presenterHasContextualRules: true`, the fingerprint became `'dynamic'` and static rule hashing was skipped entirely. A tool with 2 static + 1 dynamic action lost cryptographic coverage of its static rules. Fixed by computing a composite fingerprint `'dynamic:<hash>'` that preserves static rule integrity alongside the dynamic indicator.

- **`TelemetryBus.close()` doesn't remove signal handlers — wrong function reference (Bug #49)** — Signal handlers were registered as anonymous arrow functions (`() => sigHandler('SIGINT')`) but `close()` tried to remove `sigHandler` directly — a different function reference. `removeListener` was a no-op, leaving stale handlers that could kill the process after explicit `close()`. Fixed by storing arrow function references in named variables and using those same references in both registration and removal.

## [3.1.13] - 2026-03-05

### Fixed

- **Auto-wrap `success(undefined)` produces malformed ToolResponse for void handlers (Bug #41)** — When a handler returns `void` (fire-and-forget pattern), `result` is `undefined`. The duck-type ToolResponse check failed, and `success(undefined)` was called, producing `{ content: [{ type: 'text', text: undefined }] }` which violates the MCP contract (`text` must be a string). Fixed by guarding `if (result === undefined || result === null) return success('OK')` before the duck-type check.

- **`DevServer.performReload` collects builders in disposable registry (Bug #42)** — `performReload` created a local `reloadRegistry`, called `setup(reloadRegistry)`, collected builders, but never transferred them to the real MCP server's registry. The client received `notifications/tools/list_changed` but the actual tool list hadn't changed — hot-reload was effectively a no-op. Fixed by accepting an optional `registry` in `DevServerConfig` and transferring collected builders after each reload (with `clear()` before re-registration to avoid duplicates).

- **`selfHealing` option accepted but never used in `attachToServer` (Bug #43)** — `AttachOptions` declared `selfHealing?: SelfHealingConfig` and imported the type, but `attachToServer` never destructured or wired it into the handler pipeline. Users configuring `selfHealing` got zero effect. Fixed by destructuring `selfHealing`, adding it to `HandlerContext`, passing it through to `hCtx`, and calling `enrichValidationError` on error results in `createToolCallHandler`.

- **FSM state lost when `fsmStore` exists but session ID is not extractable (Bug #44)** — After FSM transition, state was saved to `fsmStore` only if `extractSessionId(extra)` returned a value. In stdio transports (no session ID), the transition was applied to the per-request clone and then discarded — state was silently lost. Fixed by using `extractSessionId(extra) ?? '__default__'` as a fallback session ID at all three call sites (tool list handler load, tool call handler load, post-transition save).

## [3.1.12] - 2026-03-05

### Fixed

- **`redactPII()` silently fails when `fast-redact` not loaded asynchronously (Bug #37)** — `compileRedactor()` called the synchronous `getFastRedact()` which returns `null` if the async `loadFastRedact()` hasn't completed yet. Presenters declared at module top-level (before `initFusion()`) received `_compiledRedactor = undefined` and PII passed to the wire without redaction or warning. Fixed by making `_applyRedaction` lazily retry compilation on first use and emitting a `console.warn` when redaction is configured but `fast-redact` remains unavailable.

- **`createGroup.execute()` discards validated/transformed Zod data (Bug #38)** — After `schema.safeParse(args)` succeeded, the handler was called with the raw `args` instead of `result.data`. Zod transforms (`.transform(Number)`), defaults (`.default('foo')`), and strip (`.strip()`) were silently discarded. Fixed by passing `result.data ?? args` to the handler chain.

- **`FluentEnum.default()` does not mark field as optional (Bug #39)** — `FluentString`, `FluentNumber`, and `FluentBoolean` all set `this._optional = true` in `.default()`, but `FluentEnum.default()` did not. The Zod schema remained `required` despite having a default, causing contradictory contracts for the LLM. Fixed by adding `this._optional = true` to `FluentEnum.default()`.

- **`FluentRouter.tags()` replaces instead of accumulating (Bug #40)** — Same pattern as Bug #11: `this._tags = tags` (assignment) instead of `this._tags.push(...tags)` (accumulation). Chaining `.tags('auth').tags('admin')` discarded `'auth'`. Fixed by changing to `this._tags.push(...tags)` consistent with `FluentToolBuilder` and `GroupedToolBuilder`.

## [3.1.11] - 2026-03-05

### Fixed

- **Case-sensitive boolean coercion in `PromptExecutionPipeline` (Bug #31)** — `value === 'true'` was case-sensitive, so `'True'`, `'TRUE'`, and `'1'` were all coerced to `false`. Fixed by using `value.toLowerCase() === 'true' || value === '1'` with a `typeof` guard.

- **Leading space in description when `tool.description` is `undefined` (Bug #32)** — `DescriptionDecorator` baked a space into the suffix constant, producing `" [Cache-Control: ...]"` when the base description was empty. Fixed by conditionally inserting the space only when `base.length > 0`.

- **`ZodDescriptionExtractor` fails to unwrap `ZodPipeline` (Bug #33)** — `ZodPipeline` stores its inner schema in `_def.in`, not in `innerType`/`type`/`schema`. The fallback chain returned `undefined`, silently losing `.describe()` annotations on piped fields. Fixed by adding `(def as Record<string, unknown>)['in']` to the fallback chain.

- **`autoDiscover` silently swallows all import errors (Bug #34)** — Syntax errors, missing dependencies, and runtime exceptions were all caught and ignored, making tools disappear without any diagnostic. Fixed by adding `onError` callback and `strict` option to `AutoDiscoverOptions`. When `strict` is `true`, errors are rethrown.

- **`edge-stub.ts` path functions return empty string silently (Bug #35)** — `resolve()`, `join()`, `dirname()`, and `basename()` returned `''` instead of crashing, allowing empty paths to silently propagate. Fixed by replacing them with `CRASH('node:path.<fn>')` calls for consistency with Tier 2 stubs.

- **`TokenEconomics` collection detection via `endsWith('s')` produces false positives (Bug #36)** — Fields like `status`, `address`, `progress`, `class`, and `success` were incorrectly classified as collections, inflating risk assessments. Fixed by replacing `endsWith('s')` with a specific regex of 20 known plural suffixes plus case-insensitive `includes('list')` and `includes('items')` checks.

## [3.1.10] - 2026-03-05

### Fixed

- **`.strict()` overrides consumer's unknown-keys policy in `createGroup` (Bug #24)** — Pre-computed `strictSchemaMap` unconditionally applied `.strict()` to all action schemas, overriding the consumer's choice of `.passthrough()` or `.strip()`. Fixed by removing `strictSchemaMap` and using the consumer's original schema from `schemaMap` directly.

- **`retryAfter` not validated for finite/positive values in `toolError` (Bug #25)** — `retryAfter` accepted `NaN`, `Infinity`, `-1`, and `0`, producing invalid XML like `<retry_after>NaN seconds</retry_after>`. Fixed by gating the tag emission with `Number.isFinite(retryAfter) && retryAfter > 0`.

- **`FusionClient` error text includes `"undefined"` for non-text content (Bug #26)** — `.map(c => c.text)` produced `undefined` for image/resource content blocks. Fixed by adding `.filter(c => c.type === 'text')` before `.map()` in `executeInternal()`.

- **`EgressGuard` missing truncation suffix at exact byte boundary (Bug #27)** — When a content block consumed exactly all remaining bytes, subsequent blocks were silently skipped without appending the truncation suffix. The response appeared complete to the LLM despite missing content. Fixed by checking after the loop whether blocks were skipped and appending the suffix to the last block.

- **`ContextDerivation` prototype pollution via `Object.assign` (Bug #28)** — `Object.assign(ctx, derived)` blindly copied all properties including `__proto__`. Replaced with explicit `Object.entries` loop that skips `__proto__` keys. Added documentation warning that `contextFactory` must return a new object per invocation to prevent cross-call property leakage.

- **Duck-type check false positive for domain objects with `content` array (Bug #29)** — The ToolResponse detection check only verified `content[0]?.type === 'text'`, allowing domain objects with a coincidental `content` array to bypass `success()` wrapping and the Presenter layer. Fixed by adding `Object.keys(result).every(k => k === 'content' || k === 'isError')` to reject objects with extra properties.

- **`ResponseBuilder` uses implicit falsy check for empty string (Bug #30)** — `data || 'OK'` relied on JavaScript's falsy semantics. Replaced with `data.length > 0 ? data : 'OK'` for explicit intent and to avoid confusion with the short-circuit pattern.

## [3.1.9] - 2026-03-05

### Fixed

- **Race condition in `CursorCodec.ensureSecret()` — concurrent calls generate different keys (Bug #17)** — When no explicit secret is provided, two concurrent `encode()` calls could both enter `ensureSecret()` before `_secretBytes` was set, generating different keys. The second would overwrite the first, invalidating earlier cursors. Fixed by adding a `_secretPromise` field as a promise-based lock — the first call creates the promise, subsequent concurrent calls reuse it.

- **`IntrospectionResource` passes `undefined as TContext` to RBAC filter (Bug #18)** — When `config.filter` was defined but `contextFactory` was absent, the filter was called with `undefined` force-cast as `TContext`. If the filter accessed `ctx.user.role`, it threw `TypeError`. Fixed by removing the `else if (config.filter)` branch — when contextFactory is absent, the filter is skipped and the full manifest is returned.

- **`SemanticProbe.evaluateProbes` uses `Promise.all` — one failure rejects entire batch (Bug #19)** — If any single probe failed (network error, timeout), `Promise.all` rejected the entire batch, discarding all other successful results. Fixed by replacing `Promise.all` with `Promise.allSettled` — fulfilled results are used normally, rejected probes produce graceful fallback results with `similarityScore: 0.5` and `driftLevel: 'medium'`.

- **`systemRulesFingerprint` hashes schema keys instead of actual rules (Bug #20)** — The `ToolBehavior` interface promised "SHA-256 of sorted rule strings" but `materializeBehavior` hashed presenter schema keys. Changing rules without changing the schema produced the same fingerprint. Fixed by adding `getStaticRuleStrings()` to Presenter, `presenterStaticRules` to ActionMetadata, and wiring through GroupedToolBuilder. The fingerprint now hashes actual rule strings.

- **Duplicate prompt names corrupt lockfile integrity digest (Bug #21)** — If two prompt builders shared the same name, the code produced duplicate entries in `promptDigestParts`, inflating the integrity digest. `.find()` always returned the first, silently ignoring the second. Fixed by replacing the array+find pattern with a `Map<string, PromptBuilder>` (last-wins deduplication) before iterating.

- **`injectLoopbackDispatcher` mutates context object unsafely (Bug #22)** — Direct `ctx['invokeTool'] = ...` mutation failed with frozen objects, read-only getters, or shared contexts across requests. Fixed by changing the function to return a new `TContext` via `Object.create(ctx)` (prototype-based proxy) for objects, or `Object.assign({})` for null/undefined. Caller updated to use the enriched context.

### Test Suite

- **15 new regression tests** in `MediumBugs-17-18-19-20-21-22.test.ts` — CursorCodec concurrency (3 tests), IntrospectionResource filter safety (1 test), SemanticProbe batch resilience (3 tests), ToolContract fingerprint accuracy (3 tests), CapabilityLockfile dedup (2 tests), ServerAttachment ctx isolation (3 tests).
- **Updated** 2 existing IntrospectionIntegration tests to align with the new filter-skip behavior (Bug #18).
- **Updated** ManifestCompiler test helper to include new `presenterStaticRules` field.

## [3.1.8] - 2026-03-05

### Fixed

- **Tools registered after `enableDebug()`/`enableTracing()` are not instrumented (Bug #12)** — `enableDebug()`, `enableTracing()`, and `enableTelemetry()` only iterated currently registered builders. New builders added via `register()` were never instrumented. Fixed by adding `_propagateObservability()` called from `register()`, and storing the telemetry sink in `_telemetrySink`.

- **`FluentSchemaHelpers.default()` is text-only — doesn't mark field as optional (Bug #13)** — `.default(value)` on FluentString/FluentNumber/FluentBoolean only appended `(default: ...)` to the description text. The LLM would see "default: 10", omit the field, and Zod validation would fail. Fixed by auto-setting `_optional = true` when `.default()` is called.

- **PostProcessor regex doesn't match `<domain_rules>` format (Bug #14)** — The telemetry regex searched for `[SYSTEM_RULES]` but ResponseBuilder now emits rules inside `<domain_rules>` XML tags. Rules were never captured for telemetry. Fixed regex to `/<domain_rules>\n([\s\S]*?)\n<\/domain_rules>/`.

- **`TelemetryBus` SIGINT/SIGTERM handlers prevent process termination (Bug #15)** — Using `process.on('SIGINT')` replaced the default termination behavior. The exit handler only called `cleanup()` but never terminated the process. Fixed by using `process.once()` and re-emitting the signal via `process.kill(process.pid, signal)` after cleanup.

- **`SandboxGuard` accepts async functions that silently produce empty results (Bug #16)** — The sandbox wraps code with `JSON.stringify(__fn__(__input__))`. For async functions, `__fn__()` returns a Promise, and `JSON.stringify(promise)` produces `'{}'`. Fixed by adding `/^\s*async\b/` to `SUSPICIOUS_PATTERNS` with a descriptive error explaining why async is not supported.

### Test Suite

- **22 new regression tests** in `MediumBugs-12-13-14-15-16.test.ts` — ToolRegistry late-registration propagation (5 tests), FluentSchemaHelpers default-to-optional (6 tests), PostProcessor regex (4 tests), TelemetryBus signal handling (1 test), SandboxGuard async rejection (6 tests).
- **Updated** existing SandboxGuard tests to expect async rejection (3 tests corrected).
- **Updated** DebugObserver test to expect late-registered tools to receive debug events.

## [3.1.7] - 2026-03-05

### Fixed

- **`Group.addChildGroup()` does not remove child from previous parent (Bug #7)** — When a child group was re-parented, it was added to the new parent but never removed from the old one, creating an inconsistent tree where the child appeared under two parents simultaneously. Fixed by calling `childGroup.parent.removeChildGroup(childGroup)` before adding to the new parent.

- **`timingSafeCompare` leaks timing information via early return (Bug #8)** — The function returned immediately when the two strings had different lengths, leaking timing information. Although HMACs always have the same length, the function violated its own constant-time contract. Fixed by removing the early return and using a `Math.max(len)` loop with XOR accumulation seeded with `bufA.length ^ bufB.length`.

- **`autoValidator()` silently mishandles async validators (Bug #9)** — If an async validator was passed via `autoValidator()`, `spec.validate(value)` returned a `Promise`. Since `'value' in promise` is `false`, the result silently became `{ success: false, issues: undefined }`. Fixed by adding a `typeof result.then === 'function'` guard that throws a descriptive error with the vendor name.

- **`mergeHooks` discards secondary `wrapResponse` return value (Bug #10)** — When both primary and secondary hooks defined `wrapResponse`, the secondary was called but its return value was discarded. Fixed: `return secondary.wrapResponse?.(wrapped) ?? wrapped;`.

- **`.tags()` replaces vs. accumulates inconsistently between builders (Bug #11)** — `GroupedToolBuilder.tags()` used assignment (`this._tags = tags`) replacing all tags, while `FluentToolBuilder.tags()` used push. Fixed `GroupedToolBuilder.tags()` to use `this._tags.push(...tags)` for consistent accumulation.

- **JWT test: signature corruption in padding bits (test fix)** — The `rejects token with unicode in signature` test corrupted only the last base64url character of an HMAC-SHA256 signature. For 32-byte digests the last character has 2 padding bits, so swapping between certain characters (e.g. A↔B) produces identical decoded bytes. Fixed by corrupting a middle character instead.

### Test Suite

- **6 new regression tests** in `Group.reparenting-bug7.test.ts` — Re-parenting removes from old parent, childGroups length updates, child never in two parents, getRoot() after re-parent, same-child no-op, null parent works.
- **17 new regression tests** in `MediumBugs-8-9-10-11.test.ts` — Timing-safe comparison (5 tests), async validator guard (3 tests), wrapResponse chaining (4 tests), tags accumulation for GroupedToolBuilder (4 tests) and FluentToolBuilder consistency (1 test).

## [3.1.6] - 2026-03-05

### Fixed

- **Race condition: concurrent requests share mutable FSM state (Bug #3)** — The `StateMachineGate` instance was shared across all concurrent requests. In serverless/edge deployments, two simultaneous requests could interleave `restore()` → `transition()` → `save()`, corrupting the FSM state. Fixed by adding a `clone()` method to `StateMachineGate` that creates an independent copy with the same config and bindings but isolated mutable state. The `createToolListHandler` and `createToolCallHandler` in `ServerAttachment` now clone the FSM per-request when `fsmStore` is present.

- **Underscore parsing breaks Inspector topology (Bug #4)** — `startServer.ts` split flat tool names by `'_'` to extract group/action for the telemetry bus topology. For a tool named `user_accounts_list`, this produced `group = "user"` and `action = "accounts_list"` — incorrect. Fixed by using `builder.getName()` directly as the group and `actionKey` as the action, eliminating the naive underscore split.

- **Same underscore split bug in telemetry route events (Bug #5)** — `ServerAttachment.ts` used `name.split('_')` in the telemetry route event emission, producing incorrect group/action attribution for tools with underscores in their names. Fixed by resolving group/action from the exposition routing map (`flatRoute.builder.getName()` and `flatRoute.actionKey`).

- **`createGroup.execute()` throws exceptions instead of returning `ToolResponse` (Bug #6)** — The function threw `Error` for unknown actions and `ZodError` for validation failures, but the signature promises `Promise<ToolResponse>`. Callers without try-catch would get unhandled exceptions, potentially crashing the MCP server. Fixed by returning `toolError()` with code `INVALID_PARAMS` for unknown actions and using `safeParse()` to return validation errors as `ToolResponse` with `isError: true` and detailed issue descriptions.

- **`schema.strict()` re-allocated on every `execute()` call (Bug #23)** — `schema.strict()` returns a new `ZodObject` on each invocation. Strict schemas are now pre-computed at group creation time in a `strictSchemaMap`.

### Test Suite

- **8 new regression tests** in `StateMachineGate.concurrency-bug3.test.ts` — Simulates actual serverless race conditions with concurrent restore/transition/save on shared vs cloned gates, verifies clone isolation, binding deep-copy, visibility, snapshots, callbacks, and dispose independence.
- **10 new regression tests** in `StateMachineGate.clone-regression.test.ts` — Tests clone independence, state mutation isolation, restored state preservation, binding/event preservation, concurrent session simulation, snapshot independence, tool visibility, uninitialized clone safety, and rapid parallel clones.
- **10 new regression tests** in `UnderscoreParsing.bug4-5.test.ts` — Demonstrates naive split vs routing map for multi-underscore names, topology map correctness with `getName()`, telemetry event attribution, action-with-underscores edge case, dot separator, and fallback behavior.
- **7 new regression tests** in `UnderscoreParsing.regression.test.ts` — Routing map group resolution, multi-underscore names, simple names, naive split comparison, topology map, dot separator, and fallback.
- **12 new regression tests** in `CreateGroup.contractCompliance-bug6.test.ts` — Verifies execute() never throws for input errors, returns isError ToolResponse for unknown actions/validation failures, includes field paths and available actions, strict schema enforcement, handler runtime errors still propagate, and empty group edge case.
- **8 new regression tests** in `CreateGroup.errorHandling-regression.test.ts` — Unknown action error response, Zod validation failure response, wrong field type, strict schema unknown fields, successful execution, field path inclusion, available actions listing, and handler error propagation.

---

## [3.1.5] - 2026-03-05

### Fixed

- **`StateMachineGate.restore()` loses restored state in serverless/edge environments** — `restore()` set `_currentState` but never synchronized with the XState actor. When `transition()` was called next, `init()` created the actor from `config.initial` (the default state), and the actor's subscription callback overwrote `_currentState` back to the initial state, silently discarding the restored state. Fixed by making `init()` create the machine with `_currentState` when it differs from `config.initial`, and having `restore()` stop any running actor and mark as uninitialized so the next transition re-creates the machine from the restored state.

- **`DevServer.performReload` passes empty object as registry — crash on HMR reload** — The HMR reload called `await setup({} as ToolRegistryLike)`. The empty object `{}` has no `register()` method, so any setup callback calling `registry.register(builder)` threw `TypeError: registry.register is not a function`. Fixed by replacing the empty object with a proper duck-typed registry implementing `register()` and `getBuilders()`.

### Test Suite

- **10 new regression tests** in `StateMachineGate.restore-regression.test.ts` — Covers restore-before-init, restore-after-init, multiple restore cycles, tool visibility after restore, callbacks after restore, linear pipeline restore, and concurrent session simulation. Uses XState mock to reproduce the exact actor subscription bug.
- **8 new regression tests** in `DevServer.reload-regression.test.ts` — Covers register() invocation during reload, builder collection, fresh registry per reload (no leaks), various builder types, error handling after registrations, async setup, and MCP notification on success/failure.

---

## [3.1.4] - 2026-03-02

### Improved

- **Grouped tool descriptions now include dispatch instructions** — AI agents seeing a grouped tool (e.g., `users` with actions `get_me`, `get_me_top_artists`) now receive a clear instruction: `Select operation via the \`action\` parameter.` This fixes discoverability issues where AI clients could see the action names listed but didn't know they needed to pass `{ "action": "get_me_top_artists" }` to invoke a specific operation. Applies to both standard and TOON description generators.

---

## [3.1.3] - 2026-03-02

### Fixed

- **Enum vs non-enum field conflict blocks OpenAPI imports** — `assertFieldCompatibility()` threw when one action declared an enum for a field and another declared the same field as a plain string. In OpenAPI specs, this naturally occurs when the same parameter has constrained values in one endpoint and unconstrained in another. The non-enum declaration (superset) now wins — the enum constraint is dropped, widening the field to accept any value of the base type.

### Test Suite

- **3 updated tests** — enum-vs-string conflict tests now validate widening behavior

---

## [3.1.2] - 2026-03-02

### Fixed

- **Enum field conflict in grouped tools blocks OpenAPI imports** — `assertFieldCompatibility()` in `SchemaUtils` threw when two actions in the same `GroupedToolBuilder` shared a field name (e.g., `type`) with different enum value sets. Large OpenAPI specs like Spotify naturally have endpoints that share parameter names with different valid enum values (e.g., `type: ["artist","user"]` vs `type: ["track","album"]`). Enum values are now **merged (union)** instead of throwing a conflict error. Base type mismatches and enum-vs-non-enum conflicts still throw as before.

### Changed

- **`assertFieldCompatibility()` return type** — now returns `object | undefined` instead of `void`. Returns the merged JSON Schema property when enum values are merged, or `undefined` when no merge is needed.
- **`collectActionFields()` in `SchemaGenerator`** — applies the merged property returned by `assertFieldCompatibility()` to update the input schema with the union of all enum values.

### Test Suite

- **8 new tests** in `SchemaCollision.test.ts` (section 10: Enum Merge):
  - Two different enum sets merged into union
  - Deduplicate overlapping enum values
  - 3-way cumulative merge across 3+ actions
  - Identical enums preserved (no unnecessary merge)
  - Base type preserved in merged property
  - Enum vs non-enum still throws
  - Base type conflicts still throw
  - Runtime executes correctly after enum merge
- **2 updated tests** — existing enum conflict tests now validate merge behavior instead of throw

---

## [3.1.1] - 2026-03-02

### Fixed

- **Flat exposition `_default` suffix on single-action builders** — `compileFlat()` in `ExpositionCompiler` was unconditionally appending `_{actionKey}` to every flat tool name, producing names like `get_pet_findByStatus_default` for standalone `f.query()` / `f.mutation()` / `f.action()` tools. Single-action builders with the `'default'` action key now use the bare tool name (e.g., `get_pet_findByStatus`). Multi-action builders and named single actions retain the `toolName_actionKey` format.

### Test Suite

- **3 new tests** in `ToolExposition.test.ts`:
  - Single-action builder uses bare tool name (no `_default` suffix)
  - Multi-action builder still produces `toolName_actionKey`
  - Routing dispatch map resolves single-action tools by bare name

---

## [3.0.1] - 2026-02-28

### 📦 Ecosystem — README Standardization & Inspector Publication

### Added

- **`@vinkius-core/mcp-fusion-inspector` v1.0.0 → v1.0.1** — Published to npm. Real-time terminal dashboard for MCP Fusion servers via Shadow Socket (IPC).

### Fixed

- **Scaffold test assertions** — Updated `create.e2e.test.ts` and `create.test.ts` to match current `startServer()` template (was `new Server()` / `StdioServerTransport`). File count 17 → 18. Removed outdated `prompts.size` check.
- **Inspector docs badge layout** — Badges now render inline instead of stacking vertically over the title.

### Changed

- **README standardization** — All 12 package READMEs follow the same layout: centered header (`<p align="center">`), HTML badges (npm, license, node), blockquote tagline, features table, code examples, peer dependencies, requirements.
- **Core README** — `packages/core/README.md` mirrors the root monorepo README for npmjs.com display.

### Ecosystem v1.0.1

All sub-packages bumped to 1.0.1 for README updates:
`mcp-fusion-api-key`, `mcp-fusion-aws`, `mcp-fusion-cloudflare`, `mcp-fusion-inspector`, `mcp-fusion-jwt`, `mcp-fusion-n8n`, `mcp-fusion-oauth`, `mcp-fusion-openapi-gen`, `mcp-fusion-prisma-gen`, `mcp-fusion-testing`, `mcp-fusion-vercel`.

---

## [@vinkius-core/mcp-fusion-jwt v1.0.0] - 2026-02-28

### 🔐 JWT Verification — Standards-Compliant Token Validation

Drop-in JWT verification middleware for MCP servers. Verifies tokens using `jose` when installed (RS256, ES256, JWKS auto-discovery) or falls back to native Node.js `crypto` for HS256 — zero external dependencies required.

### Added

- **`JwtVerifier` class** — core verification engine:
  - HS256 native fallback using `crypto.createHmac` + `crypto.timingSafeEqual`
  - jose lazy-loading for RS256, ES256, JWKS endpoint support
  - Claims validation: `exp`, `nbf`, `iss` (string/array), `aud` (string/array), `requiredClaims`
  - Configurable `clockTolerance` (default: 60s)
  - `verify(token)` → payload or null
  - `verifyDetailed(token)` → `{ valid, payload?, reason? }`
  - Static utilities: `decode()` (no verification), `isExpired()`
- **`requireJwt()` middleware factory** — blocks unauthenticated requests with `toolError('JWT_INVALID')` and self-healing recovery hints
  - Extracts from `ctx.token`, `ctx.jwt`, `Authorization` header (Bearer prefix auto-strip)
  - `onVerified` callback for context injection
  - Custom `extractToken`, `errorCode`, `recoveryHint`, `recoveryAction`
- **`createJwtAuthTool()` factory** — pre-built MCP tool with `verify` and `status` actions
- **36 tests** across JwtVerifier and middleware

### Documentation

- `docs/jwt.md` — architecture diagram, verification strategies, claims validation, middleware usage, standalone usage, API reference, types
- SEO entry with title, description, and 5 FAQs
- VitePress sidebar entry under Data Connectors

---

## [@vinkius-core/mcp-fusion-api-key v1.0.0] - 2026-02-28

### 🔑 API Key Validation — Timing-Safe Key Management

Timing-safe API key validation for MCP servers. Supports static key sets, SHA-256 hash comparison, and async validators (database lookup). **Zero external dependencies** — uses native Node.js `crypto`.

### Added

- **`ApiKeyManager` class** — core validation engine:
  - Static key set: pre-hashed at construction, timing-safe SHA-256 comparison
  - Hash-based storage: `hashKey()` for safe DB storage, `matchKey()` for comparison
  - Async validator: `(key) => Promise<{ valid, metadata?, reason? }>` for DB/API lookups
  - Prefix validation and minimum length enforcement
  - Key generation: `generateKey({ prefix, length })` with `crypto.randomBytes`
- **`requireApiKey()` middleware factory** — blocks unauthenticated requests with `toolError('APIKEY_INVALID')` and self-healing recovery hints
  - Extracts from `ctx.apiKey`, `x-api-key` header, `Authorization` header (`ApiKey`/`Bearer` prefix)
  - `onValidated` callback with key metadata
  - Custom `extractKey`, `errorCode`, `recoveryHint`, `recoveryAction`
- **`createApiKeyTool()` factory** — pre-built MCP tool with `validate` and `status` actions
- **41 tests** across ApiKeyManager and middleware

### Documentation

- `docs/api-key.md` — architecture diagram, validation strategies, key management utilities, middleware usage, API reference, types
- SEO entry with title, description, and 5 FAQs
- VitePress sidebar entry under Data Connectors

---

## [2.15.0] - 2026-02-28

### 🧠 FSM State Gate — Temporal Anti-Hallucination Engine

The first framework where it is **physically impossible** for an AI to execute tools out of order. Powered by XState v5, the FSM State Gate dynamically controls tool visibility at the `tools/list` protocol level based on finite state machine state — the LLM literally cannot call a tool that doesn't exist in its tool list.

Three complementary anti-hallucination layers:
- **Layer 1 — Format**: Zod validates input shape
- **Layer 2 — Guidance**: `suggestActions` (HATEOAS) recommends next tool — LLM can ignore
- **Layer 3 — Gate**: FSM State Gate physically removes tools — LLM **cannot** call them

### Added

- **`StateMachineGate` module** (`src/fsm/StateMachineGate.ts`) — core FSM engine:
  - `StateMachineGate(config)` — creates FSM from XState v5-compatible config
  - `bindTool(name, states, event?)` — bind tool to FSM states with optional auto-transition
  - `isToolAllowed(name)` — check tool visibility in current state
  - `getVisibleToolNames(allTools)` — filter tool list by current FSM state
  - `transition(event)` — advance FSM state, returns `TransitionResult`
  - `onTransition(callback)` — register callback for `notifications/tools/list_changed`
  - `snapshot()` / `restore()` — persist/restore state for serverless deployments
  - `dispose()` — cleanup resources
  - `initFsmEngine()` — optional boot-time XState pre-loading
  - Lazy `import('xstate')` with manual fallback when XState is not installed
- **`.bindState(states, transition?)` on FluentToolBuilder** — declarative tool-to-state binding
- **`.bindState(states, transition?)` on GroupedToolBuilder** — with `getFsmBinding()` / `getToolName()` metadata accessors
- **`f.fsm(config)` factory** on `initFusion()` — creates `StateMachineGate` instances
- **ServerAttachment integration**:
  - `tools/list` filtered by `gate.isToolAllowed()` — tools physically removed from response
  - `tools/call` auto-transition on successful execution only (`!result.isError` guard)
  - `fsmStore` for serverless/edge persistence (load/save with `Mcp-Session-Id`)
  - `notifications/tools/list_changed` emitted on state change
  - `autoBindFsmFromBuilders()` — auto-register `.bindState()` metadata from builders
- **`FsmStateStore` interface** — `load(sessionId)` / `save(sessionId, snapshot)` for Redis, KV, Durable Objects
- **`xstate` as optional peer dep** — `^5.0.0` in `peerDependencies` + `peerDependenciesMeta`
- **`xstate.d.ts`** — ambient type declaration for dynamic import
- **Barrel exports** — `StateMachineGate`, `initFsmEngine`, `FsmConfig`, `FsmSnapshot`, `FsmStateStore`, `TransitionResult`

### Documentation

- **`docs/fsm-state-gate.md`** — comprehensive documentation (~300 lines): three-layer thesis, architecture diagram, execution flow, installation, 3-step Quick Start, `.bindState()` API, serverless/edge deployment with `fsmStore`, `suggestActions` complementarity, boot-time initialization, standalone usage, best practices, full API reference
- **VitePress sidebar** — "FSM State Gate" under Core Framework section
- **SEO** — title, meta description, and 7 FAQ entries for Google rich snippets
- **`llms.txt`** — FSM State Gate in Core Concepts, FluentToolBuilder table, and dedicated 39-line section
- **Keywords** — `fsm`, `state-machine`, `anti-hallucination` added to `package.json`

### Test Suite

- **54 unit tests** in `StateMachineGate.test.ts` — constructor, bindTool, isToolAllowed, transitions, callbacks, snapshot/restore, dispose, FluentToolBuilder propagation, GroupedToolBuilder, integration workflow, edge cases
- **68 advanced edge-case tests** in `StateMachineGate.edge.test.ts` — Anthropic-QA-level coverage:
  - Concurrency (parallel `Promise.all` transitions, 300 rapid cycles)
  - Callback exception safety (throwing callbacks don't corrupt state)
  - Dispose lifecycle (idempotent dispose, use-after-dispose)
  - Snapshot integrity (corruption resistance, immutability, JSON round-trip)
  - Self-loop transitions, unsubscribe idempotency
  - Large FSM stress (50 states, 100 tools, 1000 snapshot cycles)
  - Diamond/cyclic FSMs, init idempotency
  - Exhaustive state matrix (visibility per state)
  - Serverless multi-session isolation
  - Error/success path simulation
  - Property-based invariants
- **Full regression suite**: 3,797 tests passed across 138 files — zero regressions

## [2.14.0] - 2026-02-28

### 🛡️ DLP Compliance Engine — Zero-Leak PII Redaction (GDPR / LGPD / HIPAA)

MCP Fusion now structurally masks Personally Identifiable Information before it reaches the LLM. Powered by `fast-redact` — the same V8-compiled engine behind Pino — the framework guarantees zero-leak at the wire level. Once `.redactPII()` is configured, it is **physically impossible** for a developer to accidentally expose sensitive data through the MCP JSON-RPC payload.

### Added

- **`RedactEngine` module** (`src/presenter/RedactEngine.ts`) — core DLP engine:
  - `compileRedactor(config)` — compiles `fast-redact` paths into a V8-optimized function at configuration time
  - `initRedactEngine()` — optional boot-time pre-loading for first-call latency elimination
  - Lazy dynamic `import('fast-redact')` with graceful fallback when not installed
  - Follows the existing `JsonSerializer` pattern for optional peer dependencies
- **`Presenter.redactPII(paths, censor?)`** — fluent method to configure PII redaction paths
  - `.redact()` alias for ergonomic use
  - Supports string censors (`'[REDACTED]'`, `'***'`) and function censors (`(v) => '****-' + String(v).slice(-4)`)
  - Default censor: `'[REDACTED]'`
- **Late Guillotine Pattern** — redaction applied via `structuredClone()` **after** UI blocks and system rules see full data
  - UI formatting logic can reference sensitive fields without exposing them
  - Only the final wire payload is sanitized
- **`definePresenter()` integration** — `redactPII: { paths, censor }` config field for declarative API
- **`fast-redact` as optional peer dependency** — install only on servers that handle PII
- **`fast-redact.d.ts`** — ambient type declaration for dynamic import
- **Path syntax** — dot notation, bracket notation, wildcards (`*.ssn`), array items (`patients[*].diagnosis`)

### Documentation

- **`docs/dlp-redaction.md`** — full documentation page (~350 lines): architecture diagrams, Late Guillotine pattern, installation, Quick Start (fluent + declarative), custom censors, path syntax reference, boot-time initialization, standalone usage, GDPR/LGPD/HIPAA compliance matrices, integration with Sandbox Engine and AOT Serialization, best practices, API reference
- **VitePress sidebar** — "DLP Redaction — GDPR" under Core Framework section
- **SEO** — title, meta description, and 7 FAQ entries for Google rich snippets
- **Keywords** — `dlp`, `compliance`, `pii-redaction` added to `package.json`

### Test Suite

- **26 new tests** in `RedactEngine.test.ts`:
  - RedactEngine unit (10 tests): flat field, custom string/function censor, wildcards, array wildcards, empty paths, missing target, primitives, immutability, initRedactEngine
  - Presenter integration (11 tests): flat/nested redaction, custom censors, array items, Late Guillotine (UI blocks + system rules), .redact() alias, chaining, untyped schema, sealed check, missing field
  - Declarative API (2 tests): definePresenter with redactPII config, custom censor
  - E2E (1 test): full pipeline with schema + rules + ui + redact + agentLimit

## [2.13.1] - 2026-02-28

### 🛡️ Connection Watchdog — AbortSignal Kill-Switch for V8 Isolates

When a user closes their MCP client mid-request, the TCP connection dies but Node.js doesn't know. The sandbox keeps running an expensive computation that nobody will ever read, leaking CPU and native memory. The Connection Watchdog solves this with an instant kill-switch.

### Added

- **`AbortSignal` support in `SandboxEngine.execute()`** — new optional `{ signal: AbortSignal }` parameter
  - **Pre-flight check** — already-aborted signals skip all V8 allocation and return `ABORTED` immediately (zero overhead)
  - **Mid-execution kill** — abort listener calls `isolate.dispose()` during V8 execution, killing C++ threads instantly
  - **Error classification** — aborts are correctly classified as `ABORTED` (not `MEMORY`), distinguishing intentional kills from OOM
  - **Listener cleanup** — abort listener removed in `finally` block to prevent memory leaks
  - **Auto-recovery** — `_ensureIsolate()` detects disposed isolates and creates a fresh one on the next `execute()` call
- **`ABORTED` error code** — new `SandboxErrorCode` value for client disconnection scenarios
- **Backward compatibility** — `execute()` without signal works exactly as before

### Fixed

- **Dead parameter removed** — `_classifyError` received `executionMs` but never used it (code smell)
- **ASCII diagram updated** — module JSDoc now reflects the abort step, new `execute()` signature, and `signal.removeEventListener()` in finally block
- **`console.log` test fix** — V8 >= 12.x defines `console` as a built-in; test updated to assert `undefined` return instead of `ReferenceError`

### Documentation

- **`docs/sandbox.md`** — full Connection Watchdog section with diagrams, usage, error classification, and guarantees table. Architecture diagram updated with abort step. API reference updated with new `execute()` signature. `ABORTED` error code added to error table.
- **`seo.ts`** — 2 new FAQs: "What is the Connection Watchdog?" and "How does AbortSignal integration work?"
- **`llms.txt`** — new Zero-Trust Sandbox Engine section with full API, error codes, and Connection Watchdog description

### Test Suite

- **`SandboxAbortSignal.test.ts`** — 24 new tests covering:
  - Pre-flight abort (4 tests): immediate return, no V8 allocation, recovery after abort, abort wins over guard
  - Mid-execution kill-switch (3 tests): infinite loop kill, abort beats timeout, event loop not blocked
  - Auto-recovery (3 tests): single recovery, signal on recovered engine, multiple abort-recovery cycles
  - Listener cleanup (3 tests): cleanup after success, cleanup after error, no leaks across 50 calls
  - Backward compatibility (4 tests): no signal, undefined options, empty options, undefined signal
  - Edge cases (5 tests): late abort no-op, disposed engine + signal, invalid code + abort, null data, double abort
  - Pointer lifecycle (2 tests): native memory after abort, memory across multiple abort cycles
- **138 tests** passing (1 skipped), 6 test files — zero regressions

## [2.13.0] - 2026-02-28

### 🔒 Zero-Trust Sandbox Engine — V8 Isolate for Computation Delegation

LLMs can now send JavaScript functions to be executed in a sealed V8 isolate on the server. The data stays on the client's machine — only the computed result crosses the boundary. Powered by `isolated-vm`.

### Added

- **`SandboxEngine`** — V8 isolate engine with configurable timeout, memory limit, and output size cap
  - `execute<T>(code, data)` — runs LLM-generated JavaScript in a pristine, empty V8 Context
  - `dispose()` — releases native C++ memory (mandatory)
  - Automatic isolate recovery after OOM kills
  - One Isolate per engine (reused), new Context per call (pristine)
- **`SandboxConfig`** — `{ timeout: 5000, memoryLimit: 128, maxOutputBytes: 1_048_576 }`
- **`SandboxResult<T>`** — discriminated union: `{ ok: true, value, executionMs }` | `{ ok: false, error, code }`
- **`SandboxErrorCode`** — `TIMEOUT | MEMORY | SYNTAX | RUNTIME | OUTPUT_TOO_LARGE | INVALID_CODE | UNAVAILABLE`
- **`validateSandboxCode()`** — fail-fast syntax checker (not a security boundary)
- **`FluentToolBuilder.sandboxed(config?)`** — enables sandbox + HATEOAS auto-prompting on any tool
- **`f.sandbox(config?)`** — factory method on `initFusion()` instance
- **`SANDBOX_SYSTEM_INSTRUCTION`** — auto-injected tool description for LLM guidance
- **V8 Security Model** — empty Context: no process, require, fs, net, setTimeout, Buffer, fetch, eval

### Documentation

- **`docs/sandbox.md`** — full documentation: architecture, installation, quick start (Fluent API + Standalone + Factory), configuration, result type, error codes, V8 engineering rules, security model, attack vector table, SandboxGuard, HATEOAS auto-prompting, best practices, API reference
- **`seo.ts`** — 7 FAQs for sandbox page
- **`llms.txt`** — Sandbox Engine API reference

### Test Suite

- **114 sandbox tests** across 5 test files:
  - `SandboxEngine.test.ts` — execution, security, timeout, output size, error classification, lifecycle
  - `SandboxEdgeCases.test.ts` — 53 adversarial tests
  - `SandboxPointers.test.ts` — native C++ memory lifecycle
  - `FluentSandbox.test.ts` — Fluent API integration
  - `SandboxGuard.test.ts` — fail-fast syntax validation

## [@vinkius-core/mcp-fusion-vercel@1.0.0] - 2026-02-27

### 🚀 Vercel Adapter — Serverless & Edge Deployment in One Line

New `@vinkius-core/mcp-fusion-vercel` package. Deploys any MCP Fusion ToolRegistry to Vercel Functions (Edge or Node.js) with zero configuration. Returns a POST handler compatible with Next.js App Router route handlers and standalone Vercel Functions. Stateless JSON-RPC via the MCP SDK's native `WebStandardStreamableHTTPServerTransport`.

### Added

- **`vercelAdapter<TContext>(options)`** — creates a Vercel-compatible POST handler from a pre-compiled `ToolRegistry`
  - `contextFactory(req)` — creates per-request context from the Request object (use `process.env` for environment variables)
  - `enableJsonResponse: true` — stateless JSON-RPC, no SSE, no session state
  - Ephemeral `McpServer` per request — isolates concurrent invocations
  - Cold-start caching — Zod reflection, Presenter compilation, and schema generation happen once at module scope
  - **Dual Runtime** — works on both Vercel Edge Runtime (V8) and Node.js Runtime
- **`VercelAdapterOptions<TContext>`** — full typed configuration interface
- **`VercelHandler`** — `(req: Request) => Promise<Response>` type alias
- **`RegistryLike`** — duck-typed interface for `ToolRegistry` (decoupled from core import)

### Documentation

- **`docs/vercel-adapter.md`** — full documentation page: deployment pain points, plug-and-play solution, architecture diagram, step-by-step setup, Edge vs Node.js comparison, Vercel services integration (Postgres, KV, Blob), middleware, Presenters, config reference, compatibility matrix
- **VitePress sidebar** — Vercel entry under Adapters section
- **`llms.txt`** — Vercel Adapter API reference with usage example
- **SEO** — 7 FAQs with structured data for search optimization

### Test Suite

- **27 tests** — handler creation, method rejection (GET/PUT/DELETE → 405), McpServer configuration (defaults and overrides), transport enableJsonResponse, registry wiring and attachOptions forwarding, context factory invocation and injection, request lifecycle ordering (connect → handle → close), cleanup on error, request isolation, edge cases

## [@vinkius-core/mcp-fusion-cloudflare@1.0.0] - 2026-02-27

### ☁️ Cloudflare Workers Adapter — Edge Deployment in One Line

New `@vinkius-core/mcp-fusion-cloudflare` package. Deploys any MCP Fusion ToolRegistry to Cloudflare Workers with zero configuration. Stateless JSON-RPC via the MCP SDK's native `WebStandardStreamableHTTPServerTransport` — no SSE sessions, no transport bridging, no polyfills. Registry compiles at cold start; warm requests only instantiate `McpServer` + `Transport`.

### Added

- **`cloudflareWorkersAdapter<TEnv, TContext>(options)`** — creates a Cloudflare Workers `fetch()` handler from a pre-compiled `ToolRegistry`
  - `contextFactory(req, env, ctx)` — injects Cloudflare bindings (D1, KV, R2, secrets, `ExecutionContext`) into handler context
  - `enableJsonResponse: true` — stateless JSON-RPC, no SSE, no session state
  - Ephemeral `McpServer` per request — isolates concurrent invocations
  - Cold-start caching — Zod reflection, Presenter compilation, and schema generation happen once at module scope
- **`CloudflareAdapterOptions<TEnv, TContext>`** — full typed configuration interface
- **`CloudflareWorkerHandler<TEnv>`** — Workers ES Modules `fetch()` signature
- **`RegistryLike`** — duck-typed interface for `ToolRegistry` (decoupled from core import)
- **`ExecutionContext`** — inline Cloudflare Workers types (no `@cloudflare/workers-types` dependency)

### Documentation

- **`docs/cloudflare-adapter.md`** — full documentation page: deployment pain points, plug-and-play solution, architecture diagram (cold start vs warm request), step-by-step setup with D1/KV, middleware and Presenter at the edge, configuration reference, edge compatibility matrix
- **VitePress sidebar** — new "Adapters" section with Cloudflare Workers entry
- **`llms.txt`** — Cloudflare Workers Adapter API reference with usage example

## [2.11.1] - 2026-02-27

### 🧪 Introspection Test Coverage — 122 New Unit Tests

Dedicated unit test coverage for 4 previously untested introspection modules. Total test count: 566 tests, 11 test files, 0 failures in the introspection suite.

### Added

- **`CryptoCanonical.test.ts`** (32 tests) — `sha256` (determinism, known test vectors, Unicode, large input, empty string), `canonicalize` (key sorting, nested objects, arrays, primitives, insertion-order independence), HMAC signer (sign/verify roundtrip, wrong secret rejection), attestation roundtrip
- **`EntitlementScanner.test.ts`** (42 tests) — `scanSource` (CJS/ESM/node: imports, fetch/exec/eval detection), evasion heuristics (`String.fromCharCode`, bracket-notation, dynamic import, entropy), `buildEntitlements`, `validateClaims` (readOnly + write violations, readOnly + network warnings), `scanAndValidate`
- **`ManifestCompiler.test.ts`** (17 tests) — `compileManifest` (single/multi builder, action metadata, presenters), `cloneManifest` (deep independence), mock `ToolBuilder` interface
- **`TokenEconomicsUnit.test.ts`** (31 tests) — `estimateTokens` (token estimation heuristic, scaling), `profileBlock`/`profileResponse` (risk classification), `computeStaticProfile` (bounded/unbounded), `aggregateProfiles`

### Test Suite

- **566 tests** passing in introspection suite (11 test files) — 122 new tests added

## [2.8.1] - 2026-02-26

### 🛡️ Hardened Blast Radius — Code Evaluation Detection & Anti-Evasion Heuristics

Multi-layer defense upgrade for the EntitlementScanner. The regex-based pattern library was intentionally conservative but blind to `eval()`, dynamic `require()`, and obfuscated code. Any actor aware of the regex patterns could bypass detection. This release closes that gap with three complementary detection layers.

### Added

- **Code Evaluation Category** — new `codeEvaluation` entitlement category with 14 detection patterns:
  - `eval()`, indirect eval `(0, eval)()`, `globalThis.eval()`
  - `new Function()`, `Reflect.construct(Function, ...)`
  - `vm` module: `runInNewContext`, `runInThisContext`, `compileFunction`, `new vm.Script`
  - `process.binding()`, `process.dlopen()`
  - Code evaluation always produces `error` severity — blast radius is unbounded
  - `readOnly: true` + `codeEvaluation` is always an error, even with `allowed: ['codeEvaluation']`

- **Evasion Heuristic Detection** — `scanEvasionIndicators()` detects techniques used to bypass static analysis:
  - **String construction**: `String.fromCharCode()`, `String.raw`, `atob()`, `Buffer.from(…, 'base64')`
  - **Indirect access**: `globalThis['eval']`, `globalThis['ev'+'al']`, `process['binding']`
  - **Computed imports**: `require(variable)`, `import(variable)` — non-literal module names
  - **Encoding density**: high ratio of `\x??`/`\u????` escapes in source
  - **Entropy anomaly**: Shannon entropy > 5.0 in string literals (statistically unlikely in normal code)
  - Three confidence levels: `high` (makes handler UNSAFE), `medium`, `low`

- **`EvasionIndicator` type** — structured evasion report with `type`, `confidence`, `description`, `context`, `line`
- **`EvasionType`** — `'string-construction' | 'indirect-access' | 'computed-import' | 'encoding-density' | 'entropy-anomaly'`
- **`EntitlementReport.evasionIndicators`** — evasion indicators included in full scan reports
- **`HandlerEntitlements.codeEvaluation`** — new boolean flag across `ToolContract`, `BehaviorDigest`, `ContractDiff`, `CapabilityLockfile`
- **`LockfileEntitlements.codeEvaluation`** — lockfile captures code evaluation entitlement
- **`ContractDiff`** — gaining `codeEvaluation` is a `BREAKING` severity change

### Changed

- `EntitlementReport.safe` now considers both error-severity violations AND high-confidence evasion indicators
- `EntitlementReport.summary` includes evasion indicator count when present
- `EntitlementCategory` union expanded: `'filesystem' | 'network' | 'subprocess' | 'crypto' | 'codeEvaluation'`

### Documentation

- [Blast Radius docs](docs/governance/blast-radius.md) rewritten with defense-in-depth architecture, evasion heuristics section, `EvasionIndicator` API reference, adversarial examples
- [Governance index](docs/governance/index.md) updated: lockfile example includes `codeEvaluation`, blast radius description updated

### Test Suite

- **43 new hardened tests** covering code evaluation detection, evasion heuristics, adversarial evasion scenarios, and contract diff integration
- **2630 total tests**, 0 failures, 109 test files

## [2.8.0] - 2026-02-26

### 🛡️ Governance Stack — Deterministic Contract Auditing, Behavioral Fingerprinting & CI Lockfile Gating

8-module governance layer for compile-time and runtime introspection of MCP server behavioral surfaces. Addresses gaps in contract auditability, drift detection, blast-radius analysis, and token cost profiling — originally identified by [@jordanstarrk](https://github.com/jordanstarrk).

### Added

- **Tool Contract Materialization**
  - `materializeContract(builder)` → `ToolContract` — extracts the full behavioral surface: schema, entitlements, cognitive guardrails, token economics, and SHA-256 integrity digest
  - `compileContracts(builders)` → `ToolContract[]` — batch materialization for all registered builders
  - `ToolContract`, `ToolSurface`, `ActionContract`, `ToolBehavior`, `CognitiveGuardrailsContract`, `TokenEconomicsProfile`, `HandlerEntitlements` types

- **Contract Diffing**
  - `diffContracts(before, after)` → `ContractDiffResult` — semantic structural diff with severity classification (`BREAKING`, `RISKY`, `SAFE`, `COSMETIC`)
  - `formatDiffReport(result)` → human-readable diff report
  - `formatDeltasAsXml(deltas)` → injection-safe XML for agent consumption
  - 7 delta categories: `schema`, `behavior`, `security`, `guardrails`, `performance`, `entitlements`, `tool-lifecycle`

- **Behavioral Fingerprinting (SHA-256)**
  - `computeDigest(contract)` → `BehaviorDigestResult` — deterministic behavioral fingerprint via canonicalized JSON + SHA-256
  - `computeServerDigest(contracts)` → `ServerDigest` — aggregate server-wide digest
  - `compareServerDigests(a, b)` → `DigestComparison` — drift detection with added/removed/changed tool lists

- **Capability Lockfile (`mcp-fusion.lock`)**
  - `generateLockfile(options)` — captures tools, prompts, digests, entitlements, token economics in a git-diffable JSON lockfile
  - `checkLockfile(current, stored)` → `LockfileCheckResult` — structural comparison with detailed diff messages
  - `writeLockfile()` / `readLockfile()` / `parseLockfile()` / `serializeLockfile()` — full I/O lifecycle
  - Prompt lockfile support: argument schemas, tags, hydration timeout

- **Zero-Trust Cryptographic Attestation**
  - `createHmacSigner(secret)` → HMAC-SHA-256 signer
  - `attestServerDigest(digest, signer)` → `AttestationResult` — signed digest with timestamp + nonce
  - `verifyAttestation()` / `verifyCapabilityPin()` — signature and digest pin verification
  - `buildTrustCapability()` → MCP capability payload for trust negotiation
  - `AttestationError` class for verification failures

- **Token Economics Profiling**
  - `estimateTokens(text)` — GPT-4 heuristic token estimation
  - `profileResponse(response)` → `TokenAnalysis` — per-block token breakdown with risk classification
  - `computeStaticProfile(contract)` → `StaticTokenProfile` — schema-level cost estimate
  - `aggregateProfiles()` → `ServerTokenSummary` — server-wide token economics

- **Entitlement Scanner (Blast Radius)**
  - `scanSource(source)` — static analysis detecting filesystem, network, subprocess, and crypto API usage in handler source
  - `buildEntitlements(matches)` → `HandlerEntitlements` — aggregate into entitlement categories
  - `validateClaims(report, claims)` → `EntitlementViolation[]` — verify declared vs. actual capabilities
  - `scanAndValidate()` — combined scan + validation

- **Semantic Probing (LLM-as-Judge)**
  - `createProbe(config)` → `SemanticProbe` — contract-based semantic drift probes
  - `buildJudgePrompt()` / `parseJudgeResponse()` — LLM judge prompt generation and response parsing
  - `evaluateProbe()` / `evaluateProbes()` → batch evaluation with aggregate scoring
  - `DriftLevel` — `'none' | 'low' | 'medium' | 'high'`

- **Contract-Aware Self-Healing**
  - `enrichValidationError(error, contract)` — enriches validation errors with contract context for improved agent self-correction
  - `createToolEnhancer(contracts)` — pipeline-level error enhancer factory

- **Governance Observer (Observability Bridge)**
  - `createGovernanceObserver(config)` — wraps governance operations with `DebugEvent` emission (`type: 'governance'`) and optional OTel tracing spans
  - `createNoopObserver()` — zero-overhead passthrough for production
  - `GovernanceEvent` added to the `DebugEvent` discriminated union — `{ type: 'governance', operation, label, outcome, detail?, durationMs, timestamp }`
  - `GovernanceOperation` — 11 operation identifiers: `contract.compile`, `contract.diff`, `digest.compute`, `lockfile.generate`, `lockfile.check`, `lockfile.write`, `lockfile.read`, `attestation.sign`, `attestation.verify`, `entitlement.scan`, `token.profile`

- **CLI — `fusion lock`**
  - `fusion lock [--server <entrypoint>] [--name <serverName>]` — generate or update `mcp-fusion.lock`
  - `fusion lock --check [--server <entrypoint>]` — verify lockfile matches current server (CI gate, exits 0 or 1)
  - Composer/Yarn-style progress output with step timing and status icons
  - `bin.fusion` added to `package.json` — `npx fusion lock` works out of the box

### Fixed

- **[SECURITY] XML injection via `formatDeltasAsXml()`** — delta `description`, `path`, `before`, and `after` fields are now XML-escaped before interpolation into `<delta>` elements, preventing injection of arbitrary XML via crafted contract values

### Documentation

- **7 governance documentation pages** — `docs/governance/` section with index, contract-diffing, blast-radius, lockfile, observability integration, and cross-references
- **Observability docs updated** — `GovernanceEvent`, `GovernanceOperation`, `GovernanceObserver` API reference added to `docs/observability.md` and `docs/api-reference.md`
- **Documentation tone review** — all marketing/superlative language removed across 12+ files; replaced with technical, factual phrasing throughout

### Test Suite

- **428 new governance tests** across 8 test files:
  - `ToolContract.test.ts` — contract materialization, schema extraction, entitlements, guardrails
  - `ContractDiff.test.ts` — structural diffing, severity classification, XML output
  - `BehaviorDigest.test.ts` — SHA-256 fingerprinting, server digest comparison
  - `CapabilityLockfile.test.ts` — lockfile generation, serialization, checking, prompt support
  - `CryptoAttestation.test.ts` — HMAC signing, attestation verification, capability pin
  - `TokenEconomics.test.ts` — token estimation, response profiling, risk classification
  - `EntitlementScanner.test.ts` — source scanning, entitlement validation, blast radius
  - `GovernanceRobust.test.ts` — 150 enterprise E2E tests covering cross-module integration, edge cases, security invariants
  - `FusionCLI.test.ts` — 27 CLI tests (argument parsing, progress tracking, error handling)
- All **2587 tests** passing across 109 test files — zero regressions

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

