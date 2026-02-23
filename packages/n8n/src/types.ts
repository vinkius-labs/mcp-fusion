// ============================================================================
// n8n API Types — Internal type definitions for the n8n REST API
// ============================================================================

/** Workflow node from n8n API */
export interface N8nNode {
    readonly name: string;
    readonly type: string;
    readonly parameters: Record<string, unknown>;
    readonly position: readonly [number, number];
}

/** Workflow from n8n GET /api/v1/workflows */
export interface N8nWorkflow {
    readonly id: number;
    readonly name: string;
    readonly active: boolean;
    readonly tags: readonly N8nTag[];
    readonly nodes: readonly N8nNode[];
    readonly createdAt: string;
    readonly updatedAt: string;
    /** User-facing notes/description (the "Hack Semântico" field) */
    readonly meta?: { readonly notes?: string };
}

/** Tag from n8n API */
export interface N8nTag {
    readonly id: number;
    readonly name: string;
}

/** Webhook node configuration extracted from a workflow */
export interface WebhookConfig {
    readonly workflowId: number;
    readonly workflowName: string;
    readonly path: string;
    readonly method: string;
    readonly description: string;
    readonly tags: readonly string[];
    readonly queryParams: readonly QueryParam[];
}

/** Query parameter extracted from webhook node */
export interface QueryParam {
    readonly name: string;
    readonly type: 'string' | 'number' | 'boolean';
    readonly required: boolean;
}

/** n8n webhook execution response */
export interface N8nWebhookResponse {
    readonly status: number;
    readonly data: unknown;
    readonly executionId?: string;
}

/** Configuration for the n8n connector */
export interface N8nConnectorConfig {
    /** n8n instance base URL (e.g., http://localhost:5678) */
    readonly url: string;
    /** n8n REST API key */
    readonly apiKey: string;
    /** Only expose workflows with these tags */
    readonly includeTags?: readonly string[];
    /** Exclude workflows with these tags */
    readonly excludeTags?: readonly string[];
    /** Webhook call timeout in ms (default: 30000) */
    readonly timeout?: number;
    /** Polling interval in ms for live state sync (default: off). Set to enable auto-refresh. */
    readonly pollInterval?: number;
    /**
     * Called when the tool list changes after a poll cycle.
     * Use this to emit `notifications/tools/list_changed` on your MCP server.
     */
    readonly onChange?: () => void;
}

/** Configuration for manually defining an n8n tool */
export interface N8nToolConfig<TContext = void> {
    /** n8n workflow ID */
    readonly workflowId: number;
    /** Webhook path (e.g., '/webhook/lead-enrichment') */
    readonly webhookPath: string;
    /** HTTP method (default: 'POST') */
    readonly method?: string;
    /** Tool description for the LLM */
    readonly description?: string;
    /** Parameter definitions (JSON-first, like defineTool) */
    readonly params?: Record<string, ParamDef>;
    /** MCP annotations */
    readonly annotations?: {
        readonly readOnlyHint?: boolean;
        readonly destructiveHint?: boolean;
    };
    /** Tags for filtering */
    readonly tags?: readonly string[];
}

/** Parameter definition (JSON-first) */
export type ParamDef = string | {
    readonly type: string;
    readonly enum?: readonly string[];
    readonly description?: string;
    readonly required?: boolean;
};
