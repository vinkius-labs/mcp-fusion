// ============================================================================
// ToolSynthesizer — WebhookConfig → MCP Fusion ToolBuilder
// ============================================================================

import { z } from 'zod';
import type { WebhookConfig } from './types.js';
import type { N8nClient } from './N8nClient.js';
import { inferSchema } from './SchemaInferrer.js';

/**
 * Synthesizes MCP Fusion tool definitions from discovered n8n webhook workflows.
 *
 * Uses `defineTool()` pattern — returns config objects that the consumer
 * feeds to their own ToolRegistry. This is the IoC boundary:
 * we produce builders, the developer owns the server.
 */
export interface SynthesizedTool {
    /** Tool name (snake_case from workflow name) */
    readonly name: string;
    /** Full tool config for defineTool() */
    readonly config: {
        readonly description: string;
        readonly tags: readonly string[];
        readonly actions: Record<string, SynthesizedAction>;
    };
}

export interface SynthesizedAction {
    readonly description: string;
    readonly params: Record<string, unknown>;
    readonly handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
    readonly annotations?: {
        readonly readOnlyHint?: boolean;
        readonly destructiveHint?: boolean;
    };
}

/**
 * Convert a workflow name to a valid snake_case tool name.
 * "Lead Enrichment" → "lead_enrichment"
 * "My Awesome Workflow (v2)" → "my_awesome_workflow_v2"
 */
export function toToolName(workflowName: string): string {
    return workflowName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * Synthesize a MCP Fusion tool definition from a webhook config.
 */
export function synthesizeTool(
    webhook: WebhookConfig,
    client: N8nClient,
): SynthesizedTool {
    const name = toToolName(webhook.workflowName);
    const schema = inferSchema(webhook);
    const method = webhook.method.toUpperCase();
    const isReadOnly = method === 'GET';

    // Build param definitions from inferred schema
    const params: Record<string, string | { type: string; description?: string }> = {};
    for (const [key, zodType] of Object.entries(schema)) {
        if (key === 'body') {
            params[key] = { type: 'object', description: 'Request body — see workflow description for expected fields' };
        } else {
            params[key] = 'string'; // query params are strings by default
        }
    }

    // Build the handler — calls the n8n webhook
    const handler = async (_ctx: unknown, args: Record<string, unknown>) => {
        const { body, ...queryArgs } = args;
        const payload = (body as Record<string, unknown>) ?? queryArgs;
        const response = await client.callWebhook(webhook.path, webhook.method, payload);

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

    // Tool description with n8n metadata
    const lines = [
        `[n8n Workflow #${webhook.workflowId}] ${webhook.workflowName}`,
        '',
        webhook.description,
        '',
        `Webhook: ${method} ${webhook.path}`,
    ];
    if (webhook.tags.length > 0) {
        lines.push(`Tags: ${webhook.tags.join(', ')}`);
    }

    return {
        name,
        config: {
            description: lines.join('\n'),
            tags: [...webhook.tags],
            actions: {
                execute: {
                    description: `Execute the "${webhook.workflowName}" workflow`,
                    params,
                    handler,
                    annotations: {
                        readOnlyHint: isReadOnly,
                        ...(isReadOnly ? {} : { destructiveHint: false }),
                    },
                },
            },
        },
    };
}

/**
 * Synthesize tools from an array of webhook configs.
 */
export function synthesizeAll(
    webhooks: WebhookConfig[],
    client: N8nClient,
): SynthesizedTool[] {
    return webhooks.map(w => synthesizeTool(w, client));
}
