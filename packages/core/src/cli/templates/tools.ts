/**
 * Tool Templates — Example tools for the scaffolded project
 * @module
 */

/** Generate `src/tools/system/health.ts` — Health check with Presenter */
export function healthToolTs(): string {
    return `/**
 * System Health Tool — Full MVA Pipeline Example
 *
 * Demonstrates:
 * - f.tool() with automatic context typing
 * - Presenter integration (Egress Firewall)
 * - readOnly annotation for LLM optimization
 * - export default for autoDiscover()
 */
import { f } from '../../fusion.js';
import { SystemPresenter } from '../../presenters/SystemPresenter.js';

export default f.tool({
    name: 'system.health',
    description: 'Real-time server health status',
    readOnly: true,
    returns: SystemPresenter,
    handler: async ({ ctx }) => {
        // Return raw data — the Presenter validates, strips
        // undeclared fields, injects rules, and renders UI.
        return {
            status: 'healthy',
            uptime: process.uptime(),
            version: '0.1.0',
            timestamp: new Date().toISOString(),
            tenant: ctx.tenantId,
        };
    },
});
`;
}

/** Generate `src/tools/system/echo.ts` — Simple echo tool */
export function echoToolTs(): string {
    return `/**
 * Echo Tool — Connectivity Testing
 *
 * Minimal tool without a Presenter. Uses success() for
 * a raw JSON response. Useful for verifying the MCP
 * connection is alive.
 */
import { f } from '../../fusion.js';
import { success } from '@vinkius-core/mcp-fusion';

export default f.tool({
    name: 'system.echo',
    description: 'Echo a message back (connectivity test)',
    readOnly: true,
    input: {
        message: { type: 'string', description: 'Message to echo back' },
    },
    handler: async ({ input }) => {
        return success({
            echo: input.message,
            receivedAt: new Date().toISOString(),
        });
    },
});
`;
}
