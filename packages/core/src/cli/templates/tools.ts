/**
 * Tool Templates — Example tools for the scaffolded project
 *
 * All tools use the Fluent API — `f.query()`, `f.mutation()` — with
 * semantic verbs, `.withString()` / `.withNumber()` typed parameters,
 * `.returns()` Presenter binding, and `.handle()` terminal step.
 * @module
 */

/** Generate `src/tools/system/health.ts` — Health check with Presenter */
export function healthToolTs(): string {
    return `/**
 * System Health Tool — Full MVA Pipeline (Fluent API)
 *
 * Demonstrates:
 * - f.query() — read-only semantic verb (auto-sets readOnlyHint)
 * - .describe() — LLM-facing description
 * - .returns() — Presenter (Egress Firewall + system rules + UI)
 * - .handle(input, ctx) — fully typed handler
 * - export default for autoDiscover()
 */
import { f } from '../../fusion.js';
import { SystemPresenter } from '../../presenters/SystemPresenter.js';

export default f.query('system.health')
    .describe('Real-time server health status')
    .returns(SystemPresenter)
    .handle(async (_input, ctx) => {
        // Return raw data — the Presenter validates, strips
        // undeclared fields, injects rules, and renders UI.
        return {
            status: 'healthy',
            uptime: process.uptime(),
            version: '0.1.0',
            timestamp: new Date().toISOString(),
            tenant: ctx.tenantId,
        };
    });
`;
}

/** Generate `src/tools/system/echo.ts` — Simple echo tool */
export function echoToolTs(): string {
    return `/**
 * Echo Tool — Connectivity Testing (Fluent API)
 *
 * Demonstrates:
 * - f.query() with .withString() typed parameter
 * - .handle(input, ctx) — input.message is typed as string
 * - Implicit success() wrapping — return raw data, framework wraps it
 */
import { f } from '../../fusion.js';

export default f.query('system.echo')
    .describe('Echo a message back (connectivity test)')
    .withString('message', 'Message to echo back')
    .handle(async (input) => {
        return {
            echo: input.message,
            receivedAt: new Date().toISOString(),
        };
    });
`;
}
