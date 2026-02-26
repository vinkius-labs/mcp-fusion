// ============================================================================
// ToolSynthesizer — AwsLambdaConfig / AwsStepFunctionConfig → defineTool()
// ============================================================================

import type { AwsLambdaConfig, AwsStepFunctionConfig } from './types.js';
import type { AwsClient } from './AwsClient.js';

/**
 * Synthesized tool definition ready for `defineTool()`.
 *
 * This is the intermediate format between discovery and registration.
 * The `config` object matches `ToolConfig` from `@vinkius-core/mcp-fusion`.
 */
export interface SynthesizedToolConfig {
    /** Tool name (snake_case) */
    readonly name: string;
    /** Config object for defineTool() — contains description, actions/groups */
    readonly config: {
        readonly description: string;
        readonly tags: readonly string[];
        readonly actions: Readonly<Record<string, SynthesizedAction>>;
    };
}

export interface SynthesizedAction {
    readonly description: string;
    readonly readOnly?: boolean | undefined;
    readonly destructive?: boolean | undefined;
    readonly handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
}

// ── Name Conversion ──────────────────────────────────────

/**
 * Convert a function/resource name to a valid snake_case tool name.
 *
 * "CreateUser" → "create_user"
 * "my-awesome-lambda" → "my_awesome_lambda"
 * "get_users_v2" → "get_users_v2"
 *
 * @throws {Error} If the resulting name is empty after conversion
 */
export function toToolName(resourceName: string): string {
    const result = resourceName
        // PascalCase / camelCase → insert underscore before uppercase
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (result === '') {
        throw new Error(
            `toToolName: unable to derive a valid tool name from "${resourceName}". ` +
            'Resource names must contain at least one alphanumeric character.',
        );
    }

    return result;
}

// ── Lambda Synthesis ─────────────────────────────────────

/**
 * Synthesize tool configs from discovered Lambda functions.
 *
 * **Grouping logic:**
 * - Lambdas with the same `mcp:group` tag → grouped into ONE tool with N actions
 * - Lambdas without `mcp:group` → standalone tools with single `execute` action
 *
 * @throws {Error} If two Lambdas in the same group share an action name
 * @returns Array of tool configs ready for defineTool()
 */
export function synthesizeLambdaTools(
    lambdas: readonly AwsLambdaConfig[],
    client: AwsClient,
): SynthesizedToolConfig[] {
    const grouped = new Map<string, AwsLambdaConfig[]>();
    const standalone: AwsLambdaConfig[] = [];

    // ── Partition into groups vs standalone ──
    for (const lambda of lambdas) {
        if (lambda.group) {
            const existing = grouped.get(lambda.group) ?? [];
            existing.push(lambda);
            grouped.set(lambda.group, existing);
        } else {
            standalone.push(lambda);
        }
    }

    const tools: SynthesizedToolConfig[] = [];

    // ── Grouped tools (N Lambdas → 1 tool with N actions) ──
    for (const [groupName, members] of grouped) {
        const toolName = toToolName(groupName);
        const actions: Record<string, SynthesizedAction> = {};

        for (const lambda of members) {
            if (actions[lambda.actionName]) {
                throw new Error(
                    `Duplicate action "${lambda.actionName}" in group "${groupName}": ` +
                    `Lambda "${lambda.functionName}" conflicts with an existing action. ` +
                    'Each Lambda in a group must have a unique mcp:action tag.',
                );
            }
            actions[lambda.actionName] = buildLambdaAction(lambda, client);
        }

        tools.push({
            name: toolName,
            config: {
                description: buildGroupDescription(groupName, members),
                tags: extractUniqueTags(members),
                actions,
            },
        });
    }

    // ── Standalone tools (1 Lambda → 1 tool with 'execute' action) ──
    for (const lambda of standalone) {
        const toolName = toToolName(lambda.functionName);

        tools.push({
            name: toolName,
            config: {
                description: buildLambdaDescription(lambda),
                tags: extractResourceTags(lambda.tags),
                actions: {
                    [lambda.actionName]: buildLambdaAction(lambda, client),
                },
            },
        });
    }

    return tools;
}

// ── Step Function Synthesis ──────────────────────────────

/**
 * Synthesize tool configs from discovered Step Functions.
 *
 * Same grouping logic as Lambda.
 * Execution type determines handler behavior:
 * - EXPRESS → `startSyncExecution` (blocks, returns output)
 * - STANDARD → `startExecution` (fire-and-forget, returns LRO with cognitive rule)
 *
 * @throws {Error} If two state machines in the same group share an action name
 */
export function synthesizeStepFunctionTools(
    stateMachines: readonly AwsStepFunctionConfig[],
    client: AwsClient,
): SynthesizedToolConfig[] {
    const grouped = new Map<string, AwsStepFunctionConfig[]>();
    const standalone: AwsStepFunctionConfig[] = [];

    for (const sfn of stateMachines) {
        if (sfn.group) {
            const existing = grouped.get(sfn.group) ?? [];
            existing.push(sfn);
            grouped.set(sfn.group, existing);
        } else {
            standalone.push(sfn);
        }
    }

    const tools: SynthesizedToolConfig[] = [];

    for (const [groupName, members] of grouped) {
        const toolName = toToolName(groupName);
        const actions: Record<string, SynthesizedAction> = {};

        for (const sfn of members) {
            if (actions[sfn.actionName]) {
                throw new Error(
                    `Duplicate action "${sfn.actionName}" in group "${groupName}": ` +
                    `State machine "${sfn.name}" conflicts with an existing action. ` +
                    'Each state machine in a group must have a unique mcp:action tag.',
                );
            }
            actions[sfn.actionName] = buildSfnAction(sfn, client);
        }

        tools.push({
            name: toolName,
            config: {
                description: buildGroupDescription(groupName, members),
                tags: extractUniqueTags(members),
                actions,
            },
        });
    }

    for (const sfn of standalone) {
        const toolName = toToolName(sfn.name);

        tools.push({
            name: toolName,
            config: {
                description: buildSfnDescription(sfn),
                tags: extractResourceTags(sfn.tags),
                actions: {
                    [sfn.actionName]: buildSfnAction(sfn, client),
                },
            },
        });
    }

    return tools;
}

// ── Combined Synthesis ───────────────────────────────────

/**
 * Synthesize all tools from both Lambda and Step Function configs.
 */
export function synthesizeAll(
    lambdas: readonly AwsLambdaConfig[],
    stepFunctions: readonly AwsStepFunctionConfig[],
    client: AwsClient,
): SynthesizedToolConfig[] {
    return [
        ...synthesizeLambdaTools(lambdas, client),
        ...synthesizeStepFunctionTools(stepFunctions, client),
    ];
}

// ── Action Builders ──────────────────────────────────────

/**
 * Build a Lambda action handler.
 *
 * Handler returns the raw JS object from the Lambda response,
 * letting the MVA Presenter layer handle formatting.
 */
function buildLambdaAction(
    lambda: AwsLambdaConfig,
    client: AwsClient,
): SynthesizedAction {
    return {
        description: lambda.description || `Invoke Lambda: ${lambda.functionName}`,
        readOnly: lambda.readOnly || undefined,
        destructive: lambda.destructive || undefined,
        handler: async (_ctx: unknown, args: Record<string, unknown>) => {
            const result = await client.invokeLambda(lambda.functionArn, args);

            if (result.functionError) {
                // Return structured error — MVA pipeline picks this up
                return {
                    __error: true,
                    code: 'AWS_LAMBDA_ERROR',
                    message: `Lambda ${lambda.functionName} failed: ${result.functionError}`,
                    details: result.payload,
                };
            }

            // Return raw JS object — MVA Presenter/Egress Firewall acts on this
            return result.payload;
        },
    };
}

/**
 * Build a Step Function action handler.
 *
 * EXPRESS → synchronous execution, returns output.
 * STANDARD → async fire-and-forget with cognitive rule for LLM.
 */
function buildSfnAction(
    sfn: AwsStepFunctionConfig,
    client: AwsClient,
): SynthesizedAction {
    if (sfn.executionType === 'express') {
        return buildSfnExpressAction(sfn, client);
    }
    return buildSfnStandardAction(sfn, client);
}

/** Express SFN → sync execution, blocks until completion */
function buildSfnExpressAction(
    sfn: AwsStepFunctionConfig,
    client: AwsClient,
): SynthesizedAction {
    return {
        description: sfn.description || `Execute Step Function (Express): ${sfn.name}`,
        readOnly: sfn.readOnly || undefined,
        destructive: sfn.destructive || undefined,
        handler: async (_ctx: unknown, args: Record<string, unknown>) => {
            const result = await client.startSyncExecution(sfn.stateMachineArn, args);

            if (result.status !== 'SUCCEEDED') {
                return {
                    __error: true,
                    code: 'AWS_SFN_ERROR',
                    message: `Step Function ${sfn.name} failed: ${result.error}`,
                    cause: result.cause,
                    status: result.status,
                };
            }

            return result.output;
        },
    };
}

/** Standard SFN → fire-and-forget with LRO cognitive rule */
function buildSfnStandardAction(
    sfn: AwsStepFunctionConfig,
    client: AwsClient,
): SynthesizedAction {
    return {
        description: sfn.description || `Start Step Function (Standard): ${sfn.name}`,
        readOnly: sfn.readOnly || undefined,
        destructive: sfn.destructive || undefined,
        handler: async (_ctx: unknown, args: Record<string, unknown>) => {
            const result = await client.startExecution(sfn.stateMachineArn, args);

            // LRO: return execution context + cognitive rule for the LLM
            return {
                status: 'RUNNING',
                executionArn: result.executionArn,
                startedAt: result.startDate,
                _instruction: [
                    'CRITICAL: This is a long-running background process.',
                    'Do NOT assume completion or fabricate results.',
                    'Inform the user that the process has been started and is now running.',
                    `Execution ARN: ${result.executionArn}`,
                ].join(' '),
            };
        },
    };
}

// ── Description Builders ─────────────────────────────────

function buildLambdaDescription(lambda: AwsLambdaConfig): string {
    const lines = [
        `[Lambda] ${lambda.functionName}`,
        '',
        lambda.description || 'AWS Lambda function',
        '',
        `Runtime: ${lambda.runtime}`,
    ];
    return lines.join('\n');
}

function buildSfnDescription(sfn: AwsStepFunctionConfig): string {
    const lines = [
        `[Step Function — ${sfn.executionType.toUpperCase()}] ${sfn.name}`,
        '',
        sfn.description || 'AWS Step Functions state machine',
    ];
    return lines.join('\n');
}

function buildGroupDescription(
    groupName: string,
    members: ReadonlyArray<{ actionName: string; description: string }>,
): string {
    const lines = [
        `[AWS] ${groupName}`,
        '',
        `Available actions: ${members.map(m => m.actionName).join(', ')}`,
    ];
    return lines.join('\n');
}

// ── Tag Helpers ──────────────────────────────────────────

/** Extract unique non-MCP tags from a group of resources */
function extractUniqueTags(
    members: ReadonlyArray<{ tags: Readonly<Record<string, string>> }>,
): string[] {
    const seen = new Set<string>();
    for (const member of members) {
        for (const [key, value] of Object.entries(member.tags)) {
            if (!key.startsWith('mcp:') && !key.startsWith('aws:')) {
                seen.add(`${key}:${value}`);
            }
        }
    }
    return [...seen];
}

/** Extract non-MCP tags from a single resource */
function extractResourceTags(tags: Readonly<Record<string, string>>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(tags)) {
        if (!key.startsWith('mcp:') && !key.startsWith('aws:')) {
            result.push(`${key}:${value}`);
        }
    }
    return result;
}
