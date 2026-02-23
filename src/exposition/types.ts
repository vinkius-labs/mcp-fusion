/**
 * ExpositionTypes — Tool Exposition Strategy Contracts
 *
 * Defines the configuration interfaces for the Topology Compiler Pattern.
 * Controls how the framework projects grouped tool definitions onto the
 * MCP protocol wire format.
 *
 * @module
 */

// ── Exposition Strategy ──────────────────────────────────

/**
 * Tool exposition strategy.
 *
 * - `'flat'` — Each action is exposed as an independent atomic MCP tool.
 *   Guarantees privilege isolation, deterministic routing, and granular UI.
 *   **This is the default.**
 *
 * - `'grouped'` — All actions within a builder are merged into a single
 *   MCP tool with a discriminated-union schema. Optimizes context-window
 *   token economy at the cost of UI granularity.
 *
 * @see {@link ExpositionConfig} for full configuration
 */
export type ToolExposition = 'flat' | 'grouped';

/**
 * Configuration for the Topology Compiler's exposition strategy.
 *
 * @example
 * ```typescript
 * registry.attachToServer(server, {
 *     contextFactory: createContext,
 *     toolExposition: 'flat',      // Each action = 1 MCP tool
 *     actionSeparator: '_',        // projects_list, projects_create
 * });
 * ```
 */
export interface ExpositionConfig {
    /**
     * Exposition strategy for projecting grouped tools onto the MCP wire format.
     *
     * @default 'flat'
     */
    toolExposition?: ToolExposition;

    /**
     * Delimiter for deterministic naming interpolation in flat mode.
     * Used to join `{toolName}{separator}{actionKey}`.
     *
     * @default '_'
     *
     * @example
     * ```typescript
     * // With separator '_': projects_list, projects_create
     * // With separator '.': projects.list, projects.create
     * // With separator '-': projects-list, projects-create
     * ```
     */
    actionSeparator?: string;
}
