import { describe, it, expect, vi } from 'vitest';
import { AwsClient } from '../src/AwsClient.js';
import { LambdaDiscovery } from '../src/LambdaDiscovery.js';
import { StepFunctionDiscovery } from '../src/StepFunctionDiscovery.js';
import { toToolName, synthesizeLambdaTools, synthesizeStepFunctionTools, synthesizeAll } from '../src/ToolSynthesizer.js';
import { defineAwsTool } from '../src/defineAwsTool.js';
import { createAwsConnector } from '../src/createAwsConnector.js';
import type { LambdaAdapter, SfnAdapter } from '../src/AwsClient.js';
import type {
    AwsLambdaConfig,
    AwsStepFunctionConfig,
} from '../src/types.js';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Creates a mock LambdaAdapter with configurable behavior */
function mockLambdaAdapter(overrides: Partial<LambdaAdapter> = {}): LambdaAdapter {
    return {
        listFunctions: async () => [],
        listTags: async () => ({}),
        invoke: async () => ({ statusCode: 200, payload: { ok: true } }),
        ...overrides,
    };
}

/** Creates a mock SfnAdapter with configurable behavior */
function mockSfnAdapter(overrides: Partial<SfnAdapter> = {}): SfnAdapter {
    return {
        listStateMachines: async () => [],
        listTags: async () => ({}),
        describe: async () => ({ description: '', type: 'STANDARD' }),
        startSync: async () => ({ status: 'SUCCEEDED', output: {}, executionArn: 'arn:exec:1' }),
        startAsync: async () => ({ executionArn: 'arn:exec:1', startDate: new Date().toISOString() }),
        ...overrides,
    };
}

/** Creates a mock AwsClient from adapters */
function buildClient(
    lambdaAdapter?: LambdaAdapter,
    sfnAdapter?: SfnAdapter,
): AwsClient {
    return new AwsClient(lambdaAdapter, sfnAdapter);
}

// ═══════════════════════════════════════════════════════════════
// Edge Cases — AwsClient
// ═══════════════════════════════════════════════════════════════

describe('AwsClient — edge cases', () => {
    it('should throw when Lambda adapter is not configured', async () => {
        const client = buildClient(undefined, mockSfnAdapter());

        await expect(client.listLambdaFunctions()).rejects.toThrow('Lambda adapter not configured');
        await expect(client.getLambdaTags('arn:any')).rejects.toThrow('Lambda adapter not configured');
        await expect(client.invokeLambda('arn:any', {})).rejects.toThrow('Lambda adapter not configured');
    });

    it('should throw when SFN adapter is not configured', async () => {
        const client = buildClient(mockLambdaAdapter(), undefined);

        await expect(client.listStateMachines()).rejects.toThrow('Step Functions adapter not configured');
        await expect(client.getStateMachineTags('arn:any')).rejects.toThrow('Step Functions adapter not configured');
        await expect(client.describeStateMachine('arn:any')).rejects.toThrow('Step Functions adapter not configured');
        await expect(client.startSyncExecution('arn:any', {})).rejects.toThrow('Step Functions adapter not configured');
        await expect(client.startExecution('arn:any', {})).rejects.toThrow('Step Functions adapter not configured');
    });

    it('should throw when BOTH adapters are not configured', async () => {
        const client = buildClient(undefined, undefined);

        await expect(client.listLambdaFunctions()).rejects.toThrow('Lambda adapter not configured');
        await expect(client.listStateMachines()).rejects.toThrow('Step Functions adapter not configured');
    });

    it('should pass null payload to Lambda invoke', async () => {
        const invokeSpy = vi.fn(async () => ({ statusCode: 200, payload: 'ok' }));
        const client = buildClient(mockLambdaAdapter({ invoke: invokeSpy }));

        await client.invokeLambda('arn:fn', null);
        expect(invokeSpy).toHaveBeenCalledWith('arn:fn', null);
    });

    it('should pass undefined payload to Lambda invoke', async () => {
        const invokeSpy = vi.fn(async () => ({ statusCode: 200, payload: 'ok' }));
        const client = buildClient(mockLambdaAdapter({ invoke: invokeSpy }));

        await client.invokeLambda('arn:fn', undefined);
        expect(invokeSpy).toHaveBeenCalledWith('arn:fn', undefined);
    });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases — LambdaDiscovery
// ═══════════════════════════════════════════════════════════════

describe('LambdaDiscovery — edge cases', () => {
    it('should skip functions with no tags at all', async () => {
        const client = buildClient(mockLambdaAdapter({
            listFunctions: async () => [
                { functionName: 'Fn1', functionArn: 'arn:fn1', description: '', runtime: 'nodejs20.x' },
            ],
            listTags: async () => ({}), // No tags
        }));

        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(0);
    });

    it('should reject functions with partial tag match', async () => {
        const client = buildClient(mockLambdaAdapter({
            listFunctions: async () => [
                { functionName: 'Fn1', functionArn: 'arn:fn1', description: '', runtime: 'nodejs20.x' },
            ],
            listTags: async () => ({ 'mcp:expose': 'true' }),
        }));

        // Custom filter requires team=platform too
        const discovery = new LambdaDiscovery(client, {
            tagFilter: { 'mcp:expose': 'true', 'team': 'platform' },
        });
        const configs = await discovery.discover();
        expect(configs).toHaveLength(0);
    });

    it('should handle functions with mcp:expose=false', async () => {
        const client = buildClient(mockLambdaAdapter({
            listFunctions: async () => [
                { functionName: 'Fn1', functionArn: 'arn:fn1', description: '', runtime: 'nodejs20.x' },
            ],
            listTags: async () => ({ 'mcp:expose': 'false' }),
        }));

        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(0);
    });

    it('should extract all tag values correctly', async () => {
        const client = buildClient(mockLambdaAdapter({
            listFunctions: async () => [
                { functionName: 'Fn', functionArn: 'arn:fn', description: 'Test', runtime: 'python3.12' },
            ],
            listTags: async () => ({
                'mcp:expose': 'true',
                'mcp:group': 'api',
                'mcp:action': 'query',
                'mcp:readOnly': 'true',
                'mcp:destructive': 'true',
                'custom-tag': 'custom-value',
            }),
        }));

        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();

        expect(configs).toHaveLength(1);
        const config = configs[0]!;
        expect(config.group).toBe('api');
        expect(config.actionName).toBe('query');
        expect(config.readOnly).toBe(true);
        expect(config.destructive).toBe(true);
        expect(config.runtime).toBe('python3.12');
        expect(config.tags['custom-tag']).toBe('custom-value');
    });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases — StepFunctionDiscovery
// ═══════════════════════════════════════════════════════════════

describe('StepFunctionDiscovery — edge cases', () => {
    it('should skip state machines with no tags', async () => {
        const client = buildClient(undefined, mockSfnAdapter({
            listStateMachines: async () => [
                { name: 'SM1', stateMachineArn: 'arn:sm1', type: 'STANDARD' },
            ],
            listTags: async () => ({}),
        }));

        const discovery = new StepFunctionDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(0);
    });

    it('should use tag mcp:sfn-type over API type when both present', async () => {
        const client = buildClient(undefined, mockSfnAdapter({
            listStateMachines: async () => [
                { name: 'SM1', stateMachineArn: 'arn:sm1', type: 'EXPRESS' }, // API says EXPRESS
            ],
            listTags: async () => ({ 'mcp:expose': 'true', 'mcp:sfn-type': 'standard' }), // Tag says standard
            describe: async () => ({ description: 'Test', type: 'EXPRESS' }),
        }));

        const discovery = new StepFunctionDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.executionType).toBe('standard'); // Tag wins
    });

    it('should discover multiple state machines', async () => {
        let tagCallCount = 0;
        const client = buildClient(undefined, mockSfnAdapter({
            listStateMachines: async () => [
                { name: 'SM1', stateMachineArn: 'arn:sm1', type: 'EXPRESS' },
                { name: 'SM2', stateMachineArn: 'arn:sm2', type: 'STANDARD' },
                { name: 'SM3', stateMachineArn: 'arn:sm3', type: 'STANDARD' },
            ],
            listTags: async () => {
                tagCallCount++;
                return { 'mcp:expose': 'true' };
            },
            describe: async () => ({ description: 'Machine', type: 'STANDARD' }),
        }));

        const discovery = new StepFunctionDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(3);
        expect(tagCallCount).toBe(3); // One tag call per machine
    });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases — ToolSynthesizer
// ═══════════════════════════════════════════════════════════════

describe('ToolSynthesizer — edge cases', () => {
    const mockClient = () => buildClient(mockLambdaAdapter());

    it('should handle empty Lambda array', () => {
        const tools = synthesizeLambdaTools([], mockClient());
        expect(tools).toHaveLength(0);
    });

    it('should handle empty SFN array', () => {
        const tools = synthesizeStepFunctionTools([], mockClient());
        expect(tools).toHaveLength(0);
    });

    it('synthesizeAll should combine Lambda and SFN tools', () => {
        const lambda: AwsLambdaConfig = {
            functionName: 'CreateUser',
            functionArn: 'arn:lambda:create',
            description: 'Creates user',
            runtime: 'nodejs20.x',
            group: undefined,
            actionName: 'execute',
            readOnly: false,
            destructive: false,
            tags: { 'mcp:expose': 'true' },
        };

        const sfn: AwsStepFunctionConfig = {
            name: 'ProcessOrder',
            stateMachineArn: 'arn:sfn:process',
            description: 'Processes orders',
            executionType: 'express',
            group: undefined,
            actionName: 'execute',
            readOnly: false,
            destructive: false,
            tags: { 'mcp:expose': 'true' },
        };

        const sfnClient = buildClient(
            mockLambdaAdapter(),
            mockSfnAdapter(),
        );
        const tools = synthesizeAll([lambda], [sfn], sfnClient);
        expect(tools).toHaveLength(2);

        const names = tools.map(t => t.name);
        expect(names).toContain('create_user');
        expect(names).toContain('process_order');
    });

    it('should not include MCP or AWS tags in tool tags', () => {
        const lambda: AwsLambdaConfig = {
            functionName: 'Fn',
            functionArn: 'arn:fn',
            description: '',
            runtime: 'nodejs20.x',
            group: undefined,
            actionName: 'execute',
            readOnly: false,
            destructive: false,
            tags: {
                'mcp:expose': 'true',
                'mcp:action': 'execute',
                'aws:cloudformation:stack-name': 'my-stack',
                'env': 'prod',
                'team': 'backend',
            },
        };

        const tools = synthesizeLambdaTools([lambda], mockClient());
        const tags = tools[0]!.config.tags;

        // Only non-mcp, non-aws tags
        expect(tags).toContain('env:prod');
        expect(tags).toContain('team:backend');
        expect(tags).toHaveLength(2);
    });

    it('should handle readOnly=true and destructive=true annotations', () => {
        const lambda: AwsLambdaConfig = {
            functionName: 'DeleteAll',
            functionArn: 'arn:fn',
            description: 'Deletes everything',
            runtime: 'nodejs20.x',
            group: undefined,
            actionName: 'execute',
            readOnly: false,
            destructive: true,
            tags: { 'mcp:expose': 'true' },
        };

        const tools = synthesizeLambdaTools([lambda], mockClient());
        const action = tools[0]!.config.actions['execute']!;
        expect(action.destructive).toBe(true);
        expect(action.readOnly).toBeUndefined(); // false → undefined (omitted)
    });

    it('should handle readOnly Lambda correctly', () => {
        const lambda: AwsLambdaConfig = {
            functionName: 'GetStatus',
            functionArn: 'arn:fn',
            description: 'Gets status',
            runtime: 'nodejs20.x',
            group: undefined,
            actionName: 'execute',
            readOnly: true,
            destructive: false,
            tags: { 'mcp:expose': 'true' },
        };

        const tools = synthesizeLambdaTools([lambda], mockClient());
        const action = tools[0]!.config.actions['execute']!;
        expect(action.readOnly).toBe(true);
        expect(action.destructive).toBeUndefined();
    });

    it('should generate group description with member action names', () => {
        const members: AwsLambdaConfig[] = [
            {
                functionName: 'CreateUser', functionArn: 'arn:1', description: '',
                runtime: 'nodejs20.x', group: 'users', actionName: 'create',
                readOnly: false, destructive: false, tags: { 'mcp:expose': 'true', 'mcp:group': 'users', 'mcp:action': 'create' },
            },
            {
                functionName: 'DeleteUser', functionArn: 'arn:2', description: '',
                runtime: 'nodejs20.x', group: 'users', actionName: 'delete',
                readOnly: false, destructive: true, tags: { 'mcp:expose': 'true', 'mcp:group': 'users', 'mcp:action': 'delete' },
            },
        ];

        const tools = synthesizeLambdaTools(members, mockClient());
        expect(tools[0]!.config.description).toContain('create');
        expect(tools[0]!.config.description).toContain('delete');
    });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases — SFN Execution Types
// ═══════════════════════════════════════════════════════════════

describe('SFN execution — edge cases', () => {
    it('should handle Express SFN TIMED_OUT status', async () => {
        const client = buildClient(undefined, mockSfnAdapter({
            startSync: async () => ({
                status: 'TIMED_OUT',
                output: null,
                error: 'StatesTimeout',
                cause: 'Execution exceeded maximum duration',
                executionArn: 'arn:exec:123',
            }),
        }));

        const sfn: AwsStepFunctionConfig = {
            name: 'SlowProcess',
            stateMachineArn: 'arn:sfn:slow',
            description: 'Slow process',
            executionType: 'express',
            group: undefined,
            actionName: 'execute',
            readOnly: false,
            destructive: false,
            tags: { 'mcp:expose': 'true' },
        };

        const tools = synthesizeStepFunctionTools([sfn], client);
        const result = await tools[0]!.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;
        expect(result.__error).toBe(true);
        expect(result.code).toBe('AWS_SFN_ERROR');
        expect(result.status).toBe('TIMED_OUT');
    });

    it('should include _instruction in Standard SFN LRO response', async () => {
        const client = buildClient(undefined, mockSfnAdapter({
            startAsync: async () => ({
                executionArn: 'arn:exec:report-999',
                startDate: '2026-01-15T12:00:00.000Z',
            }),
        }));

        const sfn: AwsStepFunctionConfig = {
            name: 'BigReport',
            stateMachineArn: 'arn:sfn:bigreport',
            description: 'Generates a big report',
            executionType: 'standard',
            group: undefined,
            actionName: 'execute',
            readOnly: true,
            destructive: false,
            tags: { 'mcp:expose': 'true' },
        };

        const tools = synthesizeStepFunctionTools([sfn], client);
        const result = await tools[0]!.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;

        expect(result.status).toBe('RUNNING');
        expect(result.executionArn).toBe('arn:exec:report-999');
        expect(result._instruction).toBeDefined();
        expect(result._instruction).toContain('Do NOT assume completion');
        expect(result._instruction).toContain('arn:exec:report-999');
    });
});

// ═══════════════════════════════════════════════════════════════
// End-to-End — Full Connector Flow
// ═══════════════════════════════════════════════════════════════

describe('E2E — createAwsConnector full flow', () => {
    it('should discover Lambda, synthesize tools, and invoke handler', async () => {
        const adapter = mockLambdaAdapter({
            listFunctions: async () => [
                { functionName: 'GetUser', functionArn: 'arn:lambda:getuser', description: 'Gets a user by ID', runtime: 'nodejs20.x' },
                { functionName: 'Internal', functionArn: 'arn:lambda:internal', description: 'Internal only', runtime: 'nodejs20.x' },
            ],
            listTags: async (arn: string) => {
                if (arn === 'arn:lambda:getuser') {
                    return { 'mcp:expose': 'true', 'mcp:readOnly': 'true', 'env': 'prod' };
                }
                return {}; // Internal — no mcp:expose tag
            },
            invoke: async (_arn: string, payload: unknown) => ({
                statusCode: 200,
                payload: { id: 42, name: 'Alice', input: payload },
            }),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
        });

        // Discovery
        expect(connector.lambdas).toHaveLength(1);
        expect(connector.lambdas[0]!.functionName).toBe('GetUser');
        expect(connector.lambdas[0]!.readOnly).toBe(true);

        // Tool synthesis
        const tools = connector.tools();
        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe('get_user');

        // Tool invocation
        const action = tools[0]!.config.actions['execute']!;
        expect(action.readOnly).toBe(true);

        const result = await action.handler(null, { userId: 42 });
        expect(result).toEqual({ id: 42, name: 'Alice', input: { userId: 42 } });

        // Tags
        expect(tools[0]!.config.tags).toContain('env:prod');

        connector.stop();
    });

    it('should discover SFN Express, synthesize, and invoke synchronously', async () => {
        const sfnAdapter = mockSfnAdapter({
            listStateMachines: async () => [
                { name: 'ProcessPayment', stateMachineArn: 'arn:sfn:payment', type: 'EXPRESS' },
            ],
            listTags: async () => ({ 'mcp:expose': 'true' }),
            describe: async () => ({ description: 'Process a payment', type: 'EXPRESS' }),
            startSync: async (_arn: string, input: unknown) => ({
                status: 'SUCCEEDED',
                output: { transactionId: 'tx-001', input },
                executionArn: 'arn:exec:pay-1',
            }),
        });

        const connector = await createAwsConnector({
            lambdaClient: mockLambdaAdapter(),
            sfnClient: sfnAdapter,
            enableLambda: false,
            enableStepFunctions: true,
        });

        expect(connector.stepFunctions).toHaveLength(1);
        expect(connector.stepFunctions[0]!.executionType).toBe('express');

        const tools = connector.tools();
        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe('process_payment');

        const result = await tools[0]!.config.actions['execute']!.handler(null, { amount: 100 });
        expect(result).toEqual({ transactionId: 'tx-001', input: { amount: 100 } });

        connector.stop();
    });

    it('should discover SFN Standard and return LRO response', async () => {
        const sfnAdapter = mockSfnAdapter({
            listStateMachines: async () => [
                { name: 'GenerateReport', stateMachineArn: 'arn:sfn:report', type: 'STANDARD' },
            ],
            listTags: async () => ({ 'mcp:expose': 'true', 'mcp:readOnly': 'true' }),
            describe: async () => ({ description: 'Generate quarterly report', type: 'STANDARD' }),
            startAsync: async () => ({
                executionArn: 'arn:exec:report-e2e',
                startDate: '2026-02-26T14:00:00.000Z',
            }),
        });

        const connector = await createAwsConnector({
            sfnClient: sfnAdapter,
            enableLambda: false,
            enableStepFunctions: true,
        });

        const tools = connector.tools();
        expect(tools).toHaveLength(1);

        const result = await tools[0]!.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;
        expect(result.status).toBe('RUNNING');
        expect(result.executionArn).toBe('arn:exec:report-e2e');
        expect(result._instruction).toContain('Do NOT assume completion');

        connector.stop();
    });

    it('should discover grouped Lambdas into a single multi-action tool', async () => {
        const adapter = mockLambdaAdapter({
            listFunctions: async () => [
                { functionName: 'UserCreate', functionArn: 'arn:lambda:create', description: 'Create user', runtime: 'nodejs20.x' },
                { functionName: 'UserList', functionArn: 'arn:lambda:list', description: 'List users', runtime: 'nodejs20.x' },
                { functionName: 'UserDelete', functionArn: 'arn:lambda:delete', description: 'Delete user', runtime: 'nodejs20.x' },
            ],
            listTags: async (arn: string) => {
                const base = { 'mcp:expose': 'true', 'mcp:group': 'users' };
                if (arn.includes('create')) return { ...base, 'mcp:action': 'create' };
                if (arn.includes('list')) return { ...base, 'mcp:action': 'list', 'mcp:readOnly': 'true' };
                if (arn.includes('delete')) return { ...base, 'mcp:action': 'delete', 'mcp:destructive': 'true' };
                return {};
            },
            invoke: async (arn: string) => ({
                statusCode: 200,
                payload: { action: arn.split(':').pop() },
            }),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
        });

        expect(connector.lambdas).toHaveLength(3);

        const tools = connector.tools();
        expect(tools).toHaveLength(1); // All grouped into 'users'
        expect(tools[0]!.name).toBe('users');

        const actions = tools[0]!.config.actions;
        expect(Object.keys(actions)).toHaveLength(3);
        expect(actions['create']).toBeDefined();
        expect(actions['list']).toBeDefined();
        expect(actions['delete']).toBeDefined();

        // Annotations
        expect(actions['list']!.readOnly).toBe(true);
        expect(actions['delete']!.destructive).toBe(true);
        expect(actions['create']!.readOnly).toBeUndefined();

        // Each action invokes the correct Lambda
        const createResult = await actions['create']!.handler(null, {}) as Record<string, unknown>;
        expect(createResult.action).toBe('create');

        const listResult = await actions['list']!.handler(null, {}) as Record<string, unknown>;
        expect(listResult.action).toBe('list');

        connector.stop();
    });

    it('should handle Lambda error in E2E flow', async () => {
        const adapter = mockLambdaAdapter({
            listFunctions: async () => [
                { functionName: 'Failing', functionArn: 'arn:lambda:fail', description: 'Fails', runtime: 'nodejs20.x' },
            ],
            listTags: async () => ({ 'mcp:expose': 'true' }),
            invoke: async () => ({
                statusCode: 200,
                payload: { errorMessage: 'out of memory', errorType: 'RuntimeError' },
                functionError: 'Unhandled',
            }),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
        });

        const tools = connector.tools();
        const result = await tools[0]!.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;

        expect(result.__error).toBe(true);
        expect(result.code).toBe('AWS_LAMBDA_ERROR');
        expect(result.message).toContain('Failing');
        expect(result.details).toEqual({ errorMessage: 'out of memory', errorType: 'RuntimeError' });

        connector.stop();
    });
});

// ═══════════════════════════════════════════════════════════════
// E2E — defineAwsTool Full Flow
// ═══════════════════════════════════════════════════════════════

describe('E2E — defineAwsTool full flow', () => {
    it('should create Lambda tool, invoke, and get result', async () => {
        const client = buildClient(mockLambdaAdapter({
            invoke: async (_arn: string, payload: unknown) => ({
                statusCode: 200,
                payload: { status: 'deployed', payload },
            }),
        }));

        const tool = defineAwsTool('deploy', client, {
            arn: 'arn:aws:lambda:us-east-1:123:function:deploy',
            description: 'Deploy to production',
            annotations: { destructiveHint: true },
        });

        expect(tool.name).toBe('deploy');
        expect(tool.config.description).toBe('Deploy to production');

        const action = tool.config.actions['execute']!;
        expect(action.destructive).toBe(true);
        expect(action.readOnly).toBeUndefined();

        const result = await action.handler(null, { branch: 'main' });
        expect(result).toEqual({ status: 'deployed', payload: { branch: 'main' } });
    });

    it('should create SFN tool via ARN detection and invoke', async () => {
        const client = buildClient(undefined, mockSfnAdapter({
            startSync: async (_arn: string, input: unknown) => ({
                status: 'SUCCEEDED',
                output: { completed: true, input },
                executionArn: 'arn:exec:e2e',
            }),
        }));

        const tool = defineAwsTool('run_workflow', client, {
            arn: 'arn:aws:states:us-east-1:123:stateMachine:Workflow',
            annotations: { readOnlyHint: true },
        });

        expect(tool.config.description).toContain('Step Function');

        const action = tool.config.actions['execute']!;
        expect(action.readOnly).toBe(true);

        const result = await action.handler(null, { step: 1 });
        expect(result).toEqual({ completed: true, input: { step: 1 } });
    });
});

// ═══════════════════════════════════════════════════════════════
// E2E — Polling & Live State Sync
// ═══════════════════════════════════════════════════════════════

describe('E2E — Polling and refresh', () => {
    it('should detect tool changes after refresh and return true', async () => {
        let callCount = 0;
        const adapter = mockLambdaAdapter({
            listFunctions: async () => {
                callCount++;
                if (callCount === 1) {
                    return [
                        { functionName: 'Fn1', functionArn: 'arn:fn1', description: 'First', runtime: 'nodejs20.x' },
                    ];
                }
                return [
                    { functionName: 'Fn1', functionArn: 'arn:fn1', description: 'First', runtime: 'nodejs20.x' },
                    { functionName: 'Fn2', functionArn: 'arn:fn2', description: 'Second', runtime: 'nodejs20.x' },
                ];
            },
            listTags: async () => ({ 'mcp:expose': 'true' }),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
        });

        expect(connector.tools()).toHaveLength(1);

        const changed = await connector.refresh();
        expect(changed).toBe(true);
        expect(connector.tools()).toHaveLength(2);

        connector.stop();
    });

    it('should detect tool removal after refresh', async () => {
        let callCount = 0;
        const adapter = mockLambdaAdapter({
            listFunctions: async () => {
                callCount++;
                if (callCount === 1) {
                    return [
                        { functionName: 'Fn1', functionArn: 'arn:fn1', description: '', runtime: 'nodejs20.x' },
                        { functionName: 'Fn2', functionArn: 'arn:fn2', description: '', runtime: 'nodejs20.x' },
                    ];
                }
                return [
                    { functionName: 'Fn1', functionArn: 'arn:fn1', description: '', runtime: 'nodejs20.x' },
                ];
            },
            listTags: async () => ({ 'mcp:expose': 'true' }),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
        });

        expect(connector.tools()).toHaveLength(2);

        const changed = await connector.refresh();
        expect(changed).toBe(true);
        expect(connector.tools()).toHaveLength(1);

        connector.stop();
    });

    it('should detect description changes in fingerprint', async () => {
        let callCount = 0;
        const adapter = mockLambdaAdapter({
            listFunctions: async () => {
                callCount++;
                return [{
                    functionName: 'Fn1',
                    functionArn: 'arn:fn1',
                    description: callCount === 1 ? 'Version 1' : 'Version 2',
                    runtime: 'nodejs20.x',
                }];
            },
            listTags: async () => ({ 'mcp:expose': 'true' }),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
        });

        expect(connector.tools()[0]!.config.description).toContain('Version 1');

        const changed = await connector.refresh();
        expect(changed).toBe(true); // Description changed → fingerprint changed
        expect(connector.tools()[0]!.config.description).toContain('Version 2');

        connector.stop();
    });

    it('should call onChange when tools change during polling', async () => {
        vi.useFakeTimers();

        let callCount = 0;
        const onChange = vi.fn();

        const adapter = mockLambdaAdapter({
            listFunctions: async () => {
                callCount++;
                if (callCount === 1) return [];
                return [{ functionName: 'New', functionArn: 'arn:new', description: '', runtime: 'nodejs20.x' }];
            },
            listTags: async () => ({ 'mcp:expose': 'true' }),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
            pollInterval: 5000,
            onChange,
        });

        expect(connector.tools()).toHaveLength(0);
        expect(onChange).not.toHaveBeenCalled();

        // Advance timer to trigger poll
        await vi.advanceTimersByTimeAsync(5000);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(connector.tools()).toHaveLength(1);

        connector.stop();
        vi.useRealTimers();
    });

    it('should call onError when polling fails', async () => {
        vi.useFakeTimers();

        let callCount = 0;
        const onError = vi.fn();

        const adapter = mockLambdaAdapter({
            listFunctions: async () => {
                callCount++;
                if (callCount > 1) throw new Error('AWS_UNREACHABLE');
                return [];
            },
            listTags: async () => ({}),
        });

        const connector = await createAwsConnector({
            lambdaClient: adapter,
            enableLambda: true,
            pollInterval: 5000,
            onError,
        });

        // Advance timer to trigger failing poll
        await vi.advanceTimersByTimeAsync(5000);

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
        expect((onError.mock.calls[0]![0] as Error).message).toBe('AWS_UNREACHABLE');

        connector.stop();
        vi.useRealTimers();
    });
});
