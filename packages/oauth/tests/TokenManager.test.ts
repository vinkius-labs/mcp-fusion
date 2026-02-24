/**
 * TokenManager Tests
 *
 * Validates secure token persistence with file storage,
 * environment variable priority, and pending device code TTL.
 *
 * Uses a temp directory to avoid touching the real home directory.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Import after mock is set up
const { TokenManager } = await import('../src/TokenManager.js');
import type { TokenManagerConfig } from '../src/TokenManager.js';

// ── Helpers ──────────────────────────────────────────────

function createManager(overrides?: Partial<TokenManagerConfig>): InstanceType<typeof TokenManager> {
    return new TokenManager({
        configDir: overrides?.configDir ?? '.mcp-fusion-test',
        tokenFile: overrides?.tokenFile,
        pendingAuthFile: overrides?.pendingAuthFile,
        envVar: overrides?.envVar,
    });
}

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-test-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// Constructor & Defaults
// ============================================================================

describe('TokenManager', () => {
    describe('constructor', () => {
        it('creates instance with default config', () => {
            const manager = new TokenManager();
            expect(manager).toBeInstanceOf(TokenManager);
        });

        it('creates instance with custom config', () => {
            const manager = createManager({
                configDir: '.custom-app',
                tokenFile: 'auth.json',
                pendingAuthFile: 'pending.json',
                envVar: 'CUSTOM_TOKEN',
            });
            expect(manager).toBeInstanceOf(TokenManager);
        });
    });

    // ========================================================================
    // Token Operations
    // ========================================================================

    describe('getToken', () => {
        it('returns null when no token exists', () => {
            const manager = createManager();
            expect(manager.getToken()).toBeNull();
        });

        it('returns token from saved file', () => {
            const manager = createManager();
            manager.saveToken('file-token-abc');
            expect(manager.getToken()).toBe('file-token-abc');
        });

        it('prioritizes environment variable over file', () => {
            const envKey = 'TEST_OAUTH_TOKEN_PRIORITY';
            process.env[envKey] = 'env-token-xyz';
            try {
                const manager = createManager({ envVar: envKey });
                manager.saveToken('file-token-abc');
                expect(manager.getToken()).toBe('env-token-xyz');
            } finally {
                delete process.env[envKey];
            }
        });

        it('falls back to file when env var is empty', () => {
            const envKey = 'TEST_OAUTH_TOKEN_EMPTY';
            process.env[envKey] = '';
            try {
                const manager = createManager({ envVar: envKey });
                manager.saveToken('file-token-fallback');
                expect(manager.getToken()).toBe('file-token-fallback');
            } finally {
                delete process.env[envKey];
            }
        });

        it('returns null when env var is unset and no file exists', () => {
            const manager = createManager({ envVar: 'NONEXISTENT_VAR_12345' });
            expect(manager.getToken()).toBeNull();
        });
    });

    // ========================================================================
    // Token Source
    // ========================================================================

    describe('getTokenSource', () => {
        it('returns null when no token exists', () => {
            const manager = createManager();
            expect(manager.getTokenSource()).toBeNull();
        });

        it('returns "file" when token is from saved file', () => {
            const manager = createManager();
            manager.saveToken('some-token');
            expect(manager.getTokenSource()).toBe('file');
        });

        it('returns "environment" when token is from env var', () => {
            const envKey = 'TEST_OAUTH_SOURCE_ENV';
            process.env[envKey] = 'env-token';
            try {
                const manager = createManager({ envVar: envKey });
                expect(manager.getTokenSource()).toBe('environment');
            } finally {
                delete process.env[envKey];
            }
        });

        it('returns "environment" even when file also exists', () => {
            const envKey = 'TEST_OAUTH_SOURCE_BOTH';
            process.env[envKey] = 'env-token';
            try {
                const manager = createManager({ envVar: envKey });
                manager.saveToken('file-token');
                expect(manager.getTokenSource()).toBe('environment');
            } finally {
                delete process.env[envKey];
            }
        });
    });

    // ========================================================================
    // hasToken
    // ========================================================================

    describe('hasToken', () => {
        it('returns false when no token exists', () => {
            const manager = createManager();
            expect(manager.hasToken()).toBe(false);
        });

        it('returns true when token is saved', () => {
            const manager = createManager();
            manager.saveToken('a-token');
            expect(manager.hasToken()).toBe(true);
        });

        it('returns true when env var is set', () => {
            const envKey = 'TEST_OAUTH_HAS_TOKEN';
            process.env[envKey] = 'env-token';
            try {
                const manager = createManager({ envVar: envKey });
                expect(manager.hasToken()).toBe(true);
            } finally {
                delete process.env[envKey];
            }
        });
    });

    // ========================================================================
    // saveToken & clearToken
    // ========================================================================

    describe('saveToken', () => {
        it('saves token and reads it back', () => {
            const manager = createManager();
            manager.saveToken('my-secret-token');
            expect(manager.getToken()).toBe('my-secret-token');
        });

        it('overwrites previously saved token', () => {
            const manager = createManager();
            manager.saveToken('token-v1');
            manager.saveToken('token-v2');
            expect(manager.getToken()).toBe('token-v2');
        });

        it('creates config directory if missing', () => {
            const manager = createManager({ configDir: '.brand-new-dir' });
            manager.saveToken('token');
            const dirPath = path.join(tmpDir, '.brand-new-dir');
            expect(fs.existsSync(dirPath)).toBe(true);
        });

        it('stores token with savedAt timestamp', () => {
            const manager = createManager();
            manager.saveToken('timestamped-token');
            const filePath = path.join(tmpDir, '.mcp-fusion-test', 'token.json');
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            expect(content).toHaveProperty('token', 'timestamped-token');
            expect(content).toHaveProperty('savedAt');
            expect(new Date(content.savedAt).getTime()).not.toBeNaN();
        });
    });

    describe('clearToken', () => {
        it('removes saved token', () => {
            const manager = createManager();
            manager.saveToken('to-be-cleared');
            manager.clearToken();
            expect(manager.getToken()).toBeNull();
        });

        it('does not throw when no token file exists', () => {
            const manager = createManager();
            expect(() => manager.clearToken()).not.toThrow();
        });
    });

    // ========================================================================
    // Pending Device Code
    // ========================================================================

    describe('savePendingDeviceCode', () => {
        it('saves and retrieves device code', () => {
            const manager = createManager();
            manager.savePendingDeviceCode('device-code-123', 600);
            expect(manager.getPendingDeviceCode()).toBe('device-code-123');
        });

        it('creates config directory if missing', () => {
            const manager = createManager({ configDir: '.pending-dir' });
            manager.savePendingDeviceCode('dc', 60);
            expect(fs.existsSync(path.join(tmpDir, '.pending-dir'))).toBe(true);
        });
    });

    describe('getPendingDeviceCode', () => {
        it('returns null when no pending code exists', () => {
            const manager = createManager();
            expect(manager.getPendingDeviceCode()).toBeNull();
        });

        it('returns null when device code has expired', () => {
            const manager = createManager();
            // Save with -1 second TTL (already expired)
            manager.savePendingDeviceCode('expired-code', -1);
            expect(manager.getPendingDeviceCode()).toBeNull();
        });

        it('returns code when TTL is still valid', () => {
            const manager = createManager();
            manager.savePendingDeviceCode('valid-code', 3600);
            expect(manager.getPendingDeviceCode()).toBe('valid-code');
        });

        it('returns null for corrupted file', () => {
            const manager = createManager();
            const dirPath = path.join(tmpDir, '.mcp-fusion-test');
            fs.mkdirSync(dirPath, { recursive: true });
            fs.writeFileSync(path.join(dirPath, 'pending-auth.json'), 'not-json{{{');
            expect(manager.getPendingDeviceCode()).toBeNull();
        });
    });

    describe('clearPendingDeviceCode', () => {
        it('removes pending device code', () => {
            const manager = createManager();
            manager.savePendingDeviceCode('to-clear', 600);
            manager.clearPendingDeviceCode();
            expect(manager.getPendingDeviceCode()).toBeNull();
        });

        it('does not throw when no pending file exists', () => {
            const manager = createManager();
            expect(() => manager.clearPendingDeviceCode()).not.toThrow();
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('handles custom file names', () => {
            const manager = createManager({
                tokenFile: 'custom-token.json',
                pendingAuthFile: 'custom-pending.json',
            });
            manager.saveToken('custom-file-token');
            expect(manager.getToken()).toBe('custom-file-token');

            manager.savePendingDeviceCode('custom-dc', 600);
            expect(manager.getPendingDeviceCode()).toBe('custom-dc');
        });

        it('two managers with different configDirs are isolated', () => {
            const manager1 = createManager({ configDir: '.app-one' });
            const manager2 = createManager({ configDir: '.app-two' });

            manager1.saveToken('token-one');
            manager2.saveToken('token-two');

            expect(manager1.getToken()).toBe('token-one');
            expect(manager2.getToken()).toBe('token-two');
        });
    });
});
