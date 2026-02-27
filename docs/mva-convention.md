# MVA Convention

The MVA Convention maps each architectural layer — Model, View, Agent — to a file-system layout. Two generators produce this layout automatically: the OpenAPI generator creates three directories, the Prisma generator creates a flat structure.

## OpenAPI Generator Layout {#openapi-layout}

```text
src/
├── models/               ← M — Zod schemas
│   ├── pet.schema.ts
│   └── store.schema.ts
├── views/                ← V — Presenters
│   ├── pet.presenter.ts
│   └── store.presenter.ts
├── agents/               ← A — Tool definitions
│   ├── pet.tool.ts
│   └── store.tool.ts
├── index.ts              ← ToolRegistry + registerAll()
└── server.ts             ← attachToServer() bootstrap
```

Each layer imports only from the layer above: `agents/` → `views/` → `models/` → `zod`. One file per OpenAPI tag, named `{tag}.suffix.ts`. The barrel and server file are both generated — you don't hand-write them.

Prompts are not generated. `autoDiscover()` only finds tool builders. See [Routing](/routing) for discovery details.

## Prisma Generator Layout {#prisma-layout}

```text
src/tools/database/
├── userPresenter.ts      ← V — Presenter + embedded Zod schema
├── userTools.ts          ← A — Tool definitions
├── postPresenter.ts
├── postTools.ts
└── index.ts              ← Barrel re-exports (no registry)
```

No separate `models/` directory — the Zod `ResponseSchema` lives inside each `{model}Presenter.ts`. Files use camelCase with `Presenter.ts` or `Tools.ts` suffixes. The barrel emits re-exports only; you wire the `ToolRegistry` yourself.

## Model Layer {#model}

Pure Zod schemas. No framework imports, no HTTP, no database client.

```typescript
// models/pet.schema.ts
import { z } from 'zod';

export const PetResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.enum(['available', 'pending', 'sold'])
    .describe('Pet adoption status'),
}).strict();
```

`.strict()` rejects undeclared fields at parse time — a database row with `internal_flags` fails validation instead of leaking.

In the OpenAPI layout, schemas live in `models/{tag}.schema.ts`. In the Prisma layout, the schema is embedded at the top of each Presenter file.

## View Layer {#view}

Presenters pair a Zod schema with perception logic — rules, UI blocks, affordances. One Presenter per entity, shared across every tool and prompt.

```typescript
// views/pet.presenter.ts — OpenAPI generator
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
import { PetResponseSchema } from '../models/pet.schema.js';

export const PetPresenter = createPresenter('Pet')
  .schema(PetResponseSchema)
  .rules(['Only show available pets unless explicitly requested.'])
  .ui((pet) => [
    ui.markdown(`**${pet.name}** — ${pet.status}`),
  ]);
```

The Prisma generator uses the fluent builder instead:

```typescript
// userPresenter.ts — Prisma generator
import { createPresenter } from '@vinkius-core/mcp-fusion';

export const UserPresenter = createPresenter('User')
  .schema(UserResponseSchema)
  .rules(['Data originates from the database via Prisma ORM.']);
```

Presenters never query databases or call APIs. They receive already-fetched data and shape perception.

## Agent Layer {#agent}

Tools import their Presenter, declare input, and attach a handler. The handler returns raw data; the Presenter handles the rest.

```typescript
// agents/pet.tool.ts
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';
import { PetPresenter } from '../views/pet.presenter.js';

const f = initFusion<ApiContext>();

export const getPet = f.query('pet.get_by_id')
  .describe('Get a pet by ID')
  .withNumber('petId', 'Pet ID')
  .returns(PetPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.pets.findUnique({ where: { id: input.petId } });
  });
```

In the Prisma layout, imports are flat — `./userPresenter.js` instead of `../views/`.

## Dependency Flow {#deps}

```text
models/  →  views/  →  agents/  →  index.ts  →  server.ts
                                       ↓
                                    tests/
```

Models import nothing. Views import Models. Agents import Views. Tests import the registry barrel. No layer imports from a layer below it. The Prisma flat layout follows the same direction — `Tools.ts` imports from `Presenter.ts`, never the reverse.

## Test Structure {#tests}

Recommended convention for `@vinkius-core/mcp-fusion-testing`. Neither generator creates test files.

```text
tests/
├── firewall/       ← Field whitelist (no data leaks)
├── guards/         ← Middleware & OOM guard tests
├── rules/          ← System rules verification
├── blocks/         ← UI blocks & truncation tests
└── setup.ts        ← Shared FusionTester instance
```

Use `.firewall.test.ts`, `.guard.test.ts`, `.rules.test.ts`, and `.blocks.test.ts` suffixes to match each concern.

## File Naming Reference {#naming}

**OpenAPI Generator:** `models/{tag}.schema.ts` → `views/{tag}.presenter.ts` → `agents/{tag}.tool.ts`

**Prisma Generator:** `{model}Presenter.ts` + `{model}Tools.ts` (flat, camelCase)

**Tests:** `tests/firewall/*.firewall.test.ts`, `tests/guards/*.guard.test.ts`, `tests/rules/*.rules.test.ts`, `tests/blocks/*.blocks.test.ts`
