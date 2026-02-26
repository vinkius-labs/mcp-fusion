// ============================================================================
// LambdaDiscovery — Discover Lambda functions via AWS tags
// ============================================================================

import type { AwsClient, LambdaFunctionSummary } from './AwsClient.js';
import type { AwsLambdaConfig } from './types.js';
import { MCP_TAGS, DEFAULT_TAG_FILTER, DEFAULT_ACTION_NAME } from './types.js';

export interface LambdaDiscoveryOptions {
    /** Tag filter — only functions matching ALL tags are included.
     *  Default: `{ 'mcp:expose': 'true' }` */
    readonly tagFilter?: Readonly<Record<string, string>> | undefined;
}

/**
 * Discovers Lambda functions tagged with `mcp:expose = true`
 * and extracts MCP-relevant metadata from their tags.
 *
 * Tag convention:
 * - `mcp:expose` — opt-in (required)
 * - `mcp:group` — groups multiple Lambdas into a single MCP tool
 * - `mcp:action` — action name within a group (default: 'execute')
 * - `mcp:readOnly` — marks the action as read-only
 * - `mcp:destructive` — marks the action as destructive
 */
export class LambdaDiscovery {
    private readonly tagFilter: Readonly<Record<string, string>>;

    constructor(
        private readonly client: AwsClient,
        private readonly options: LambdaDiscoveryOptions = {},
    ) {
        this.tagFilter = options.tagFilter ?? DEFAULT_TAG_FILTER;
    }

    /** Discover all tagged Lambda functions and return their configs */
    async discover(): Promise<AwsLambdaConfig[]> {
        const allFunctions = await this.client.listLambdaFunctions();
        const configs: AwsLambdaConfig[] = [];

        for (const fn of allFunctions) {
            const tags = await this.client.getLambdaTags(fn.functionArn);

            if (this.matchesTagFilter(tags)) {
                configs.push(this.extractConfig(fn, tags));
            }
        }

        return configs;
    }

    // ── Internal ──────────────────────────────────────────

    /** Check if tags match the required tag filter */
    private matchesTagFilter(tags: Record<string, string>): boolean {
        for (const [key, value] of Object.entries(this.tagFilter)) {
            if (tags[key] !== value) return false;
        }
        return true;
    }

    /** Extract AwsLambdaConfig from a function summary + its tags */
    private extractConfig(
        fn: LambdaFunctionSummary,
        tags: Record<string, string>,
    ): AwsLambdaConfig {
        return {
            functionName: fn.functionName,
            functionArn: fn.functionArn,
            description: fn.description,
            runtime: fn.runtime,
            group: tags[MCP_TAGS.GROUP],
            actionName: tags[MCP_TAGS.ACTION] ?? DEFAULT_ACTION_NAME,
            readOnly: tags[MCP_TAGS.READ_ONLY] === 'true',
            destructive: tags[MCP_TAGS.DESTRUCTIVE] === 'true',
            tags,
        };
    }
}
