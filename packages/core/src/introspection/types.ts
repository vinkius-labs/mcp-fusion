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
 *         uri: 'mcpfusion://manifest.json',
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
     * @defaultValue `'mcpfusion://manifest.json'`
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
    readonly MCPFUSION_VERSION: string;
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

// ── Server Card (SEP-1649 Auto-Discovery) ────────────────

/**
 * Configuration for MCP Server Card generation.
 *
 * When provided, MCP Fusion auto-generates a `/.well-known/mcp/server-card.json`
 * endpoint that AI clients use for auto-discovery and configuration.
 *
 * @example
 * ```typescript
 * await startServer({
 *     name: 'billing-api',
 *     version: '2.1.0',
 *     registry,
 *     transport: 'http',
 *     serverCard: {
 *         title: 'Billing API',
 *         description: 'Financial operations and invoice management',
 *         documentationUrl: 'https://docs.example.com/billing',
 *     },
 * });
 * ```
 */
export interface ServerCardConfig {
    /** Server programmatic identifier (usually same as `startServer.name`). */
    readonly name: string;

    /** Server software version (e.g. '2.1.0'). */
    readonly version?: string;

    /**
     * Human-readable display name for the server.
     * Shown in MCP client UIs (Claude, Cursor, etc.).
     */
    readonly title?: string;

    /** Human-readable description of the server's purpose. */
    readonly description?: string;

    /** URL to an icon representing the server. */
    readonly iconUrl?: string;

    /** URL to the server's official documentation. */
    readonly documentationUrl?: string;

    /**
     * Transport type.
     * @default 'streamable-http'
     */
    readonly transport?: 'streamable-http' | 'stdio';

    /**
     * Transport endpoint path (for HTTP-based transports).
     * @default '/mcp'
     */
    readonly endpoint?: string;

    /**
     * MCP protocol version supported by this server.
     *
     * MCP Fusion defaults to `'2026-07-28'` (MCP 2.0), which introduced the
     * stateless protocol, per-request capability negotiation, and deprecated
     * Roots, Sampling, Logging, and Dynamic Client Registration
     * (see [MCP 2.0 Deprecated Features](/docs/deprecation-registry)).
     *
     * @default '2026-07-28'
     */
    readonly protocolVersion?: string;
}

/**
 * The compiled Server Card payload served at `/.well-known/mcp/server-card.json`.
 *
 * Follows the SEP-1649 specification for MCP server auto-discovery.
 */
export interface ServerCardPayload {
    /** JSON Schema URL for the server card format. */
    readonly $schema: string;
    /** Server card schema version. */
    readonly version: string;
    /** MCP protocol version supported. */
    readonly protocolVersion: string;
    /** Server identification. */
    readonly serverInfo: {
        readonly name: string;
        readonly version: string;
        readonly title?: string;
    };
    /** Human-readable description. */
    readonly description?: string;
    /** Icon URL. */
    readonly iconUrl?: string;
    /** Documentation URL. */
    readonly documentationUrl?: string;
    /** Transport configuration. */
    readonly transport: {
        readonly type: 'streamable-http' | 'stdio';
        readonly endpoint?: string;
    };
    /** Declared capabilities (tools, prompts, resources). */
    readonly capabilities: {
        tools?: Record<string, never>;
        prompts?: Record<string, never>;
        resources?: Record<string, never>;
    };
    /** Detailed tool entries for discovery. */
    readonly tools?: readonly ServerCardToolEntry[];
    /** Prompt entries for discovery. */
    readonly prompts?: readonly { name: string; description?: string }[];
    /** Resource entries for discovery. */
    readonly resources?: readonly { uri: string; name: string; description?: string; mimeType?: string }[];
}

/** A single tool entry in the Server Card. */
export interface ServerCardToolEntry {
    /** Tool programmatic name. */
    readonly name: string;
    /** Human-readable tool description. */
    readonly description: string | undefined;
    /** Tags for categorization. */
    readonly tags: readonly string[];
}
