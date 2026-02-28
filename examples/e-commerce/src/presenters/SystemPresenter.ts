/**
 * System Presenter — MVA View Layer (Egress Firewall)
 *
 * Defines how the Agent perceives system health data.
 * The Zod schema acts as a field whitelist — undeclared
 * fields are physically stripped in RAM before they
 * reach the LLM context window.
 *
 * Features demonstrated:
 * - definePresenter() with Zod schema
 * - .describe() auto-rules (JIT — travel with data, not in global prompt)
 * - ui.markdown() server-rendered UI blocks
 * - suggestActions() for HATEOAS-style affordances
 */
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const SystemPresenter = definePresenter({
    name: 'SystemHealth',
    schema: z.object({
        status: z.string().describe('Server operational status'),
        uptime: z.number().describe('Uptime in seconds since process start'),
        version: z.string().describe('Server version string'),
        timestamp: z.string().describe('ISO 8601 timestamp of this check'),
    }),
    // autoRules: true (default) — .describe() annotations become system rules
    ui: (data) => [
        ui.markdown(
            `🟢 **${data.status}** | ⏱ ${Math.floor(data.uptime)}s | v${data.version}`
        ),
    ],
    suggestActions: (data) => data.status !== 'healthy'
        ? [{ tool: 'system.health', reason: 'Re-check after issue resolution' }]
        : [],
});
