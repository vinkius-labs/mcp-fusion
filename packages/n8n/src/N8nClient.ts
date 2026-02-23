// ============================================================================
// N8nClient — HTTP client for the n8n REST API
// ============================================================================

import type { N8nWorkflow, N8nWebhookResponse } from './types.js';

export interface N8nClientConfig {
    readonly url: string;
    readonly apiKey: string;
    readonly timeout?: number;
}

/**
 * Minimal HTTP client for the n8n REST API.
 * Handles authentication, URL normalization, and error wrapping.
 */
export class N8nClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly timeout: number;

    constructor(config: N8nClientConfig) {
        this.baseUrl = config.url.replace(/\/+$/, '');
        this.apiKey = config.apiKey;
        this.timeout = config.timeout ?? 30_000;
    }

    // ── Workflow Discovery ──

    /** Fetch all active workflows from n8n */
    async listWorkflows(): Promise<N8nWorkflow[]> {
        const response = await this.get('/api/v1/workflows?active=true');
        const body = await response.json() as { data: N8nWorkflow[] };
        return body.data;
    }

    /** Fetch a specific workflow by ID */
    async getWorkflow(id: number): Promise<N8nWorkflow> {
        const response = await this.get(`/api/v1/workflows/${id}`);
        return await response.json() as N8nWorkflow;
    }

    // ── Webhook Execution ──

    /** Call a webhook endpoint on the n8n instance */
    async callWebhook(
        path: string,
        method: string,
        payload?: Record<string, unknown>,
    ): Promise<N8nWebhookResponse> {
        const webhookUrl = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        try {
            const upperMethod = method.toUpperCase();
            const hasBody = upperMethod !== 'GET' && upperMethod !== 'HEAD';

            const response = await fetch(webhookUrl, {
                method: upperMethod,
                headers: { 'Content-Type': 'application/json' },
                ...(hasBody ? { body: JSON.stringify(payload ?? {}) } : {}),
                signal: controller.signal,
            });

            const data = await response.json().catch(() => null);
            const execId = response.headers.get('x-n8n-execution-id');

            return {
                status: response.status,
                data,
                ...(execId ? { executionId: execId } : {}),
            };
        } finally {
            clearTimeout(timer);
        }
    }

    // ── Internal ──

    private async get(path: string): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers: {
                    'X-N8N-API-KEY': this.apiKey,
                    'Accept': 'application/json',
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `n8n API error: ${response.status} ${response.statusText} — ${path}`,
                );
            }

            return response;
        } finally {
            clearTimeout(timer);
        }
    }
}
