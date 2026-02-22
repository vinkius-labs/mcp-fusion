## 🚀 What's New in v0.8.0

### ⭐ Headline: Build-Time Prompt Preview

End the blind flight. See exactly what the LLM receives — without starting a server:

```typescript
console.log(builder.previewPrompt());
```

```
┌────────────────────────────────────────────────────────┐
│  MCP Tool Preview: projects
├─── Summary ────────────────────────────────────────────┤
│  Name: projects
│  Actions: 3 (list, create, delete)
├─── Description ────────────────────────────────────────┤
│  Manage workspace projects. Actions: list, create, delete
├─── Input Schema ───────────────────────────────────────┤
│  { ... }
├─── Token Estimate ─────────────────────────────────────┤
│  ~185 tokens (740 chars)
└────────────────────────────────────────────────────────┘
```

### Code Improvements
- **previewPrompt()** — build-time MCP payload preview with ~token estimate
- **Async contextFactory** — `contextFactory` now accepts `Promise<TContext>`
- **Immutable ToolResponse** — `readonly content: ReadonlyArray<...>`
- **Resilient generator detection** — `Symbol.toStringTag` + fallback
- **ESLint tests scope** — test files now covered by typescript-eslint
- **npm package expanded** — `llms.txt` + `CHANGELOG.md` included
- **test:coverage script** — `vitest run --coverage` now available

### 📚 Documentation (17 pages, 2,500+ lines)

**5 New Pages:**
| Page | Description |
|---|---|
| **Error Handling** | Full hierarchy: error() → required() → toolError() → Result\<T\> |
| **Testing Guide** | Direct execution, mocking, middleware, registry, streaming |
| **Migration Guide** | Step-by-step from raw MCP SDK with checklist |
| **Result Monad** | Railway-Oriented Programming patterns |
| **FusionClient** | tRPC-style type-safe client setup |

### 🧪 Tests
- **779 tests passing** across 33 test suites
- **0 TypeScript errors** (strict mode)

### Breaking Changes
- `ToolResponse.content` is now `readonly` — unlikely to affect consumers
