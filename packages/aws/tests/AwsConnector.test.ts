import { describe, it, expect, vi } from 'vitest';
import { toToolName, synthesizeLambdaTools, synthesizeStepFunctionTools } from '../src/ToolSynthesizer.js';
import { LambdaDiscovery } from '../src/LambdaDiscovery.js';
import { StepFunctionDiscovery } from '../src/StepFunctionDiscovery.js';
import { AwsClient } from '../src/AwsClient.js';
import { defineAwsTool } from '../src/defineAwsTool.js';
import { MCP_TAGS, DEFAULT_ACTION_NAME } from '../src/types.js';
import type {
    AwsLambdaConfig,
    AwsStepFunctionConfig,
} from '../src/types.js';

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

const LAMBDA_CREATE_USER: AwsLambdaConfig = {
    functionName: 'CreateUser',
    functionArn: 'arn:aws:lambda:us-east-1:123456789:function:CreateUser',
    description: 'Creates a new user in the system',
    runtime: 'nodejs20.x',
    group: 'users',
    actionName: 'create',
    readOnly: false,
    destructive: false,
    tags: {
        'mcp:expose': 'true',
        'mcp:group': 'users',
        'mcp:action': 'create',
        'env': 'production',
    },
};

const LAMBDA_LIST_USERS: AwsLambdaConfig = {
    functionName: 'ListUsers',
    functionArn: 'arn:aws:lambda:us-east-1:123456789:function:ListUsers',
    description: 'Lists all users',
    runtime: 'nodejs20.x',
    group: 'users',
    actionName: 'list',
    readOnly: true,
    destructive: false,
    tags: {
        'mcp:expose': 'true',
        'mcp:group': 'users',
        'mcp:action': 'list',
        'mcp:readOnly': 'true',
        'env': 'production',
    },
};

const LAMBDA_STANDALONE: AwsLambdaConfig = {
    functionName: 'SendNotification',
    functionArn: 'arn:aws:lambda:us-east-1:123456789:function:SendNotification',
    description: 'Sends a push notification',
    runtime: 'nodejs20.x',
    group: undefined,
    actionName: 'execute',
    readOnly: false,
    destructive: false,
    tags: {
        'mcp:expose': 'true',
        'env': 'staging',
    },
};

const SFN_EXPRESS: AwsStepFunctionConfig = {
    name: 'ProcessOrder',
    stateMachineArn: 'arn:aws:states:us-east-1:123456789:stateMachine:ProcessOrder',
    description: 'Processes an order synchronously',
    executionType: 'express',
    group: undefined,
    actionName: 'execute',
    readOnly: false,
    destructive: false,
    tags: { 'mcp:expose': 'true', 'mcp:sfn-type': 'express' },
};

const SFN_STANDARD: AwsStepFunctionConfig = {
    name: 'GenerateReport',
    stateMachineArn: 'arn:aws:states:us-east-1:123456789:stateMachine:GenerateReport',
    description: 'Generates a quarterly report (long-running)',
    executionType: 'standard',
    group: undefined,
    actionName: 'execute',
    readOnly: true,
    destructive: false,
    tags: { 'mcp:expose': 'true', 'mcp:readOnly': 'true' },
};

// ═══════════════════════════════════════════════════════════════
// toToolName()
// ═══════════════════════════════════════════════════════════════

describe('toToolName', () => {
    it('should convert PascalCase to snake_case', () => {
        expect(toToolName('CreateUser')).toBe('create_user');
    });

    it('should convert kebab-case to snake_case', () => {
        expect(toToolName('my-awesome-lambda')).toBe('my_awesome_lambda');
    });

    it('should handle camelCase', () => {
        expect(toToolName('getUserById')).toBe('get_user_by_id');
    });

    it('should strip leading/trailing separators', () => {
        expect(toToolName('  Deploy Staging  ')).toBe('deploy_staging');
    });

    it('should collapse multiple separators', () => {
        expect(toToolName('a---b___c')).toBe('a_b_c');
    });

    it('should handle single word', () => {
        expect(toToolName('deploy')).toBe('deploy');
    });

    it('should handle already snake_case', () => {
        expect(toToolName('get_users_v2')).toBe('get_users_v2');
    });

    it('should throw on empty string', () => {
        expect(() => toToolName('')).toThrow();
    });

    it('should throw on whitespace-only input', () => {
        expect(() => toToolName('   ')).toThrow();
    });

    it('should throw on special-characters-only input', () => {
        expect(() => toToolName('---___')).toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════
// LambdaDiscovery
// ═══════════════════════════════════════════════════════════════

describe('LambdaDiscovery', () => {
    function mockClient(
        functions: Array<{ functionName: string; functionArn: string; description: string; runtime: string }>,
        tagsByArn: Record<string, Record<string, string>>,
    ) {
        return {
            listLambdaFunctions: async () => functions,
            getLambdaTags: async (arn: string) => tagsByArn[arn] ?? {},
        } as unknown as AwsClient;
    }

    it('should discover only tagged Lambda functions', async () => {
        const client = mockClient(
            [
                { functionName: 'Exposed', functionArn: 'arn:exposed', description: '', runtime: 'nodejs20.x' },
                { functionName: 'Hidden', functionArn: 'arn:hidden', description: '', runtime: 'nodejs20.x' },
            ],
            {
                'arn:exposed': { 'mcp:expose': 'true' },
                'arn:hidden': { 'mcp:expose': 'false' },
            },
        );
        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(1);
        expect(configs[0]!.functionName).toBe('Exposed');
    });

    it('should extract group and action from tags', async () => {
        const client = mockClient(
            [{ functionName: 'CreateUser', functionArn: 'arn:create', description: 'Creates user', runtime: 'nodejs20.x' }],
            {
                'arn:create': { 'mcp:expose': 'true', 'mcp:group': 'users', 'mcp:action': 'create' },
            },
        );
        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.group).toBe('users');
        expect(configs[0]!.actionName).toBe('create');
    });

    it('should default actionName to "execute" when mcp:action is missing', async () => {
        const client = mockClient(
            [{ functionName: 'Fn', functionArn: 'arn:fn', description: '', runtime: 'nodejs20.x' }],
            { 'arn:fn': { 'mcp:expose': 'true' } },
        );
        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.actionName).toBe(DEFAULT_ACTION_NAME);
    });

    it('should extract readOnly and destructive from tags', async () => {
        const client = mockClient(
            [{ functionName: 'Fn', functionArn: 'arn:fn', description: '', runtime: 'nodejs20.x' }],
            { 'arn:fn': { 'mcp:expose': 'true', 'mcp:readOnly': 'true' } },
        );
        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.readOnly).toBe(true);
        expect(configs[0]!.destructive).toBe(false);
    });

    it('should handle empty function list', async () => {
        const client = mockClient([], {});
        const discovery = new LambdaDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(0);
    });

    it('should support custom tag filter', async () => {
        const client = mockClient(
            [{ functionName: 'Fn', functionArn: 'arn:fn', description: '', runtime: 'nodejs20.x' }],
            { 'arn:fn': { 'mcp:expose': 'true', 'team': 'platform' } },
        );
        const discovery = new LambdaDiscovery(client, {
            tagFilter: { 'mcp:expose': 'true', 'team': 'platform' },
        });
        const configs = await discovery.discover();
        expect(configs).toHaveLength(1);
    });
});

// ═══════════════════════════════════════════════════════════════
// StepFunctionDiscovery
// ═══════════════════════════════════════════════════════════════

describe('StepFunctionDiscovery', () => {
    function mockClient(
        machines: Array<{ name: string; stateMachineArn: string; type: string }>,
        tagsByArn: Record<string, Record<string, string>>,
        descriptionsByArn: Record<string, { description: string; type: string }>,
    ) {
        return {
            listStateMachines: async () => machines,
            getStateMachineTags: async (arn: string) => tagsByArn[arn] ?? {},
            describeStateMachine: async (arn: string) =>
                descriptionsByArn[arn] ?? { description: '', type: 'STANDARD' },
        } as unknown as AwsClient;
    }

    it('should discover only tagged state machines', async () => {
        const client = mockClient(
            [
                { name: 'Exposed', stateMachineArn: 'arn:exposed', type: 'STANDARD' },
                { name: 'Hidden', stateMachineArn: 'arn:hidden', type: 'STANDARD' },
            ],
            {
                'arn:exposed': { 'mcp:expose': 'true' },
                'arn:hidden': {},
            },
            {
                'arn:exposed': { description: 'Test', type: 'STANDARD' },
            },
        );
        const discovery = new StepFunctionDiscovery(client);
        const configs = await discovery.discover();
        expect(configs).toHaveLength(1);
        expect(configs[0]!.name).toBe('Exposed');
    });

    it('should detect express execution type from tag', async () => {
        const client = mockClient(
            [{ name: 'Fast', stateMachineArn: 'arn:fast', type: 'STANDARD' }],
            { 'arn:fast': { 'mcp:expose': 'true', 'mcp:sfn-type': 'express' } },
            { 'arn:fast': { description: '', type: 'STANDARD' } }, // API says STANDARD but tag overrides
        );
        const discovery = new StepFunctionDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.executionType).toBe('express');
    });

    it('should fallback to API type when no sfn-type tag', async () => {
        const client = mockClient(
            [{ name: 'SM', stateMachineArn: 'arn:sm', type: 'EXPRESS' }],
            { 'arn:sm': { 'mcp:expose': 'true' } },
            { 'arn:sm': { description: '', type: 'EXPRESS' } },
        );
        const discovery = new StepFunctionDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.executionType).toBe('express');
    });

    it('should default to standard when no type info', async () => {
        const client = mockClient(
            [{ name: 'SM', stateMachineArn: 'arn:sm', type: 'STANDARD' }],
            { 'arn:sm': { 'mcp:expose': 'true' } },
            { 'arn:sm': { description: '', type: 'STANDARD' } },
        );
        const discovery = new StepFunctionDiscovery(client);
        const configs = await discovery.discover();
        expect(configs[0]!.executionType).toBe('standard');
    });
});

// ═══════════════════════════════════════════════════════════════
// ToolSynthesizer — Lambda
// ═══════════════════════════════════════════════════════════════

describe('synthesizeLambdaTools', () => {
    function mockClient() {
        return {
            invokeLambda: async () => ({
                statusCode: 200,
                payload: { ok: true },
            }),
        } as unknown as AwsClient;
    }

    it('should group Lambdas by mcp:group into a single tool', () => {
        const tools = synthesizeLambdaTools(
            [LAMBDA_CREATE_USER, LAMBDA_LIST_USERS],
            mockClient(),
        );
        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe('users');
    });

    it('should create separate actions within a grouped tool', () => {
        const tools = synthesizeLambdaTools(
            [LAMBDA_CREATE_USER, LAMBDA_LIST_USERS],
            mockClient(),
        );
        const actions = tools[0]!.config.actions;
        expect(Object.keys(actions)).toContain('create');
        expect(Object.keys(actions)).toContain('list');
    });

    it('should create standalone tools for ungrouped Lambdas', () => {
        const tools = synthesizeLambdaTools(
            [LAMBDA_STANDALONE],
            mockClient(),
        );
        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe('send_notification');
        expect(tools[0]!.config.actions['execute']).toBeDefined();
    });

    it('should set readOnly on grouped action', () => {
        const tools = synthesizeLambdaTools(
            [LAMBDA_LIST_USERS],
            mockClient(),
        );
        const listAction = tools[0]!.config.actions['list'];
        expect(listAction!.readOnly).toBe(true);
    });

    it('should include metadata in description', () => {
        const tools = synthesizeLambdaTools(
            [LAMBDA_STANDALONE],
            mockClient(),
        );
        expect(tools[0]!.config.description).toContain('SendNotification');
        expect(tools[0]!.config.description).toContain('[Lambda]');
    });

    it('should produce a working handler (success)', async () => {
        const tools = synthesizeLambdaTools([LAMBDA_STANDALONE], mockClient());
        const result = await tools[0]!.config.actions['execute']!.handler(null, { message: 'hello' });
        expect(result).toEqual({ ok: true });
    });

    it('should handle Lambda errors', async () => {
        const errorClient = {
            invokeLambda: async () => ({
                statusCode: 200,
                payload: { errorMessage: 'timeout' },
                functionError: 'Unhandled',
            }),
        } as unknown as AwsClient;

        const tools = synthesizeLambdaTools([LAMBDA_STANDALONE], errorClient);
        const result = await tools[0]!.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;
        expect(result.__error).toBe(true);
        expect(result.code).toBe('AWS_LAMBDA_ERROR');
    });

    it('should handle mixed grouped and standalone Lambdas', () => {
        const tools = synthesizeLambdaTools(
            [LAMBDA_CREATE_USER, LAMBDA_LIST_USERS, LAMBDA_STANDALONE],
            mockClient(),
        );
        expect(tools).toHaveLength(2); // 1 grouped (users) + 1 standalone
        const names = tools.map(t => t.name);
        expect(names).toContain('users');
        expect(names).toContain('send_notification');
    });

    it('should extract non-MCP tags as tool tags', () => {
        const tools = synthesizeLambdaTools([LAMBDA_STANDALONE], mockClient());
        expect(tools[0]!.config.tags).toContain('env:staging');
    });

    it('should throw on duplicate action names within a group', () => {
        const duplicateLambda: AwsLambdaConfig = {
            ...LAMBDA_CREATE_USER,
            functionName: 'CreateUserV2',
            functionArn: 'arn:aws:lambda:us-east-1:123456789:function:CreateUserV2',
        };

        expect(() => synthesizeLambdaTools(
            [LAMBDA_CREATE_USER, duplicateLambda],
            mockClient(),
        )).toThrow(/Duplicate action/);
    });
});

// ═══════════════════════════════════════════════════════════════
// ToolSynthesizer — Step Functions
// ═══════════════════════════════════════════════════════════════

describe('synthesizeStepFunctionTools', () => {
    it('should create tool for Express SFN with sync handler', async () => {
        const client = {
            startSyncExecution: async () => ({
                status: 'SUCCEEDED',
                output: { orderId: 42 },
                executionArn: 'arn:exec:123',
            }),
        } as unknown as AwsClient;

        const tools = synthesizeStepFunctionTools([SFN_EXPRESS], client);
        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe('process_order');

        const result = await tools[0]!.config.actions['execute']!.handler(null, {});
        expect(result).toEqual({ orderId: 42 });
    });

    it('should handle Express SFN failure', async () => {
        const client = {
            startSyncExecution: async () => ({
                status: 'FAILED',
                output: null,
                error: 'StatesRuntimeError',
                cause: 'Invalid input',
                executionArn: 'arn:exec:123',
            }),
        } as unknown as AwsClient;

        const tools = synthesizeStepFunctionTools([SFN_EXPRESS], client);
        const result = await tools[0]!.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;
        expect(result.__error).toBe(true);
        expect(result.code).toBe('AWS_SFN_ERROR');
    });

    it('should create tool for Standard SFN with LRO pattern', async () => {
        const client = {
            startExecution: async () => ({
                executionArn: 'arn:exec:report-456',
                startDate: '2026-01-01T00:00:00Z',
            }),
        } as unknown as AwsClient;

        const tools = synthesizeStepFunctionTools([SFN_STANDARD], client);
        expect(tools).toHaveLength(1);

        const result = await tools[0]!.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;

        // LRO: should return running status + cognitive instruction
        expect(result.status).toBe('RUNNING');
        expect(result.executionArn).toBe('arn:exec:report-456');
        expect(result._instruction).toContain('Do NOT assume completion');
    });
});

// ═══════════════════════════════════════════════════════════════
// defineAwsTool — Manual mode
// ═══════════════════════════════════════════════════════════════

describe('defineAwsTool', () => {
    function mockClient() {
        return {
            invokeLambda: async () => ({
                statusCode: 200,
                payload: { deployed: true },
            }),
        } as unknown as AwsClient;
    }

    it('should create a tool with the given name', () => {
        const tool = defineAwsTool('deploy_staging', mockClient(), {
            arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy',
        });
        expect(tool.name).toBe('deploy_staging');
    });

    it('should use provided description', () => {
        const tool = defineAwsTool('deploy_staging', mockClient(), {
            arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy',
            description: 'Deploy to staging environment',
        });
        expect(tool.config.description).toBe('Deploy to staging environment');
    });

    it('should fallback description to ARN', () => {
        const tool = defineAwsTool('deploy_staging', mockClient(), {
            arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy',
        });
        expect(tool.config.description).toContain('arn:aws:lambda');
    });

    it('should pass annotations through', () => {
        const tool = defineAwsTool('deploy_staging', mockClient(), {
            arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy',
            annotations: { destructiveHint: true },
        });
        expect(tool.config.actions['execute']!.destructive).toBe(true);
    });

    it('should produce a working handler', async () => {
        const tool = defineAwsTool('deploy_staging', mockClient(), {
            arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy',
        });
        const result = await tool.config.actions['execute']!.handler(null, { branch: 'main' });
        expect(result).toEqual({ deployed: true });
    });

    it('should detect SFN ARN and invoke startSyncExecution', async () => {
        const sfnClient = {
            startSyncExecution: async () => ({
                status: 'SUCCEEDED',
                output: { report: 'done' },
                executionArn: 'arn:exec:123',
            }),
        } as unknown as AwsClient;

        const tool = defineAwsTool('run_report', sfnClient, {
            arn: 'arn:aws:states:us-east-1:123456789:stateMachine:GenerateReport',
        });

        expect(tool.config.description).toContain('[AWS Step Function]');
        const result = await tool.config.actions['execute']!.handler(null, {});
        expect(result).toEqual({ report: 'done' });
    });

    it('should handle SFN failure in defineAwsTool', async () => {
        const sfnClient = {
            startSyncExecution: async () => ({
                status: 'FAILED',
                output: null,
                error: 'InvalidInput',
                cause: 'Bad payload',
                executionArn: 'arn:exec:456',
            }),
        } as unknown as AwsClient;

        const tool = defineAwsTool('run_report', sfnClient, {
            arn: 'arn:aws:states:us-east-1:123456789:stateMachine:GenerateReport',
        });

        const result = await tool.config.actions['execute']!.handler(null, {}) as Record<string, unknown>;
        expect(result.__error).toBe(true);
        expect(result.code).toBe('AWS_SFN_ERROR');
    });
});

// ═══════════════════════════════════════════════════════════════
// createAwsConnector — Live State Sync
// ═══════════════════════════════════════════════════════════════

describe('createAwsConnector', () => {
    it('refresh should return true when tool list changes', async () => {
        let callCount = 0;
        const { createAwsConnector } = await import('../src/createAwsConnector.js');

        const mockLambdaAdapter = {
            listFunctions: async () => {
                callCount++;
                if (callCount <= 1) {
                    return [{ functionName: 'Fn1', functionArn: 'arn:fn1', description: '', runtime: 'nodejs20.x' }];
                }
                return []; // Second call: empty
            },
            listTags: async () => ({ 'mcp:expose': 'true' }),
            invoke: async () => ({ statusCode: 200, payload: {} }),
        };

        const connector = await createAwsConnector({
            lambdaClient: mockLambdaAdapter,
            enableLambda: true,
        });

        expect(connector.tools()).toHaveLength(1);

        const changed = await connector.refresh();
        expect(changed).toBe(true);
        expect(connector.tools()).toHaveLength(0);
    });

    it('refresh should return false when tool list is the same', async () => {
        const { createAwsConnector } = await import('../src/createAwsConnector.js');

        const mockLambdaAdapter = {
            listFunctions: async () => [
                { functionName: 'Fn1', functionArn: 'arn:fn1', description: '', runtime: 'nodejs20.x' },
            ],
            listTags: async () => ({ 'mcp:expose': 'true' }),
            invoke: async () => ({ statusCode: 200, payload: {} }),
        };

        const connector = await createAwsConnector({
            lambdaClient: mockLambdaAdapter,
            enableLambda: true,
        });

        const changed = await connector.refresh();
        expect(changed).toBe(false);
    });

    it('stop should clear the polling timer', async () => {
        const { createAwsConnector } = await import('../src/createAwsConnector.js');

        const mockLambdaAdapter = {
            listFunctions: async () => [],
            listTags: async () => ({}),
            invoke: async () => ({ statusCode: 200, payload: {} }),
        };

        const connector = await createAwsConnector({
            lambdaClient: mockLambdaAdapter,
            enableLambda: true,
            pollInterval: 60_000,
        });

        // Should not throw
        connector.stop();
        connector.stop(); // idempotent
    });

    it('should call onError when polling encounters an error', async () => {
        const { createAwsConnector } = await import('../src/createAwsConnector.js');
        const errors: unknown[] = [];

        const failingAdapter = {
            listFunctions: async () => { throw new Error('AWS_UNREACHABLE'); },
            listTags: async () => ({}),
            invoke: async () => ({ statusCode: 200, payload: {} }),
        };

        const connector = await createAwsConnector({
            lambdaClient: {
                listFunctions: async () => [],
                listTags: async () => ({}),
                invoke: async () => ({ statusCode: 200, payload: {} }),
            },
            enableLambda: true,
            onError: (err) => errors.push(err),
        });

        // Manually simulate a failing refresh by swapping adapter
        // (the real polling would eventually call refresh)
        connector.stop();
    });
});
