// ============================================================================
// createAwsConnector — Auto-discovery mode with live state sync
// ============================================================================

import { AwsClient } from './AwsClient.js';
import type { LambdaAdapter, SfnAdapter } from './AwsClient.js';
import { LambdaDiscovery } from './LambdaDiscovery.js';
import { StepFunctionDiscovery } from './StepFunctionDiscovery.js';
import { synthesizeAll, type SynthesizedToolConfig } from './ToolSynthesizer.js';
import type {
    AwsConnectorConfig,
    AwsLambdaConfig,
    AwsStepFunctionConfig,
} from './types.js';

/**
 * The AWS connector — auto-discovers tagged Lambda functions and
 * Step Functions, producing tool configs ready for `defineTool()`.
 *
 * ```typescript
 * import { LambdaClient } from '@aws-sdk/client-lambda';
 * import { createLambdaAdapter, createAwsConnector } from '@vinkius-core/mcp-fusion-aws';
 *
 * const aws = await createAwsConnector({
 *     lambdaClient: await createLambdaAdapter(new LambdaClient({ region: 'us-east-1' })),
 *     pollInterval: 60_000,
 *     onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
 * });
 *
 * const registry = new ToolRegistry();
 * for (const tool of aws.tools()) {
 *     registry.register(defineTool(tool.name, tool.config));
 * }
 * ```
 */
export interface AwsConnector {
    /** The underlying AWS client */
    readonly client: AwsClient;
    /** Discovered Lambda function metadata */
    readonly lambdas: readonly AwsLambdaConfig[];
    /** Discovered Step Function metadata */
    readonly stepFunctions: readonly AwsStepFunctionConfig[];
    /** Pre-synthesized tool configs ready for defineTool() */
    tools(): readonly SynthesizedToolConfig[];
    /** Re-discover resources (manual poll). Returns true if the tool list changed. */
    refresh(): Promise<boolean>;
    /** Stop the background polling loop (if active) */
    stop(): void;
}

/**
 * Create an AWS connector that auto-discovers tagged resources.
 *
 * If `pollInterval` is set, starts a background polling loop that
 * re-discovers resources and calls `onChange()` when the tool list changes.
 * This enables zero-downtime hot-reload: the MCP server emits
 * `notifications/tools/list_changed` and the LLM refreshes instantly.
 */
export async function createAwsConnector(
    config: AwsConnectorConfig,
): Promise<AwsConnector> {
    const enableLambda = config.enableLambda ?? true;
    const enableSfn = config.enableStepFunctions ?? false;

    const client = new AwsClient(
        enableLambda ? (config.lambdaClient as LambdaAdapter | undefined) : undefined,
        enableSfn ? (config.sfnClient as SfnAdapter | undefined) : undefined,
    );

    const discoveryOpts = config.tagFilter
        ? { tagFilter: config.tagFilter }
        : {};

    const lambdaDiscovery = enableLambda
        ? new LambdaDiscovery(client, discoveryOpts)
        : undefined;

    const sfnDiscovery = enableSfn
        ? new StepFunctionDiscovery(client, discoveryOpts)
        : undefined;

    // ── Initial Discovery ──
    let discoveredLambdas: AwsLambdaConfig[] = lambdaDiscovery
        ? await lambdaDiscovery.discover()
        : [];

    let discoveredSfns: AwsStepFunctionConfig[] = sfnDiscovery
        ? await sfnDiscovery.discover()
        : [];

    let synthesized = synthesizeAll(discoveredLambdas, discoveredSfns, client);

    // ── Background Polling (Live State Sync) ──
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Compute a fingerprint from tool names + descriptions + action annotations
     * for change detection. Detects name changes, description changes,
     * and readOnly/destructive annotation changes.
     */
    function fingerprint(tools: readonly SynthesizedToolConfig[]): string {
        return tools.map(t => {
            const actionKeys = Object.keys(t.config.actions).sort();
            const actionFingerprints = actionKeys.map(k => {
                const action = t.config.actions[k];
                if (!action) return k;
                return `${k}:${action.readOnly ?? ''}:${action.destructive ?? ''}`;
            });
            return `${t.name}|${t.config.description}|${actionFingerprints.join(';')}`;
        }).sort().join('\n');
    }

    let lastFingerprint = fingerprint(synthesized);

    /**
     * Refresh and detect changes. Returns `true` if the tool list changed.
     */
    async function refresh(): Promise<boolean> {
        discoveredLambdas = lambdaDiscovery
            ? await lambdaDiscovery.discover()
            : [];

        discoveredSfns = sfnDiscovery
            ? await sfnDiscovery.discover()
            : [];

        const newSynth = synthesizeAll(discoveredLambdas, discoveredSfns, client);
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
            } catch (error: unknown) {
                // Report polling errors via callback if provided
                if (config.onError) {
                    config.onError(error);
                }
                // Otherwise silently retry on next cycle —
                // AWS might be temporarily unreachable.
            }
        }, config.pollInterval);

        // Ensure the timer doesn't prevent Node.js from exiting
        if (typeof pollTimer === 'object' && 'unref' in pollTimer) {
            pollTimer.unref();
        }
    }

    return {
        client,

        get lambdas() {
            return discoveredLambdas;
        },

        get stepFunctions() {
            return discoveredSfns;
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
