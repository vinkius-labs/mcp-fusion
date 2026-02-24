/**
 * create-mcp-fusion — Shared Types
 *
 * Configuration types collected from the interactive wizard.
 *
 * @module
 */

// ── Ingestion Vectors ────────────────────────────────────

export type IngestionVector =
    | 'blank'
    | 'database'
    | 'workflow'
    | 'openapi';

// ── Transport Layers ─────────────────────────────────────

export type TransportLayer = 'stdio' | 'sse';

// ── Types ────────────────────────────────────────────────

export type ToolExposition = 'flat' | 'grouped';

// ── Wizard Configuration ─────────────────────────────────

export interface ProjectConfig {
    /** Project name (directory name + package.json name) */
    readonly name: string;

    /** Tool exposition: flat (tools/) or grouped (MVA: models/views/agents/) */
    readonly exposition: ToolExposition;

    /** Primary ingestion vector */
    readonly vector: IngestionVector;

    /** Transport layer for MCP communication */
    readonly transport: TransportLayer;

    /** Include @vinkius-core/testing + Vitest */
    readonly testing: boolean;
}
