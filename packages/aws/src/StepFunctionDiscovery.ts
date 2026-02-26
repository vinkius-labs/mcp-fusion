// ============================================================================
// StepFunctionDiscovery — Discover SFN state machines via AWS tags
// ============================================================================

import type { AwsClient, SfnStateMachineSummary } from './AwsClient.js';
import type { AwsStepFunctionConfig } from './types.js';
import { MCP_TAGS, DEFAULT_TAG_FILTER, DEFAULT_ACTION_NAME } from './types.js';

export interface SfnDiscoveryOptions {
    /** Tag filter — only state machines matching ALL tags are included.
     *  Default: `{ 'mcp:expose': 'true' }` */
    readonly tagFilter?: Readonly<Record<string, string>> | undefined;
}

/**
 * Discovers Step Functions state machines tagged with `mcp:expose = true`
 * and extracts MCP-relevant metadata.
 *
 * **Optimization:** `type` (EXPRESS/STANDARD) is read from ListStateMachines
 * directly — no extra `DescribeStateMachine` call needed just for type detection.
 * `DescribeStateMachine` is only called to fetch the `description` field.
 *
 * Additional tags:
 * - `mcp:sfn-type` — 'express' for sync or 'standard' for async (LRO pattern)
 * - `mcp:group` / `mcp:action` — grouping (same as Lambda)
 */
export class StepFunctionDiscovery {
    private readonly tagFilter: Readonly<Record<string, string>>;

    constructor(
        private readonly client: AwsClient,
        private readonly options: SfnDiscoveryOptions = {},
    ) {
        this.tagFilter = options.tagFilter ?? DEFAULT_TAG_FILTER;
    }

    /** Discover all tagged state machines and return their configs */
    async discover(): Promise<AwsStepFunctionConfig[]> {
        const allMachines = await this.client.listStateMachines();
        const configs: AwsStepFunctionConfig[] = [];

        for (const sm of allMachines) {
            const tags = await this.client.getStateMachineTags(sm.stateMachineArn);

            if (this.matchesTagFilter(tags)) {
                // Only call describeStateMachine for the description field.
                // `type` is already available from ListStateMachines response.
                const details = await this.client.describeStateMachine(sm.stateMachineArn);
                configs.push(this.extractConfig(sm, tags, details.description));
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

    /** Extract AwsStepFunctionConfig from a state machine summary + tags */
    private extractConfig(
        sm: SfnStateMachineSummary,
        tags: Record<string, string>,
        description: string,
    ): AwsStepFunctionConfig {
        // Determine execution type: tag overrides API type
        const sfnTypeTag = tags[MCP_TAGS.SFN_TYPE]?.toLowerCase();
        const executionType: 'express' | 'standard' =
            sfnTypeTag === 'express' ? 'express'
                : sfnTypeTag === 'standard' ? 'standard'
                : sm.type === 'EXPRESS' ? 'express'
                : 'standard';

        return {
            name: sm.name,
            stateMachineArn: sm.stateMachineArn,
            description,
            executionType,
            group: tags[MCP_TAGS.GROUP],
            actionName: tags[MCP_TAGS.ACTION] ?? DEFAULT_ACTION_NAME,
            readOnly: tags[MCP_TAGS.READ_ONLY] === 'true',
            destructive: tags[MCP_TAGS.DESTRUCTIVE] === 'true',
            tags,
        };
    }
}
