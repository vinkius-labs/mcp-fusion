// ============================================================================
// createN8nConnector — Auto-discovery mode (the Growth Hack)
// ============================================================================

import { N8nClient, type N8nClientConfig } from './N8nClient.js';
import { WorkflowDiscovery, type DiscoveryOptions } from './WorkflowDiscovery.js';
import { synthesizeAll, type SynthesizedTool } from './ToolSynthesizer.js';
import type { N8nConnectorConfig, WebhookConfig } from './types.js';

/**
 * The n8n connector — auto-discovers webhook workflows and produces
 * tool definitions ready for MCP Fusion's `defineTool()`.
 *
 * ```typescript
 * const n8n = await createN8nConnector({
 *   url: '...', apiKey: '...',
 *   pollInterval: 60_000,
 *   onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
 * });
 * ```
 */
export interface N8nConnector {
    /** The HTTP client for n8n API — expose in context if needed */
    readonly client: N8nClient;
    /** Discovered webhook workflow metadata */
    readonly workflows: readonly WebhookConfig[];
    /** Pre-synthesized tool definitions ready for defineTool() */
    tools(): readonly SynthesizedTool[];
    /** Re-discover workflows (manual poll) */
    refresh(): Promise<boolean>;
    /** Stop the background polling loop (if active) */
    stop(): void;
}

/**
 * Create an n8n connector that auto-discovers webhook workflows.
 *
 * If `pollInterval` is set, starts a background polling loop that
 * re-discovers workflows and calls `onChange()` when the tool list changes.
 * This enables zero-downtime hot-reload: the MCP server emits
 * `notifications/tools/list_changed` and Claude refreshes instantly.
 */
export async function createN8nConnector(
    config: N8nConnectorConfig,
): Promise<N8nConnector> {
    const clientConfig: N8nClientConfig = {
        url: config.url,
        apiKey: config.apiKey,
        ...(config.timeout != null ? { timeout: config.timeout } : {}),
    };
    const client = new N8nClient(clientConfig);

    const discoveryOpts: DiscoveryOptions = {
        ...(config.includeTags ? { includeTags: config.includeTags } : {}),
        ...(config.excludeTags ? { excludeTags: config.excludeTags } : {}),
    };
    const discovery = new WorkflowDiscovery(client, discoveryOpts);

    let webhooks = await discovery.discover();
    let synthesized = synthesizeAll(webhooks, client);

    // ── Background Polling (Live State Sync) ──
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    /** Compute a fingerprint from tool names for change detection */
    function fingerprint(tools: readonly SynthesizedTool[]): string {
        return tools.map(t => t.name).sort().join(',');
    }

    let lastFingerprint = fingerprint(synthesized);

    /**
     * Refresh and detect changes. Returns `true` if the tool list changed.
     */
    async function refresh(): Promise<boolean> {
        webhooks = await discovery.discover();
        const newSynth = synthesizeAll(webhooks, client);
        const newFp = fingerprint(newSynth);
        const changed = newFp !== lastFingerprint;
        synthesized = newSynth;
        lastFingerprint = newFp;
        return changed;
    }

    // Start polling if interval is configured
    if (config.pollInterval != null && config.pollInterval > 0) {
        pollTimer = setInterval(async () => {
            try {
                const changed = await refresh();
                if (changed && config.onChange) {
                    config.onChange();
                }
            } catch {
                // Polling errors are silently swallowed — n8n might be
                // temporarily unreachable. Next cycle will retry.
            }
        }, config.pollInterval);

        // Ensure the timer doesn't prevent Node.js from exiting
        if (typeof pollTimer === 'object' && 'unref' in pollTimer) {
            pollTimer.unref();
        }
    }

    return {
        client,

        get workflows() {
            return webhooks;
        },

        tools() {
            return synthesized;
        },

        refresh,

        stop() {
            if (pollTimer != null) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        },
    };
}
