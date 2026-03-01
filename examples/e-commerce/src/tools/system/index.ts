/**
 * System Tools — Health & Echo (Single Grouped Tool)
 *
 * Both tools share the 'system' namespace, so they must be in a
 * single GroupedToolBuilder to avoid duplicate registration errors
 * with autoDiscover().
 *
 * This demonstrates the createTool() pattern for multi-action tools.
 */
import { createTool, success, definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';
import type { AppContext } from '../../context.js';

const SystemPresenter = definePresenter({
    name: 'SystemHealth',
    schema: z.object({
        status: z.string().describe('Server operational status'),
        uptime: z.number().describe('Uptime in seconds since process start'),
        version: z.string().describe('Server version string'),
        timestamp: z.string().describe('ISO 8601 timestamp of this check'),
    }),
    ui: (data) => [
        ui.markdown(
            `🟢 **${data.status}** | ⏱ ${Math.floor(data.uptime)}s | v${data.version}`
        ),
    ],
    suggestActions: (data) => data.status !== 'healthy'
        ? [{ tool: 'system.health', reason: 'Re-check after issue resolution' }]
        : [],
});

export default createTool<AppContext>('system')
    .action({
        name: 'health',
        description: 'Real-time server health status',
        readOnly: true,
        returns: SystemPresenter,
        handler: async (ctx) => {
            // Return RAW data — the Presenter validates, strips
            // undeclared fields (Egress Firewall), injects system rules.
            // Do NOT wrap with success() — postProcessResult would skip
            // the Presenter pipeline (Priority 1: ToolResponse pass-through).
            return {
                status: 'healthy',
                uptime: process.uptime(),
                version: '0.1.0',
                timestamp: new Date().toISOString(),
                tenant: ctx.tenantId,
            } as any;
        },
    })
    .action({
        name: 'echo',
        description: 'Echo a message back (connectivity test)',
        readOnly: true,
        schema: z.object({
            message: z.string().describe('Message to echo back'),
        }),
        handler: async (_ctx, args) => {
            return success({
                echo: args['message'],
                receivedAt: new Date().toISOString(),
            });
        },
    });
