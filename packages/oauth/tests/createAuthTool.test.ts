/**
 * createAuthTool Tests
 *
 * Validates the auth tool factory that creates a complete mcp-fusion tool
 * with login, complete, status, and logout actions.
 *
 * Uses real createTool builder with mock fetch for DeviceAuthenticator.
 * TokenManager uses temp directory to avoid touching the real home dir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Mock os.homedir() for ESM ────────────────────────────

let tmpDir: string;

vi.mock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    return {
        ...actual,
        default: {
            ...actual,
            homedir: () => tmpDir,
        },
        homedir: () => tmpDir,
    };
});

// Import after mock setup
const { createAuthTool } = await import('../src/createAuthTool.js');
import type { AuthToolConfig } from '../src/createAuthTool.js';
import type { DeviceCodeResponse, TokenResponse } from '../src/DeviceAuthenticator.js';

// ── Temp Directory ───────────────────────────────────────

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-tool-test-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Fixtures ─────────────────────────────────────────────

const DEVICE_CODE: DeviceCodeResponse = {
    device_code: 'test-device-code',
    user_code: 'TEST-1234',
    verification_uri: 'https://example.com/activate',
    verification_uri_complete: 'https://example.com/activate?code=TEST-1234',
    expires_in: 900,
    interval: 5,
};

const TOKEN: TokenResponse = {
    access_token: 'access-token-xyz',
    token_type: 'Bearer',
    expires_in: 3600,
};

// ── Helpers ──────────────────────────────────────────────

interface TestContext {
    token?: string;
}

function parseContent(result: { content: Array<{ text: string }> }): unknown {
    return JSON.parse(result.content[0].text);
}

const originalFetch = globalThis.fetch;

function buildTool(overrides?: Partial<AuthToolConfig<TestContext>>) {
    return createAuthTool<TestContext>({
        clientId: 'test-client-id',
        authorizationEndpoint: 'https://auth.example.com/device/code',
        tokenEndpoint: 'https://auth.example.com/device/token',
        tokenManager: { configDir: '.auth-tool-test' },
        ...overrides,
    });
}

/**
 * Build a tool with a mock fetch injected via globalThis.fetch.
 * Must be called to create the tool so DeviceAuthenticator captures the mock.
 */
function buildToolWithFetch(
    fetchMock: typeof globalThis.fetch,
    overrides?: Partial<AuthToolConfig<TestContext>>,
) {
    globalThis.fetch = fetchMock;
    return buildTool(overrides);
}

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// ============================================================================
// Tool Builder Shape
// ============================================================================

describe('createAuthTool', () => {
    describe('builder', () => {
        it('creates a tool builder', () => {
            const tool = buildTool();
            expect(tool).toBeDefined();
            expect(tool.getName()).toBe('auth');
        });

        it('uses custom tool name', () => {
            const tool = buildTool({ toolName: 'my-auth' });
            expect(tool.getName()).toBe('my-auth');
        });

        it('has four actions', () => {
            const tool = buildTool();
            const actions = tool.getActionNames();
            expect(actions).toContain('login');
            expect(actions).toContain('complete');
            expect(actions).toContain('status');
            expect(actions).toContain('logout');
            expect(actions).toHaveLength(4);
        });

        it('accepts custom tags', () => {
            const tool = buildTool({ tags: ['auth', 'device-flow'] });
            expect(tool.getTags()).toEqual(['auth', 'device-flow']);
        });
    });

    // ========================================================================
    // Login Action
    // ========================================================================

    describe('action: login', () => {
        it('returns verification URL on success', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => DEVICE_CODE,
            })) as unknown as typeof globalThis.fetch;

            const tool = buildToolWithFetch(fetchMock, { headers: { 'X-Test': '1' } });
            const result = await tool.execute({} as TestContext, { action: 'login' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('status', 'pending');
            expect(body).toHaveProperty('verification_url', DEVICE_CODE.verification_uri_complete);
            expect(body).toHaveProperty('instructions');
            expect(result.isError).toBeFalsy();
        });

        it('returns error when device code request fails', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                json: async () => ({ error: 'invalid_client', error_description: 'Unauthorized client' }),
            })) as unknown as typeof globalThis.fetch;

            const tool = buildToolWithFetch(fetchMock);
            const result = await tool.execute({} as TestContext, { action: 'login' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(result.isError).toBe(true);
            expect(body).toHaveProperty('error');
        });

        it('classifies network errors correctly', async () => {
            const fetchMock = vi.fn(async () => {
                throw new Error('Unable to connect to ECONNREFUSED');
            }) as unknown as typeof globalThis.fetch;

            const tool = buildToolWithFetch(fetchMock);
            const result = await tool.execute({} as TestContext, { action: 'login' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(result.isError).toBe(true);
            expect(body).toHaveProperty('error', 'network');
        });
    });

    // ========================================================================
    // Complete Action
    // ========================================================================

    describe('action: complete', () => {
        it('returns error when no pending auth exists', async () => {
            const tool = buildTool();
            const result = await tool.execute({} as TestContext, { action: 'complete' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(result.isError).toBe(true);
            expect(body).toHaveProperty('error', 'no_pending_auth');
        });

        it('completes auth with pending device code', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: async () => DEVICE_CODE,
                })
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: async () => TOKEN,
                }) as unknown as typeof globalThis.fetch;

            const onAuthenticated = vi.fn();
            const tool = buildToolWithFetch(fetchMock, { onAuthenticated });

            // Step 1: Login to save pending device code
            await tool.execute({} as TestContext, { action: 'login' });

            // Step 2: Complete
            const ctx = {} as TestContext;
            const result = await tool.execute(ctx, { action: 'complete' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(result.isError).toBeFalsy();
            expect(body).toHaveProperty('status', 'authenticated');
            expect(onAuthenticated).toHaveBeenCalledWith('access-token-xyz', ctx);
        });

        it('returns authorization_pending status', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: async () => DEVICE_CODE,
                })
                .mockResolvedValueOnce({
                    ok: false, status: 400,
                    json: async () => ({ error: 'authorization_pending', error_description: 'User not yet authorized' }),
                }) as unknown as typeof globalThis.fetch;

            const tool = buildToolWithFetch(fetchMock);

            await tool.execute({} as TestContext, { action: 'login' });
            const result = await tool.execute({} as TestContext, { action: 'complete' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(result.isError).toBeFalsy();
            expect(body).toHaveProperty('status', 'authorization_pending');
        });

        it('accepts explicit device_code in args', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: true, status: 200,
                json: async () => TOKEN,
            })) as unknown as typeof globalThis.fetch;

            const tool = buildToolWithFetch(fetchMock);
            const result = await tool.execute({} as TestContext, {
                action: 'complete',
                device_code: 'explicit-dc',
            });
            const body = parseContent(result) as Record<string, unknown>;

            expect(result.isError).toBeFalsy();
            expect(body).toHaveProperty('status', 'authenticated');
        });

        it('calls getUser after successful auth', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: true, status: 200,
                json: async () => TOKEN,
            })) as unknown as typeof globalThis.fetch;

            const getUser = vi.fn(async () => ({ name: 'John', email: 'john@test.com' }));
            const tool = buildToolWithFetch(fetchMock, { getUser });
            const result = await tool.execute({} as TestContext, {
                action: 'complete',
                device_code: 'dc',
            });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('user');
            expect((body as { user: { name: string } }).user.name).toBe('John');
        });
    });

    // ========================================================================
    // Status Action
    // ========================================================================

    describe('action: status', () => {
        it('returns not authenticated when no token', async () => {
            const tool = buildTool();
            const result = await tool.execute({} as TestContext, { action: 'status' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('authenticated', false);
            expect(body).toHaveProperty('options');
        });

        it('returns authenticated after saving token', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: true, status: 200,
                json: async () => TOKEN,
            })) as unknown as typeof globalThis.fetch;

            const tool = buildToolWithFetch(fetchMock);
            // Save a token via complete action
            await tool.execute({} as TestContext, { action: 'complete', device_code: 'dc' });

            // Check status
            const result = await tool.execute({} as TestContext, { action: 'status' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('authenticated', true);
            expect(body).toHaveProperty('token_source', 'file');
        });

        it('returns user info when getUser is provided', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: true, status: 200,
                json: async () => TOKEN,
            })) as unknown as typeof globalThis.fetch;

            const getUser = vi.fn(async () => ({ name: 'Alice', email: 'alice@test.com' }));
            const tool = buildToolWithFetch(fetchMock, { getUser });
            await tool.execute({} as TestContext, { action: 'complete', device_code: 'dc' });

            const result = await tool.execute({} as TestContext, { action: 'status' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('authenticated', true);
            expect(body).toHaveProperty('user');
            expect((body as { user: { name: string } }).user.name).toBe('Alice');
        });

        it('returns token_invalid when getUser throws', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: true, status: 200,
                json: async () => TOKEN,
            })) as unknown as typeof globalThis.fetch;

            const getUser = vi.fn(async () => { throw new Error('Token expired'); });
            const tool = buildToolWithFetch(fetchMock, { getUser });
            await tool.execute({} as TestContext, { action: 'complete', device_code: 'dc' });

            const result = await tool.execute({} as TestContext, { action: 'status' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(result.isError).toBe(true);
            expect(body).toHaveProperty('error', 'token_invalid');
        });
    });

    // ========================================================================
    // Logout Action
    // ========================================================================

    describe('action: logout', () => {
        it('clears token and returns logged_out', async () => {
            const fetchMock = vi.fn(async () => ({
                ok: true, status: 200,
                json: async () => TOKEN,
            })) as unknown as typeof globalThis.fetch;

            const tool = buildToolWithFetch(fetchMock);

            // First authenticate
            await tool.execute({} as TestContext, { action: 'complete', device_code: 'dc' });

            // Verify authenticated
            const statusBefore = await tool.execute({} as TestContext, { action: 'status' });
            expect(parseContent(statusBefore)).toHaveProperty('authenticated', true);

            // Logout
            const result = await tool.execute({} as TestContext, { action: 'logout' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('status', 'logged_out');
            expect(result.isError).toBeFalsy();

            // Verify not authenticated
            const statusAfter = await tool.execute({} as TestContext, { action: 'status' });
            expect(parseContent(statusAfter)).toHaveProperty('authenticated', false);
        });

        it('calls onLogout callback', async () => {
            const onLogout = vi.fn();
            const tool = buildTool({ onLogout });

            const ctx = {} as TestContext;
            await tool.execute(ctx, { action: 'logout' });

            expect(onLogout).toHaveBeenCalledWith(ctx);
        });

        it('succeeds even when onLogout throws', async () => {
            const onLogout = vi.fn(async () => { throw new Error('Logout API failed'); });
            const tool = buildTool({ onLogout });

            const result = await tool.execute({} as TestContext, { action: 'logout' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('status', 'logged_out');
            expect(result.isError).toBeFalsy();
        });

        it('succeeds even when no token was saved', async () => {
            const tool = buildTool();
            const result = await tool.execute({} as TestContext, { action: 'logout' });
            const body = parseContent(result) as Record<string, unknown>;

            expect(body).toHaveProperty('status', 'logged_out');
        });
    });
});
