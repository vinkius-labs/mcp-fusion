// ============================================================================
// AwsClient — Wrapper for AWS SDK Lambda & Step Functions APIs
// ============================================================================

import type {
    LambdaInvokeResult,
    SfnSyncResult,
    SfnAsyncResult,
} from './types.js';

/**
 * Minimal wrapper around the AWS SDK Lambda and Step Functions clients.
 *
 * Accepts pre-configured adapter instances (IoC for enterprise).
 * Adapters abstract away the AWS SDK Command pattern, letting
 * the rest of the codebase focus on business logic.
 *
 * **Why adapters instead of raw SDK clients?**
 * AWS SDK v3 uses `client.send(new Command(input))`.
 * Adapters encapsulate this pattern, keeping the surface clean
 * and testable via simple interface mocks.
 */
export class AwsClient {

    constructor(
        private readonly lambda: LambdaAdapter | undefined,
        private readonly sfn: SfnAdapter | undefined,
    ) {}

    // ── Lambda ───────────────────────────────────────────

    /** List all Lambda functions (paginated) */
    async listLambdaFunctions(): Promise<LambdaFunctionSummary[]> {
        return this.requireLambda().listFunctions();
    }

    /** Get tags for a Lambda function by ARN */
    async getLambdaTags(arn: string): Promise<Record<string, string>> {
        return this.requireLambda().listTags(arn);
    }

    /** Invoke a Lambda function synchronously (RequestResponse) */
    async invokeLambda(arn: string, payload: unknown): Promise<LambdaInvokeResult> {
        return this.requireLambda().invoke(arn, payload);
    }

    // ── Step Functions ────────────────────────────────────

    /** List all Step Functions state machines (paginated) */
    async listStateMachines(): Promise<SfnStateMachineSummary[]> {
        return this.requireSfn().listStateMachines();
    }

    /** Get tags for a Step Function */
    async getStateMachineTags(arn: string): Promise<Record<string, string>> {
        return this.requireSfn().listTags(arn);
    }

    /** Describe a Step Function state machine */
    async describeStateMachine(arn: string): Promise<{ description: string; type: string }> {
        return this.requireSfn().describe(arn);
    }

    /** Start a synchronous execution (Express Step Functions) */
    async startSyncExecution(arn: string, input: unknown): Promise<SfnSyncResult> {
        return this.requireSfn().startSync(arn, input);
    }

    /** Start an asynchronous execution (Standard Step Functions) */
    async startExecution(arn: string, input: unknown): Promise<SfnAsyncResult> {
        return this.requireSfn().startAsync(arn, input);
    }

    // ── Internal ─────────────────────────────────────────

    private requireLambda(): LambdaAdapter {
        if (!this.lambda) {
            throw new Error(
                'AwsClient: Lambda adapter not configured. ' +
                'Pass a LambdaAdapter via createLambdaAdapter() in your connector config.',
            );
        }
        return this.lambda;
    }

    private requireSfn(): SfnAdapter {
        if (!this.sfn) {
            throw new Error(
                'AwsClient: Step Functions adapter not configured. ' +
                'Pass an SfnAdapter via createSfnAdapter() in your connector config.',
            );
        }
        return this.sfn;
    }
}

// ── Adapter Interfaces ───────────────────────────────────

/**
 * Adapter interface for Lambda SDK interactions.
 * Users create these via `createLambdaAdapter()`.
 */
export interface LambdaAdapter {
    listFunctions(): Promise<LambdaFunctionSummary[]>;
    listTags(arn: string): Promise<Record<string, string>>;
    invoke(arn: string, payload: unknown): Promise<LambdaInvokeResult>;
}

/**
 * Adapter interface for Step Functions SDK interactions.
 * Users create these via `createSfnAdapter()`.
 */
export interface SfnAdapter {
    listStateMachines(): Promise<SfnStateMachineSummary[]>;
    listTags(arn: string): Promise<Record<string, string>>;
    describe(arn: string): Promise<{ description: string; type: string }>;
    startSync(arn: string, input: unknown): Promise<SfnSyncResult>;
    startAsync(arn: string, input: unknown): Promise<SfnAsyncResult>;
}

// ── Summary Types ────────────────────────────────────────

/** Summarized Lambda function from discovery */
export interface LambdaFunctionSummary {
    readonly functionName: string;
    readonly functionArn: string;
    readonly description: string;
    readonly runtime: string;
}

/** Summarized Step Function state machine from discovery */
export interface SfnStateMachineSummary {
    readonly name: string;
    readonly stateMachineArn: string;
    /** State machine type — available from ListStateMachines directly */
    readonly type: string;
}

// ── SDK Response Shapes (for typed casting) ──────────────

/** Shape of a Lambda function in ListFunctions response */
interface ListFunctionsResponse {
    Functions?: Array<{
        FunctionName?: string;
        FunctionArn?: string;
        Description?: string;
        Runtime?: string;
    }>;
    NextMarker?: string;
}

/** Shape of ListTags response */
interface ListTagsResponse {
    Tags?: Record<string, string>;
}

/** Shape of Invoke response */
interface InvokeResponse {
    StatusCode?: number;
    Payload?: Uint8Array;
    FunctionError?: string;
    LogResult?: string;
}

/** Shape of ListStateMachines response */
interface ListStateMachinesResponse {
    stateMachines?: Array<{
        name?: string;
        stateMachineArn?: string;
        type?: string;
    }>;
    nextToken?: string;
}

/** Shape of ListTagsForResource response (SFN) */
interface SfnListTagsResponse {
    tags?: Array<{ key: string; value: string }>;
}

/** Shape of DescribeStateMachine response */
interface DescribeStateMachineResponse {
    description?: string;
    type?: string;
}

/** Shape of StartSyncExecution response */
interface StartSyncExecutionResponse {
    status?: string;
    output?: string;
    error?: string;
    cause?: string;
    executionArn?: string;
}

/** Shape of StartExecution response */
interface StartExecutionResponse {
    executionArn?: string;
    startDate?: Date;
}

// ── Adapter Factories ────────────────────────────────────

/**
 * Create a Lambda adapter from a real AWS SDK v3 `LambdaClient`.
 *
 * Uses `client.send(new Command())` pattern — compatible with the real SDK.
 * Requires `@aws-sdk/client-lambda` to be installed (Command classes
 * are dynamically imported at runtime).
 *
 * ```typescript
 * import { LambdaClient } from '@aws-sdk/client-lambda';
 * const adapter = await createLambdaAdapter(new LambdaClient({ region: 'us-east-1' }));
 * ```
 */
export async function createLambdaAdapter(
    client: AwsSdkClientLike,
): Promise<LambdaAdapter> {
    const {
        ListFunctionsCommand,
        ListTagsCommand,
        InvokeCommand,
    } = await import('@aws-sdk/client-lambda');

    return {
        async listFunctions(): Promise<LambdaFunctionSummary[]> {
            const functions: LambdaFunctionSummary[] = [];
            let marker: string | undefined;

            do {
                const response = await client.send(
                    new ListFunctionsCommand({ Marker: marker }),
                ) as ListFunctionsResponse;

                const fns = response.Functions ?? [];
                for (const fn of fns) {
                    functions.push({
                        functionName: fn.FunctionName ?? '',
                        functionArn: fn.FunctionArn ?? '',
                        description: fn.Description ?? '',
                        runtime: fn.Runtime ?? 'unknown',
                    });
                }
                marker = response.NextMarker;
            } while (marker);

            return functions;
        },

        async listTags(arn: string): Promise<Record<string, string>> {
            const response = await client.send(
                new ListTagsCommand({ Resource: arn }),
            ) as ListTagsResponse;
            return response.Tags ?? {};
        },

        async invoke(arn: string, payload: unknown): Promise<LambdaInvokeResult> {
            const response = await client.send(
                new InvokeCommand({
                    FunctionName: arn,
                    InvocationType: 'RequestResponse',
                    Payload: new TextEncoder().encode(JSON.stringify(payload ?? {})),
                }),
            ) as InvokeResponse;

            const rawPayload = response.Payload
                ? new TextDecoder().decode(response.Payload)
                : 'null';

            let parsed: unknown;
            try {
                parsed = JSON.parse(rawPayload);
            } catch {
                parsed = rawPayload;
            }

            return {
                statusCode: response.StatusCode ?? 200,
                payload: parsed,
                functionError: response.FunctionError,
                logResult: response.LogResult,
            };
        },
    };
}

/**
 * Create a Step Functions adapter from a real AWS SDK v3 `SFNClient`.
 *
 * Uses `client.send(new Command())` pattern — compatible with the real SDK.
 * Requires `@aws-sdk/client-sfn` to be installed.
 *
 * ```typescript
 * import { SFNClient } from '@aws-sdk/client-sfn';
 * const adapter = await createSfnAdapter(new SFNClient({ region: 'us-east-1' }));
 * ```
 */
export async function createSfnAdapter(
    client: AwsSdkClientLike,
): Promise<SfnAdapter> {
    const {
        ListStateMachinesCommand,
        ListTagsForResourceCommand,
        DescribeStateMachineCommand,
        StartSyncExecutionCommand,
        StartExecutionCommand,
    } = await import('@aws-sdk/client-sfn');

    return {
        async listStateMachines(): Promise<SfnStateMachineSummary[]> {
            const machines: SfnStateMachineSummary[] = [];
            let nextToken: string | undefined;

            do {
                const response = await client.send(
                    new ListStateMachinesCommand({ nextToken }),
                ) as ListStateMachinesResponse;

                const sms = response.stateMachines ?? [];
                for (const sm of sms) {
                    machines.push({
                        name: sm.name ?? '',
                        stateMachineArn: sm.stateMachineArn ?? '',
                        type: sm.type ?? 'STANDARD',
                    });
                }
                nextToken = response.nextToken;
            } while (nextToken);

            return machines;
        },

        async listTags(arn: string): Promise<Record<string, string>> {
            const response = await client.send(
                new ListTagsForResourceCommand({ resourceArn: arn }),
            ) as SfnListTagsResponse;

            const tags: Record<string, string> = {};
            const rawTags = response.tags ?? [];
            for (const tag of rawTags) {
                tags[tag.key] = tag.value;
            }
            return tags;
        },

        async describe(arn: string): Promise<{ description: string; type: string }> {
            const response = await client.send(
                new DescribeStateMachineCommand({ stateMachineArn: arn }),
            ) as DescribeStateMachineResponse;

            return {
                description: response.description ?? '',
                type: response.type ?? 'STANDARD',
            };
        },

        async startSync(arn: string, input: unknown): Promise<SfnSyncResult> {
            const response = await client.send(
                new StartSyncExecutionCommand({
                    stateMachineArn: arn,
                    input: JSON.stringify(input ?? {}),
                }),
            ) as StartSyncExecutionResponse;

            let output: unknown;
            const rawOutput = response.output;
            try {
                output = rawOutput ? JSON.parse(rawOutput) : null;
            } catch {
                output = rawOutput;
            }

            return {
                status: (response.status ?? 'FAILED') as SfnSyncResult['status'],
                output,
                error: response.error,
                cause: response.cause,
                executionArn: response.executionArn ?? '',
            };
        },

        async startAsync(arn: string, input: unknown): Promise<SfnAsyncResult> {
            const response = await client.send(
                new StartExecutionCommand({
                    stateMachineArn: arn,
                    input: JSON.stringify(input ?? {}),
                }),
            ) as StartExecutionResponse;

            // startDate is a Date object from the SDK — convert to ISO string
            const startDate = response.startDate instanceof Date
                ? response.startDate.toISOString()
                : new Date().toISOString();

            return {
                executionArn: response.executionArn ?? '',
                startDate,
            };
        },
    };
}

// ── SDK Client Duck-Type ─────────────────────────────────

/**
 * Minimal duck-type for an AWS SDK v3 client.
 * Both `LambdaClient` and `SFNClient` satisfy this interface.
 */
export interface AwsSdkClientLike {
    send(command: unknown): Promise<unknown>;
}
