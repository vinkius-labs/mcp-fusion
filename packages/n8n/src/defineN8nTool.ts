// ============================================================================
// defineN8nTool — Manual/surgical mode (the Enterprise Weapon)
// ============================================================================

import type { N8nClient } from './N8nClient.js';
import type { N8nToolConfig, ParamDef } from './types.js';
import type { SynthesizedTool, SynthesizedAction } from './ToolSynthesizer.js';

/**
 * Manually define an n8n workflow as an MCP Fusion tool.
 *
 * For when architects need surgical control: strict Zod params,
 * custom annotations, specific middleware chains.
 *
 * ```typescript
 * const deploy = defineN8nTool('deploy_staging', client, {
 *   workflowId: 15,
 *   webhookPath: '/webhook/deploy',
 *   params: {
 *     branch: 'string',
 *     environment: { type: 'string', enum: ['staging', 'production'] },
 *   },
 *   annotations: { destructiveHint: true },
 * });
 *
 * const builder = defineTool(deploy.name, deploy.config);
 * registry.register(builder);
 * ```
 */
export function defineN8nTool<TContext = void>(
    name: string,
    client: N8nClient,
    config: N8nToolConfig<TContext>,
): SynthesizedTool {
    const method = (config.method ?? 'POST').toUpperCase();
    const isReadOnly = method === 'GET';

    // Build params from user-provided definitions
    const params: Record<string, string | { type: string; enum?: readonly string[]; description?: string }> = {};
    if (config.params) {
        for (const [key, def] of Object.entries(config.params)) {
            if (typeof def === 'string') {
                params[key] = def;
            } else {
                params[key] = {
                    type: def.type,
                    ...(def.enum ? { enum: def.enum } : {}),
                    ...(def.description ? { description: def.description } : {}),
                };
            }
        }
    }

    // Build handler
    const handler = async (_ctx: unknown, args: Record<string, unknown>) => {
        const response = await client.callWebhook(
            config.webhookPath,
            method,
            args,
        );

        if (response.status >= 400) {
            return {
                isError: true,
                content: [{
                    type: 'text' as const,
                    text: `n8n workflow error (HTTP ${response.status}): ${JSON.stringify(response.data)}`,
                }],
            };
        }

        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify(response.data, null, 2),
            }],
        };
    };

    const description = config.description ??
        `[n8n Workflow #${config.workflowId}] ${name}`;

    return {
        name,
        config: {
            description,
            tags: config.tags ? [...config.tags] : [],
            actions: {
                execute: {
                    description: `Execute workflow #${config.workflowId}`,
                    params,
                    handler,
                    annotations: config.annotations ?? {
                        readOnlyHint: isReadOnly,
                        ...(isReadOnly ? {} : { destructiveHint: false }),
                    },
                },
            },
        },
    };
}
