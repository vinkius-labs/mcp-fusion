# Streaming Progress

- [Introduction](#introduction)
- [Generator Handlers](#generators)
- [The progress() Helper](#progress)
- [Real-World Example — Data Export](#export)
- [Cancellation Support](#cancellation)

## Introduction {#introduction}

Long-running operations — data exports, repository analysis, batch processing — need to report progress. Without feedback, the AI tells the user "Please wait..." for 30 seconds with no indication of what's happening.

MCP Fusion supports **generator handlers** that `yield` progress updates. When attached to an MCP server, each `yield progress()` is automatically forwarded as a `notifications/progress` message to the client. Zero configuration.

## Generator Handlers {#generators}

Instead of `async (input, ctx) => { ... }`, use `async function*` to create a generator handler. Use `yield` to send progress updates during execution:

```typescript
import { initFusion, progress, success } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const analyzeRepo = f.query('repo.analyze')
  .describe('Analyze a repository for patterns and code quality')
  .withString('url', 'Repository URL')
  .handle(async function* (input, ctx) {
    yield progress(10, 'Cloning repository...');
    const files = await cloneRepo(input.url);

    yield progress(50, 'Building AST...');
    const ast = buildAST(files);

    yield progress(90, 'Analyzing patterns...');
    const results = analyzePatterns(ast);

    yield progress(100, 'Done!');
    return results;
  });
```

Each `yield progress(percentage, message)` sends a real-time update to the MCP client. The percentage is a number from 0 to 100, and the message describes the current step.

> [!NOTE]
> The final `return` value is the tool's response — it goes through the normal Presenter pipeline. The `yield` calls are side-channel progress notifications.

## The progress() Helper {#progress}

`progress(percentage, message)` creates a structured progress notification:

```typescript
yield progress(0,   'Starting...');
yield progress(25,  'Loading data...');
yield progress(50,  'Processing...');
yield progress(75,  'Finalizing...');
yield progress(100, 'Complete!');
```

When connected via `attachToServer()`, each `yield` becomes an MCP `notifications/progress` event. MCP clients render these as progress bars, spinners, or status messages — depending on their UI.

## Real-World Example — Data Export {#export}

A batch data export with progress tracking at every stage:

```typescript
export const exportData = f.action('data.export')
  .describe('Export data from a table in CSV, JSON, or XLSX format')
  .withEnum('format', ['csv', 'json', 'xlsx'] as const, 'Export format')
  .withString('table', 'Table name to export')
  .handle(async function* (input, ctx) {
    // Step 1: Count rows
    yield progress(10, 'Counting records...');
    const count = await ctx.db.count(input.table);

    // Step 2: Fetch in batches
    const batchSize = 1000;
    const batches = Math.ceil(count / batchSize);
    const rows: unknown[] = [];

    for (let i = 0; i < batches; i++) {
      yield progress(
        10 + Math.round((i / batches) * 70),
        `Fetching batch ${i + 1}/${batches}...`,
      );
      const batch = await ctx.db.query(input.table, {
        offset: i * batchSize,
        limit: batchSize,
      });
      rows.push(...batch);
    }

    // Step 3: Convert format
    yield progress(85, `Converting to ${input.format}...`);
    const output = await convertToFormat(rows, input.format);

    // Step 4: Upload
    yield progress(95, 'Uploading to storage...');
    const url = await ctx.storage.upload(output, `export.${input.format}`);

    yield progress(100, 'Export complete!');
    return { url, rows: count, format: input.format };
  });
```

The client sees live progress as each batch is fetched. For a 10,000-row export with batch size 1000, the progress moves from 10% → 17% → 24% → ... → 80% → 85% → 95% → 100%.

## Cancellation Support {#cancellation}

Generators get cancellation for free. The framework checks `signal.aborted` before each `yield`. If the user clicks "Stop" or the connection drops mid-stream, the generator is aborted via `gen.return()`, triggering `finally {}` cleanup:

```typescript
export const heavyQuery = f.query('analytics.heavy_report')
  .describe('Generate a comprehensive analytics report')
  .withString('range', 'Date range (e.g. "7d", "30d", "90d")')
  .handle(async function* (input, ctx) {
    yield progress(10, 'Querying data...');
    const data = await ctx.db.analytics.findMany({
      where: { range: input.range },
    });

    yield progress(50, 'Enriching with external data...');
    const enriched = await fetch('https://api.internal/enrich', {
      method: 'POST',
      body: JSON.stringify(data),
      signal: ctx.signal,   // ← pass the signal to fetch
    });

    yield progress(90, 'Formatting results...');
    return await enriched.json();
  });
```

Pass `ctx.signal` to any async I/O (`fetch`, database queries, etc.) for cooperative cancellation. If the signal fires, the `fetch` aborts, the generator stops, and no zombie handlers hold database connections.