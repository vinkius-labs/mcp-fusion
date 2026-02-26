// ============================================================================
// defineAwsTool — Manual/surgical mode (like defineN8nTool)
// ============================================================================

import type { AwsClient } from './AwsClient.js';
import type { AwsToolConfig } from './types.js';
import type { SynthesizedToolConfig, SynthesizedAction } from './ToolSynthesizer.js';

/**
 * Manually define an AWS resource (Lambda or Step Function) as an MCP Fusion tool.
 *
 * For when architects need surgical control: strict params,
 * custom annotations, specific middleware chains.
 *
 * **ARN detection:**
 * - `arn:aws:lambda:...` → invokes via `invokeLambda()`
 * - `arn:aws:states:...` → invokes via `startSyncExecution()` (Express SFN)
 *
 * For Standard Step Functions (async LRO), use `createAwsConnector` auto-mode
 * with the `mcp:sfn-type` tag instead — manual mode assumes sync execution.
 *
 * ```typescript
 * const tool = defineAwsTool('deploy_staging', client, {
 *     arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy',
 *     description: 'Deploy to staging environment',
 *     annotations: { destructiveHint: true },
 * });
 *
 * const builder = defineTool(tool.name, tool.config);
 * registry.register(builder);
 * ```
 */
export function defineAwsTool(
    name: string,
    client: AwsClient,
    config: AwsToolConfig,
): SynthesizedToolConfig {
    const isStepFunction = config.arn.includes(':states:');
    const isReadOnly = config.annotations?.readOnlyHint ?? false;
    const isDestructive = config.annotations?.destructiveHint ?? false;

    const handler = isStepFunction
        ? buildSfnHandler(client, config)
        : buildLambdaHandler(client, config);

    const description = config.description
        ?? (isStepFunction
            ? `[AWS Step Function] ${config.arn}`
            : `[AWS Lambda] ${config.arn}`);

    const action: SynthesizedAction = {
        description: `Execute ${name}`,
        readOnly: isReadOnly || undefined,
        destructive: isDestructive || undefined,
        handler,
    };

    return {
        name,
        config: {
            description,
            tags: [],
            actions: {
                execute: action,
            },
        },
    };
}

// ── Handler Builders ─────────────────────────────────────

function buildLambdaHandler(
    client: AwsClient,
    config: AwsToolConfig,
): SynthesizedAction['handler'] {
    return async (_ctx: unknown, args: Record<string, unknown>) => {
        const result = await client.invokeLambda(config.arn, args);

        if (result.functionError) {
            return {
                __error: true,
                code: 'AWS_LAMBDA_ERROR',
                message: `Lambda failed: ${result.functionError}`,
                details: result.payload,
            };
        }

        return result.payload;
    };
}

function buildSfnHandler(
    client: AwsClient,
    config: AwsToolConfig,
): SynthesizedAction['handler'] {
    return async (_ctx: unknown, args: Record<string, unknown>) => {
        const result = await client.startSyncExecution(config.arn, args);

        if (result.status !== 'SUCCEEDED') {
            return {
                __error: true,
                code: 'AWS_SFN_ERROR',
                message: `Step Function failed: ${result.error}`,
                cause: result.cause,
                status: result.status,
            };
        }

        return result.output;
    };
}
