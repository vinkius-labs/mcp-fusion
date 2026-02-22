/**
 * Introspection Types — Enterprise-Grade Dynamic Manifest
 *
 * Type definitions for the RBAC-aware introspection system.
 * The manifest is exposed as a standard MCP Resource, never as
 * a custom HTTP endpoint.
 *
 * This module has ZERO runtime code — only type declarations.
 *
 * @module
 */


// ── Configuration ────────────────────────────────────────

/**
 * Configuration for the introspection system.
 *
 * When enabled, the framework silently registers a MCP Resource
 * that exposes a dynamic manifest of all tools, actions, and
 * presenters — filtered by the session's security context.
 *
 * @typeParam TContext - Application context (same as ToolRegistry)
 *
 * @example
 * ```typescript
 * registry.attachToServer(server, {
 *     contextFactory: createContext,
 *     introspection: {
 *         enabled: process.env.NODE_ENV !== 'production',
 *         uri: 'fusion://manifest.json',
 *         filter: (manifest, ctx) => {
 *             if (ctx.user.role !== 'admin') {
 *                 delete manifest.capabilities.tools['admin.delete_user'];
 *             }
 *             return manifest;
 *         },
 *     },
 * });
 * ```
 */
export interface IntrospectionConfig<TContext> {
    /**
     * Whether introspection is enabled.
     *
     * Smart default pattern: `process.env.NODE_ENV !== 'production'`
     * The framework NEVER enables this silently — strict opt-in.
     */
    readonly enabled: boolean;

    /**
     * Custom URI for the MCP Resource.
     * @defaultValue `'fusion://manifest.json'`
     */
    readonly uri?: string;

    /**
     * RBAC-aware manifest filter.
     *
     * Called on every `resources/read` with the compiled manifest
     * and the session context. Use this to remove tools, actions,
     * or presenters that the requesting agent should not see.
     *
     * **Security model**: Unauthorized agents don't even know the
     * hidden surface exists — it's removed from the tree entirely.
     *
     * @param manifest - The full compiled manifest (mutable clone)
     * @param ctx - The session context (user, role, tenant, etc.)
     * @returns The filtered manifest
     */
    readonly filter?: (manifest: ManifestPayload, ctx: TContext) => ManifestPayload;
}

// ── Manifest Payload ─────────────────────────────────────

/** Top-level manifest payload returned by `resources/read` */
export interface ManifestPayload {
    /** Server name (from AttachOptions or registry metadata) */
    readonly server: string;
    /** MCP Fusion framework version */
    readonly mcp_fusion_version: string;
    /** Architecture label */
    readonly architecture: 'MVA (Model-View-Agent)';
    /** Capabilities tree */
    capabilities: ManifestCapabilities;
}

/** Capabilities subtree of the manifest */
export interface ManifestCapabilities {
    /** Registered tools, keyed by tool name */
    tools: Record<string, ManifestTool>;
    /** Registered presenters, keyed by presenter name */
    presenters: Record<string, ManifestPresenter>;
}

/** A single tool entry in the manifest */
export interface ManifestTool {
    /** Human-readable tool description */
    readonly description: string | undefined;
    /** Tags for selective exposure */
    readonly tags: readonly string[];
    /** Actions within this tool */
    readonly actions: Record<string, ManifestAction>;
    /** JSON Schema of the complete inputSchema */
    readonly input_schema: object;
}

/** A single action entry within a tool */
export interface ManifestAction {
    /** Human-readable description */
    readonly description: string | undefined;
    /** Whether this action is destructive */
    readonly destructive: boolean;
    /** Whether this action is idempotent */
    readonly idempotent: boolean;
    /** Whether this action is read-only */
    readonly readOnly: boolean;
    /** Required field names */
    readonly required_fields: readonly string[];
    /** Presenter name (if MVA pattern is used) */
    readonly returns_presenter: string | undefined;
}

/** A presenter entry in the manifest */
export interface ManifestPresenter {
    /** Schema keys exposed to the LLM */
    readonly schema_keys: readonly string[];
    /** UI block types supported (echarts, mermaid, etc.) */
    readonly ui_blocks_supported: readonly string[];
    /** Whether the presenter has context-aware system rules */
    readonly has_contextual_rules: boolean;
}
