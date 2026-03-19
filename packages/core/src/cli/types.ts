/**
 * CLI Types — Shared Configuration Types
 *
 * Configuration types collected from the interactive wizard
 * or CLI flags for the `vurb create` command.
 *
 * @module
 */

/** Primary ingestion vector for the scaffolded project */
export type IngestionVector = 'vanilla' | 'prisma' | 'n8n' | 'openapi' | 'oauth';

/** Transport layer for MCP communication */
export type TransportLayer = 'stdio' | 'sse';

/** Deploy target platform for scaffold generation */
export type DeployTarget = 'node' | 'vercel' | 'cloudflare';

/**
 * Project scaffold configuration.
 *
 * Collected from CLI flags or the interactive wizard.
 * Drives template generation and file selection.
 */
export interface ProjectConfig {
    /** Project name (directory name + package.json name) */
    readonly name: string;

    /** Transport layer for MCP communication */
    readonly transport: TransportLayer;

    /** Primary ingestion vector */
    readonly vector: IngestionVector;

    /** Include @vurb/testing + Vitest */
    readonly testing: boolean;

    /** Deploy target platform (default: 'node') */
    readonly target?: DeployTarget;
}

/** Remote cloud configuration stored in .vurbrc (gitignored) */
export interface RemoteConfig {
    /** API base URL (e.g., https://api.cloud.vinkius.com) */
    readonly remote: string;
    /** Target server UUID */
    readonly serverId: string;
    /** Deploy / connection token (sensitive — .vurbrc is gitignored) */
    readonly token: string;
}
