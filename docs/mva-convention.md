# MVA Convention

When a project has three tools, every developer keeps the code organized. When it has fifty, file structure becomes architecture. The MVA Convention maps each MVA layer — Model, View, Agent — to a dedicated concern. The OpenAPI generator (`@vinkius-core/openapi-gen`) produces the full three-directory layout. The Prisma generator (`mcp-fusion-prisma-gen`) produces a flat layout where Presenter and Tool files live side-by-side.

---

## OpenAPI Generator Layout {#openapi-layout}

The OpenAPI generator creates three subdirectories — one per MVA layer — plus two root files:

```text
src/
├── models/               ← M — Zod schemas (data boundary)
│   ├── pet.schema.ts
│   └── store.schema.ts
├── views/                ← V — Presenters (perception layer)
│   ├── pet.presenter.ts
│   └── store.presenter.ts
├── agents/               ← A — MCP tool definitions (agent interface)
│   ├── pet.tool.ts
│   └── store.tool.ts
├── index.ts              ← Barrel: ToolRegistry + registerAll()
└── server.ts             ← Server bootstrap with attachToServer()
```

Each layer imports only from the layer above it. `agents/` imports from `views/`, `views/` imports from `models/`, `models/` imports only `zod`. One file per OpenAPI tag, named `{tag}.suffix.ts` in lowercase.

The barrel (`index.ts`) creates a `ToolRegistry`, imports all tool builders from `agents/`, and calls `registerAll()`. The server file (`server.ts`) imports the registry and calls `attachToServer()`. Neither file is hand-written — both are generated.

Prompts are not generated. The `autoDiscover()` function only finds tool builders. See [Routing](/routing) for `autoDiscover()` details and [Prompt Engine](/prompts) for prompt registration.

## Prisma Generator Layout {#prisma-layout}

The Prisma generator produces a flat directory — all files in a single output folder (default: `src/tools/database/`):

```text
src/tools/database/
├── userPresenter.ts      ← V — Presenter + embedded Zod schema
├── userTools.ts          ← A — MCP tool definitions
├── postPresenter.ts
├── postTools.ts
└── index.ts              ← Barrel re-exports (no registry)
```

The Zod `ResponseSchema` is defined inside each `{model}Presenter.ts` file — there is no separate `models/` directory. Files are named in camelCase with `Presenter.ts` or `Tools.ts` suffixes. The barrel emits re-exports only — no `ToolRegistry`, no `server.ts`. You wire the registry yourself.

---

## Model Layer {#model}

The Model layer holds pure Zod schemas. A schema file imports only `zod` — no framework, no HTTP, no database client. This makes schemas portable: they can be shared between server and client, used in CI validation, or published as a standalone package.

```typescript
// models/pet.schema.ts  (OpenAPI generator output)
import { z } from 'zod';

export const PetResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.enum(['available', 'pending', 'sold'])
    .describe('Pet adoption status'),
}).strict();
```

The `.strict()` call means Zod rejects any field not declared in the schema. A database row with `internal_flags` or `owner_secret` fails validation instead of silently leaking.

In the **OpenAPI layout**, schemas live in `models/{tag}.schema.ts`. In the **Prisma layout**, the schema is embedded at the top of each `{model}Presenter.ts` file.

---

## View Layer {#view}

The View layer holds Presenters. Each Presenter uses a Zod schema and adds perception logic: system rules, UI blocks, agent limits, affordances. One Presenter per entity, shared across every tool and prompt that touches that entity.

```typescript
// views/pet.presenter.ts  (OpenAPI generator output)
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { PetResponseSchema } from '../models/pet.schema.js';

export const PetPresenter = definePresenter({
  name: 'Pet',
  schema: PetResponseSchema,
  autoRules: true,
  systemRules: ['Only show available pets unless explicitly requested.'],
  uiBlocks: (pet) => [
    ui.markdown(`**${pet.name}** — ${pet.status}`),
  ],
});
```

The Prisma generator uses `createPresenter()` (the fluent builder) instead of `definePresenter()`:

```typescript
// userPresenter.ts  (Prisma generator output)
import { createPresenter } from '@vinkius-core/mcp-fusion';

export const UserPresenter = createPresenter('User')
  .schema(UserResponseSchema)
  .systemRules(['Data originates from the database via Prisma ORM.']);
```

The Presenter never queries a database, never calls an API, never accesses a request object. It receives already-fetched data and shapes what the agent perceives.

---

## Agent Layer {#agent}

The Agent layer wires Models and Views into MCP-compatible tools. Each tool imports its Presenter, declares input, and attaches a handler. The handler returns raw data; the Presenter handles the rest.

```typescript
// agents/pet.tool.ts  (OpenAPI generator output)
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';
import { PetPresenter } from '../views/pet.presenter.js';

const f = initFusion<ApiContext>();

export const getPet = f.tool({
  name: 'pet.get_by_id',
  description: 'Get a pet by ID',
  input: z.object({ petId: z.coerce.number().int() }),
  returns: PetPresenter,
  handler: async ({ input, ctx }) => {
    return ctx.db.pets.findUnique({ where: { id: input.petId } });
  },
});
```

In the Prisma layout, imports are flat (same directory), and the import path is `./userPresenter.js`.

---

## Test Structure {#tests}

The `@vinkius-core/mcp-fusion-testing` package recommends four test subdirectories, each verifying a different MVA concern. This is a recommended convention — neither generator creates test files.

```text
tests/
├── firewall/       ← Egress assertions (field whitelist)
├── guards/         ← Middleware & OOM guard tests
├── rules/          ← System rules verification
├── blocks/         ← UI blocks & truncation tests
└── setup.ts        ← Shared FusionTester instance
```

| Directory | Suffix | What it verifies |
|---|---|---|
| `tests/firewall/` | `.firewall.test.ts` | Field whitelist — no sensitive data leaks |
| `tests/guards/` | `.guard.test.ts` | Middleware blocks unauthorized access |
| `tests/rules/` | `.rules.test.ts` | System rules appear in output |
| `tests/blocks/` | `.blocks.test.ts` | UI blocks render, truncation works |

---

## Dependency Flow {#deps}

```text
models/  →  views/  →  agents/  →  index.ts  →  server.ts
                                       ↓
                                    tests/
```

The arrow means "imports from." Models import nothing. Views import Models. Agents import Views. Tests import the registry barrel. No layer ever imports from a layer below it.

In the Prisma flat layout, the same dependency direction applies — `{model}Tools.ts` imports from `{model}Presenter.ts`, never the reverse.

---

## File Naming Reference {#naming}

### OpenAPI Generator

| Layer | Directory | Suffix | Primary API |
|---|---|---|---|
| Model | `models/` | `.schema.ts` | `z.object()` |
| View | `views/` | `.presenter.ts` | `definePresenter()` |
| Agent | `agents/` | `.tool.ts` | `f.tool()` |

### Prisma Generator

| Layer | Directory | Suffix | Primary API |
|---|---|---|---|
| View + Model | flat | `Presenter.ts` | `createPresenter()` |
| Agent | flat | `Tools.ts` | `defineTool()` |

### Test Convention (manual)

| Directory | Suffix | Primary API |
|---|---|---|
| `tests/firewall/` | `.firewall.test.ts` | `tester.callAction()` |
| `tests/guards/` | `.guard.test.ts` | `tester.callAction()` |
| `tests/rules/` | `.rules.test.ts` | `tester.callAction()` |
| `tests/blocks/` | `.blocks.test.ts` | `tester.callAction()` |

---

## Where to Go Next {#next-steps}

- [MVA Pattern](/mva-pattern) — the architecture behind this convention
- [Presenter](/presenter) — the View layer in depth
- [Testing](/testing) — full testing guide with `FusionTester`
- [OpenAPI Generator](/openapi-gen) — generates the three-directory MVA layout
- [Prisma Generator](/prisma-gen) — generates the flat MVA layout

