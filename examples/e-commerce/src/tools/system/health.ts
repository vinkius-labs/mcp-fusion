/**
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
