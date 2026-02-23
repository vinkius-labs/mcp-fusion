// ============================================================================
// WorkflowDiscovery — Fetch + filter webhook-triggered workflows
// ============================================================================

import type { N8nClient } from './N8nClient.js';
import type { N8nWorkflow, N8nNode, WebhookConfig, QueryParam } from './types.js';

export interface DiscoveryOptions {
    readonly includeTags?: readonly string[];
    readonly excludeTags?: readonly string[];
}

/**
 * Discovers webhook-triggered workflows from an n8n instance.
 *
 * Only workflows with a Webhook node as trigger are included.
 * Tag filtering (include/exclude) is applied after discovery.
 */
export class WorkflowDiscovery {
    constructor(
        private readonly client: N8nClient,
        private readonly options: DiscoveryOptions = {},
    ) {}

    /** Discover all webhook workflows, apply tag filters, return configs */
    async discover(): Promise<WebhookConfig[]> {
        const workflows = await this.client.listWorkflows();
        const webhookWorkflows = workflows.filter(w => this.hasWebhookTrigger(w));
        const filtered = this.applyTagFilters(webhookWorkflows);
        return filtered.map(w => this.extractWebhookConfig(w));
    }

    // ── Internal ──

    /** Check if a workflow has a Webhook node as its trigger */
    private hasWebhookTrigger(workflow: N8nWorkflow): boolean {
        return workflow.nodes.some(
            node => node.type === 'n8n-nodes-base.webhook'
                 || node.type === '@n8n/n8n-nodes-base.webhook',
        );
    }

    /** Find the first webhook node in a workflow */
    private findWebhookNode(workflow: N8nWorkflow): N8nNode | undefined {
        return workflow.nodes.find(
            node => node.type === 'n8n-nodes-base.webhook'
                 || node.type === '@n8n/n8n-nodes-base.webhook',
        );
    }

    /** Apply include/exclude tag filters */
    private applyTagFilters(workflows: N8nWorkflow[]): N8nWorkflow[] {
        const { includeTags, excludeTags } = this.options;

        return workflows.filter(w => {
            const tags = w.tags.map(t => t.name);

            if (includeTags && includeTags.length > 0) {
                if (!tags.some(t => includeTags.includes(t))) return false;
            }

            if (excludeTags && excludeTags.length > 0) {
                if (tags.some(t => excludeTags.includes(t))) return false;
            }

            return true;
        });
    }

    /** Extract webhook configuration from a workflow */
    private extractWebhookConfig(workflow: N8nWorkflow): WebhookConfig {
        const node = this.findWebhookNode(workflow)!;
        const params = node.parameters;

        // Extract webhook path (n8n stores it as 'path' parameter)
        const path = typeof params['path'] === 'string'
            ? `/webhook/${params['path']}`
            : `/webhook/${workflow.id}`;

        // Extract HTTP method (default POST)
        const method = typeof params['httpMethod'] === 'string'
            ? params['httpMethod']
            : 'POST';

        // Extract description from workflow notes (the "Hack Semântico")
        const description = workflow.meta?.notes
            ?? `n8n Workflow #${workflow.id}: ${workflow.name}`;

        // Extract query parameters if configured
        const queryParams = this.extractQueryParams(params);

        return {
            workflowId: workflow.id,
            workflowName: workflow.name,
            path,
            method,
            description,
            tags: workflow.tags.map(t => t.name),
            queryParams,
        };
    }

    /** Extract query parameters from webhook node configuration */
    private extractQueryParams(params: Record<string, unknown>): QueryParam[] {
        // n8n stores query params in 'options.queryParameterAuthentication'
        // or as configured in the webhook node options
        const options = params['options'] as Record<string, unknown> | undefined;
        if (!options) return [];

        const rawParams = options['queryParameters'] as
            | Array<{ name: string; type?: string; required?: boolean }>
            | undefined;
        if (!rawParams || !Array.isArray(rawParams)) return [];

        return rawParams.map(p => ({
            name: p.name,
            type: (p.type as 'string' | 'number' | 'boolean') || 'string',
            required: p.required ?? false,
        }));
    }
}
