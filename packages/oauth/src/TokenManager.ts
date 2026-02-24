/**
 * Token Manager — Secure Token Persistence
 *
 * Stores authentication tokens in a local file with strict permissions (0o600).
 * Supports priority-based token resolution:
 *   1. Environment variable
 *   2. Saved token file
 *
 * Also manages pending device flow state for multi-step authentication.
 *
 * @example
 * ```ts
 * const manager = new TokenManager({
 *     configDir: '~/.myapp',
 *     envVar: 'MY_APP_TOKEN',
 * });
 *
 * manager.saveToken('eyJ...');
 * const token = manager.getToken(); // from env var or file
 * ```
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================================
// Types
// ============================================================================

export interface TokenManagerConfig {
    /** Directory name inside user's home (e.g., '.myapp'). Default: '.mcp-fusion' */
    readonly configDir?: string;
    /** Token filename. Default: 'token.json' */
    readonly tokenFile?: string;
    /** Pending auth filename. Default: 'pending-auth.json' */
    readonly pendingAuthFile?: string;
    /** Environment variable name to check first. Default: none */
    readonly envVar?: string;
}

export interface StoredToken {
    readonly token: string;
    readonly savedAt: string;
}

export type TokenSource = 'environment' | 'file' | null;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG_DIR = '.mcp-fusion';
const DEFAULT_TOKEN_FILE = 'token.json';
const DEFAULT_PENDING_FILE = 'pending-auth.json';
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

// ============================================================================
// TokenManager
// ============================================================================

/**
 * Manages authentication tokens with secure local storage.
 *
 * - Tokens stored with 0o600 permissions (owner read/write only)
 * - Config directory created with 0o700 permissions
 * - Priority: environment variable > saved file
 * - Pending device codes tracked with TTL
 */
export class TokenManager {
    private readonly configDirPath: string;
    private readonly tokenFilePath: string;
    private readonly pendingAuthFilePath: string;
    private readonly envVar: string | undefined;

    constructor(config?: TokenManagerConfig) {
        const dirName = config?.configDir ?? DEFAULT_CONFIG_DIR;
        this.configDirPath = path.join(os.homedir(), dirName);
        this.tokenFilePath = path.join(this.configDirPath, config?.tokenFile ?? DEFAULT_TOKEN_FILE);
        this.pendingAuthFilePath = path.join(this.configDirPath, config?.pendingAuthFile ?? DEFAULT_PENDING_FILE);
        this.envVar = config?.envVar;
    }

    // ========================================================================
    // Token Operations
    // ========================================================================

    /**
     * Get the current token.
     * Priority: environment variable > saved file.
     */
    getToken(): string | null {
        if (this.envVar) {
            const envToken = process.env[this.envVar];
            if (envToken) return envToken;
        }

        return this.readTokenFile();
    }

    /**
     * Determine where the current token comes from.
     */
    getTokenSource(): TokenSource {
        if (this.envVar && process.env[this.envVar]) return 'environment';
        if (this.readTokenFile()) return 'file';
        return null;
    }

    /** Check if a token is available from any source. */
    hasToken(): boolean {
        return this.getToken() !== null;
    }

    /** Save token to local file with secure permissions. */
    saveToken(token: string): void {
        this.ensureConfigDir();
        const data: StoredToken = {
            token,
            savedAt: new Date().toISOString(),
        };
        fs.writeFileSync(this.tokenFilePath, JSON.stringify(data, null, 2), { mode: FILE_MODE });
    }

    /** Remove saved token file. */
    clearToken(): void {
        this.deleteFile(this.tokenFilePath);
    }

    // ========================================================================
    // Pending Device Code (multi-step auth flow)
    // ========================================================================

    /** Save pending device_code with TTL for auth completion. */
    savePendingDeviceCode(deviceCode: string, expiresIn: number): void {
        this.ensureConfigDir();
        const data = {
            device_code: deviceCode,
            created_at: Date.now(),
            expires_at: Date.now() + (expiresIn * 1000),
        };
        fs.writeFileSync(this.pendingAuthFilePath, JSON.stringify(data, null, 2), { mode: FILE_MODE });
    }

    /** Get pending device_code if still valid (not expired). */
    getPendingDeviceCode(): string | null {
        if (!fs.existsSync(this.pendingAuthFilePath)) return null;

        try {
            const content = fs.readFileSync(this.pendingAuthFilePath, 'utf-8');
            const data = JSON.parse(content) as { device_code?: string; expires_at?: number };
            if (data.expires_at && Date.now() > data.expires_at) {
                this.clearPendingDeviceCode();
                return null;
            }
            return data.device_code ?? null;
        } catch {
            return null;
        }
    }

    /** Remove pending device code file. */
    clearPendingDeviceCode(): void {
        this.deleteFile(this.pendingAuthFilePath);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private ensureConfigDir(): void {
        if (!fs.existsSync(this.configDirPath)) {
            fs.mkdirSync(this.configDirPath, { recursive: true, mode: DIR_MODE });
        }
    }

    private readTokenFile(): string | null {
        if (!fs.existsSync(this.tokenFilePath)) return null;
        try {
            const content = fs.readFileSync(this.tokenFilePath, 'utf-8');
            const data = JSON.parse(content) as StoredToken;
            return data.token ?? null;
        } catch {
            return null;
        }
    }

    private deleteFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
            // Silently ignore cleanup errors
        }
    }
}
