// ============================================================================
// AWS Connector Types — Internal type definitions for the AWS connector
// ============================================================================

import type { LambdaAdapter, SfnAdapter } from './AwsClient.js';

// ── Discovered Resource Configs ──────────────────────────

/** Discovered Lambda function configuration */
export interface AwsLambdaConfig {
    /** Lambda function name */
    readonly functionName: string;
    /** Full ARN */
    readonly functionArn: string;
    /** Lambda description (≤256 chars — used for LLM semantics only) */
    readonly description: string;
    /** Runtime (e.g. 'nodejs20.x') */
    readonly runtime: string;
    /** MCP group name (from `mcp:group` tag). Undefined = standalone tool */
    readonly group?: string | undefined;
    /** MCP action name (from `mcp:action` tag). Default: 'execute' */
    readonly actionName: string;
    /** Read-only hint (from `mcp:readOnly` tag) */
    readonly readOnly: boolean;
    /** Destructive hint (from `mcp:destructive` tag) */
    readonly destructive: boolean;
    /** All AWS tags on the function */
    readonly tags: Readonly<Record<string, string>>;
}

/** Discovered Step Functions state machine configuration */
export interface AwsStepFunctionConfig {
    /** State machine name */
    readonly name: string;
    /** Full ARN */
    readonly stateMachineArn: string;
    /** State machine description */
    readonly description: string;
    /** Execution type: EXPRESS → sync, STANDARD → fire-and-forget with LRO pattern */
    readonly executionType: 'express' | 'standard';
    /** MCP group name (from `mcp:group` tag). Undefined = standalone tool */
    readonly group?: string | undefined;
    /** MCP action name (from `mcp:action` tag). Default: 'execute' */
    readonly actionName: string;
    /** Read-only hint */
    readonly readOnly: boolean;
    /** Destructive hint */
    readonly destructive: boolean;
    /** All AWS tags */
    readonly tags: Readonly<Record<string, string>>;
}

// ── Invocation Responses ─────────────────────────────────

/** Lambda invocation result from AwsClient */
export interface LambdaInvokeResult {
    /** HTTP status code */
    readonly statusCode: number;
    /** Decoded response payload (parsed JSON) */
    readonly payload: unknown;
    /** Function error type (if function failed) */
    readonly functionError?: string | undefined;
    /** Execution log tail (if requested) */
    readonly logResult?: string | undefined;
}

/** Step Functions execution result (Express — synchronous) */
export interface SfnSyncResult {
    /** Execution status */
    readonly status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
    /** Parsed output */
    readonly output: unknown;
    /** Error info (if failed) */
    readonly error?: string | undefined;
    /** Cause (if failed) */
    readonly cause?: string | undefined;
    /** Execution ARN */
    readonly executionArn: string;
}

/** Step Functions execution result (Standard — async fire-and-forget) */
export interface SfnAsyncResult {
    /** Execution ARN (use to poll for completion) */
    readonly executionArn: string;
    /** Start timestamp (ISO 8601) */
    readonly startDate: string;
}

// ── Connector Configuration ──────────────────────────────

/**
 * Configuration for the AWS connector.
 *
 * Auth uses IoC: inject pre-configured `LambdaAdapter` / `SfnAdapter`
 * created via `createLambdaAdapter()` / `createSfnAdapter()`.
 *
 * ```typescript
 * import { LambdaClient } from '@aws-sdk/client-lambda';
 * import { createLambdaAdapter, createAwsConnector } from 'mcp-fusion-aws';
 *
 * const aws = await createAwsConnector({
 *     lambdaClient: await createLambdaAdapter(new LambdaClient({ region: 'us-east-1' })),
 * });
 * ```
 */
export interface AwsConnectorConfig {
    /**
     * Lambda adapter created via `createLambdaAdapter()`.
     * Required when `enableLambda` is true (default).
     */
    readonly lambdaClient?: LambdaAdapter | undefined;

    /**
     * Step Functions adapter created via `createSfnAdapter()`.
     * Required when `enableStepFunctions` is true.
     */
    readonly sfnClient?: SfnAdapter | undefined;

    /**
     * Tag filter for discovery. Only resources matching ALL tags are included.
     * Default: `{ 'mcp:expose': 'true' }`
     */
    readonly tagFilter?: Readonly<Record<string, string>> | undefined;

    /** Enable Lambda function discovery (default: true) */
    readonly enableLambda?: boolean | undefined;

    /** Enable Step Functions discovery (default: false) */
    readonly enableStepFunctions?: boolean | undefined;

    /**
     * Polling interval in ms for live state sync (default: off).
     * Set to enable auto-refresh of the tool list.
     */
    readonly pollInterval?: number | undefined;

    /**
     * Called when the tool list changes after a poll cycle.
     * Use this to emit `notifications/tools/list_changed` on your MCP server.
     */
    readonly onChange?: (() => void) | undefined;

    /**
     * Called when a polling cycle encounters an error.
     * Default: errors are silently ignored (next cycle retries).
     */
    readonly onError?: ((error: unknown) => void) | undefined;
}

// ── Manual Tool Definition ───────────────────────────────

/** Configuration for manually defining an AWS Lambda/SFN as a tool */
export interface AwsToolConfig {
    /** Lambda function ARN or Step Function ARN */
    readonly arn: string;
    /** Tool description for the LLM */
    readonly description?: string | undefined;
    /** MCP annotations */
    readonly annotations?: {
        readonly readOnlyHint?: boolean | undefined;
        readonly destructiveHint?: boolean | undefined;
    } | undefined;
}

// ── Tag Constants ────────────────────────────────────────

/** AWS tag keys used by the connector */
export const MCP_TAGS = {
    /** Opt-in tag — must be 'true' for a resource to be discovered */
    EXPOSE: 'mcp:expose',
    /** Groups multiple Lambdas/SFNs into a single MCP tool */
    GROUP: 'mcp:group',
    /** Action name within a group (default: 'execute') */
    ACTION: 'mcp:action',
    /** Marks the action as read-only */
    READ_ONLY: 'mcp:readOnly',
    /** Marks the action as destructive */
    DESTRUCTIVE: 'mcp:destructive',
    /** Step Function execution type: 'express' or 'standard' */
    SFN_TYPE: 'mcp:sfn-type',
} as const;

/** Default tag filter for discovery */
export const DEFAULT_TAG_FILTER: Readonly<Record<string, string>> = {
    [MCP_TAGS.EXPOSE]: 'true',
};

/** Default action name for standalone (ungrouped) resources */
export const DEFAULT_ACTION_NAME = 'execute';
