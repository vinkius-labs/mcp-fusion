# Namespaces & Routing

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Set up file-based routing with tool groups — billing, users, analytics — with shared auth middleware and action discriminators."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Set up file-based routing with tool groups — billing, users, analytics — with shared auth middleware and action discriminators.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Set+up+file-based+routing+with+tool+groups+%E2%80%94+billing%2C+users%2C+analytics+%E2%80%94+with+shared+auth+middleware+and+action+discriminators." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Set+up+file-based+routing+with+tool+groups+%E2%80%94+billing%2C+users%2C+analytics+%E2%80%94+with+shared+auth+middleware+and+action+discriminators." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(34,211,238,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(34,211,238,0.6);letter-spacing:3px;font-weight:700">CONTEXT WINDOW OPTIMIZATION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">500 flat endpoints → 5 smart tools.<br><span style="color:rgba(255,255,255,0.25)">Action consolidation.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Instead of overwhelming the AI with hundreds of endpoints, Vurb hierarchically groups tools with discriminators — drastically reducing token consumption.</div>
</div>

## File-Based Routing — `autoDiscover()` {#auto-discover}

`autoDiscover()` scans a directory and registers all exported tools:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/server.ts</span>
</div>
<div style="padding:20px">

```typescript
import { initVurb, autoDiscover } from '@vurb/core';

const f = initVurb<AppContext>();
const registry = f.registry();

await autoDiscover(registry, './src/tools');
```

</div>
</div>

Your file structure becomes the routing table:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">directory → MCP tool names</span>
</div>
<div style="padding:20px">

```text
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   ├── pay.ts          → billing.pay
│   └── refund.ts       → billing.refund
├── users/
│   ├── list.ts         → users.list
│   ├── invite.ts       → users.invite
│   └── ban.ts          → users.ban
└── analytics/
    └── dashboard.ts    → analytics.dashboard
```

</div>
</div>

Add a file — it's registered. Delete a file — it's gone. Each tool file exports a builder:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/tools/billing/pay.ts</span>
</div>
<div style="padding:20px">

```typescript
import { f } from '../../vurb';

export default f.mutation('billing.pay')
  .describe('Process a payment for an invoice')
  .withString('invoice_id', 'Invoice ID')
  .withNumber('amount', 'Payment amount')
  .handle(async (input, ctx) => {
    return await ctx.billing.charge(input.invoice_id, input.amount);
  });
```

</div>
</div>

Pair `autoDiscover()` with `vurb dev` for hot-reload. See the [HMR Dev Server](/cookbook/hmr-dev-server).

## Fluent Router — `f.router()` {#fluent-router}

When multiple tools share a prefix, middleware, and tags:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/routers/users.ts</span>
</div>
<div style="padding:20px">

```typescript
const users = f.router('users')
    .describe('User management')
    .use(requireAuth)
    .tags('core');

export const listUsers = users.query('list')
    .describe('List all users')
    .withOptionalNumber('limit', 'Max results')
    .handle(async (input, ctx) => {
        return ctx.db.users.findMany({ take: input.limit ?? 50 });
    });

export const banUser = users.mutation('ban')
    .describe('Permanently ban a user')
    .withString('user_id', 'User ID to ban')
    .handle(async (input, ctx) => {
        await ctx.db.users.update({ where: { id: input.user_id }, data: { banned: true } });
    });
```

</div>
</div>

### Semantic Verbs

| Method | Semantic Defaults |
|--------|------------------|
| `users.query('list')` | `readOnly: true` |
| `users.action('invite')` | No defaults (neutral) |
| `users.mutation('ban')` | `destructive: true` |

> [!TIP]
> Middleware added to the router via `.use()` runs on **every** child tool. Add tool-specific middleware via `.use()` on the individual builder.

## Discriminators {#discriminators}

When a tool has multiple actions, the framework compiles them behind a single MCP endpoint with an `enum` discriminator — reducing the LLM's cognitive load:

```jsonc
{
  "properties": {
    "action": { "type": "string", "enum": ["list", "create", "delete"] },
    "workspace_id": { "type": "string" },
    "name": { "type": "string" }
  }
}
```

The `action` field forces the agent to select from a constrained enum instead of guessing between similar tool names.

## Common Schema {#shared-schemas}

With `createTool()`, inject common parameters into every action:

```typescript
const projects = createTool<AppContext>('projects')
  .description('Manage workspace projects')
  .commonSchema(z.object({
    workspace_id: z.string().describe('Workspace identifier'),
  }))
  .action({
    name: 'list',
    readOnly: true,
    handler: async (ctx, args) => {
      return success(await ctx.db.projects.findMany({
        where: { workspaceId: args.workspace_id },
      }));
    },
  })
  .action({
    name: 'create',
    schema: z.object({ name: z.string() }),
    handler: async (ctx, args) => {
      return success(await ctx.db.projects.create({
        workspaceId: args.workspace_id,
        name: args.name,
      }));
    },
  });
```

> [!TIP]
> With the Fluent API (`f.query()` / `f.mutation()`), each tool defines its own params. Use `createTool()` with `.commonSchema()` when you need a shared field across actions behind a single MCP endpoint.

## Hierarchical Groups {#hierarchical}

Groups organize actions into namespaces, each with its own middleware:

```typescript
const platform = createTool<AppContext>('platform')
    .description('Central API for the Platform')
    .commonSchema(z.object({
        workspace_id: z.string().describe('Workspace ID'),
    }))
    .use(authMiddleware)
    .group('users', 'User management', g => {
        g.use(requireAdmin)
         .action({ name: 'invite', schema: z.object({ email: z.string() }), handler: inviteUser })
         .action({ name: 'ban', destructive: true, schema: z.object({ user_id: z.string() }), handler: banUser });
    })
    .group('billing', 'Billing operations', g => {
        g.action({ name: 'refund', destructive: true, schema: z.object({ invoice_id: z.string() }), handler: issueRefund });
    });
```

Discriminator values become dot-notation paths: `users.invite`, `users.ban`, `billing.refund`.

## Tool Exposition {#exposition}

By default, grouped actions expand into independent flat tools. To keep grouped behavior:

```typescript
registry.attachToServer(server, { toolExposition: 'grouped' });
```

See the [Tool Exposition Guide](/tool-exposition) for the full comparison.

---

## Next Steps {#next}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/middleware" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">GUARD</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Middleware</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Auth, rate limiting, logging.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/error-handling" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">RECOVERY</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Error Handling</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Self-healing errors for AI agents.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/tool-exposition" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">EXPOSITION</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Tool Exposition</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Flat vs grouped tool discovery.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>