# TOON — Token-Optimized Responses

- [Introduction](#introduction)
- [toonSuccess() — Response-Level Encoding](#response-level)
- [.toonDescription() — Description Compression](#description-level)
- [When to Use](#when)

## Introduction {#introduction}

JSON is verbose. For tabular data — user lists, invoice rows, log entries — individual field names repeat on every row: `{"id":"1","name":"Alice","email":"alice@co"}`, `{"id":"2","name":"Bob","email":"bob@co"}`. Those repeated keys waste tokens.

TOON (Token-Oriented Object Notation) replaces JSON structure with pipe-delimited tabular data. The savings are significant: **~40-50% fewer tokens** for arrays of uniform objects. The LLM parses pipe-delimited data just as accurately as JSON — it's the same format used in markdown tables, which LLMs see constantly in training data.

## toonSuccess() — Response-Level Encoding {#response-level}

Replace `success(data)` with `toonSuccess(data)` to encode the response as TOON:

```typescript
import { initFusion, toonSuccess } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const listUsers = f.query('users.list')
  .describe('List all users')
  .handle(async (input, ctx) => {
    const users = await ctx.db.users.findMany();
    return toonSuccess(users);
  });
```

**JSON output** (~120 tokens):

```json
[
  {"id": "1", "name": "Alice", "email": "alice@acme.co", "role": "admin"},
  {"id": "2", "name": "Bob", "email": "bob@acme.co", "role": "member"},
  {"id": "3", "name": "Carol", "email": "carol@acme.co", "role": "viewer"}
]
```

**TOON output** (~65 tokens):

```text
id|name|email|role
1|Alice|alice@acme.co|admin
2|Bob|bob@acme.co|member
3|Carol|carol@acme.co|viewer
```

Same data. Half the tokens. The LLM reads it perfectly.

## .toonDescription() — Description Compression {#description-level}

When your tool has many actions and the description consumes too many tokens in `tools/list`, use `.toonDescription()` to TOON-encode the metadata itself:

```typescript
import { createTool, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const api = createTool<AppContext>('api')
  .description('Full platform API with 50+ actions')
  .toonDescription()
  .action({ name: 'users.list', readOnly: true, schema: z.object({}), handler: listUsers })
  .action({ name: 'users.get', readOnly: true, schema: z.object({ id: z.string() }), handler: getUser })
  // ... 48 more actions
;
```

The tool description in `tools/list` is compressed from verbose JSON annotations to a pipe-delimited table of action names, parameters, and flags.

## When to Use {#when}

| Scenario | Technique | Savings |
|---|---|---|
| Arrays of uniform objects | `toonSuccess(data)` | ~40-50% tokens |
| Tool with 20+ actions | `.toonDescription()` | ~30-40% description tokens |
| Single object / mixed types | `success(data)` (default) | No savings needed |
| Small response (< 10 items) | `success(data)` (default) | Negligible savings |

> [!TIP]
> `toonSuccess()` works best with arrays of flat, uniform objects (all rows have the same keys). For nested objects or mixed-type arrays, stick with `success()`.