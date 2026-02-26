/**
 * CLI Types — Shared Configuration Types
 *
 * Configuration types collected from the interactive wizard
 * or CLI flags for the `fusion create` command.
 *
 * @module
 */

/** Primary ingestion vector for the scaffolded project */
export type IngestionVector = 'vanilla' | 'prisma' | 'n8n' | 'openapi' | 'oauth';

/** Transport layer for MCP communication */
export type TransportLayer = 'stdio' | 'sse';

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

    /** Include @vinkius-core/mcp-fusion-testing + Vitest */
    readonly testing: boolean;
}
