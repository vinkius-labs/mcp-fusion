/**
 * GeneratorConfig — Full Configuration for the OpenAPI-to-MCP Generator
 *
 * Controls every aspect of code generation: which MCP Fusion features
 * are enabled, naming conventions, tag filtering, server scaffolding,
 * and context injection.
 *
 * Can be loaded from a YAML file (`openapi-gen.yaml`) or passed programmatically.
 *
 * @module
 */

// ── Feature Toggles ──────────────────────────────────────

/**
 * Controls which MCP Fusion features appear in generated code.
 * All fields default to `true` for maximum fidelity.
 */
export interface FeatureFlags {
    /** Apply OpenAPI tags as MCP tool tags via `.tags()` */
    readonly tags: boolean;
    /** Infer `readOnly` / `destructive` / `idempotent` from HTTP methods */
    readonly annotations: boolean;
    /** Generate Presenter files with `createPresenter()` + Zod response schemas */
    readonly presenters: boolean;
    /** Chain `.describe()` on every Zod field that has an OpenAPI description */
    readonly descriptions: boolean;
    /** Handle deprecated operations: 'skip' = omit, 'comment' = add @deprecated JSDoc */
    readonly deprecated: 'skip' | 'comment' | 'include';
    /** Enable `toonDescription: true` on generated `defineTool()` calls */
    readonly toonDescription: boolean;
    /** Generate a complete MCP Server file (`server.ts`) with `attachToServer()` */
    readonly serverFile: boolean;
}

// ── Naming Config ────────────────────────────────────────

/** Controls how action names are derived from operationId / path */
export interface NamingConfig {
    /** Action naming style */
    readonly style: 'snake_case' | 'camelCase';
    /** Append _2, _3 for collision resolution */
    readonly deduplication: boolean;
}

// ── Context Config ───────────────────────────────────────

/** Controls the context type used in generated tools */
export interface ContextConfig {
    /** Import path with type name, e.g. `'../src/types.js#MyAppContext'` */
    readonly import?: string;
}

// ── Server Config ────────────────────────────────────────

/** Controls the generated MCP Server file */
export interface ServerConfig {
    /** Server name shown to MCP clients */
    readonly name: string;
    /** Server version */
    readonly version: string;
    /** Transport type for the generated server */
    readonly transport: 'stdio' | 'sse';
    /**
     * Exposition strategy for projecting tools onto the MCP wire format.
     * - `'flat'`    — Each action becomes an independent MCP tool (default)
     * - `'grouped'` — All actions in a builder merge into a single MCP tool
     */
    readonly toolExposition: 'flat' | 'grouped';
    /**
     * Separator for flat mode action naming: `{toolName}{separator}{actionKey}`.
     * @default '_'
     * @example 'pet_get_by_id', 'pet.get_by_id', 'pet-get_by_id'
     */
    readonly actionSeparator: string;
}

// ── Full Config ──────────────────────────────────────────

/**
 * Complete generator configuration.
 *
 * Can be loaded from `openapi-gen.yaml` or passed to `emitFiles()`.
 * All fields have sensible defaults — see {@link DEFAULT_CONFIG}.
 */
export interface GeneratorConfig {
    /** Path to OpenAPI spec file (YAML or JSON) */
    readonly input?: string;
    /** Output directory for generated files */
    readonly output?: string;
    /** Base URL expression for fetch calls (default: `'ctx.baseUrl'`) */
    readonly baseUrl?: string;
    /** Feature toggles */
    readonly features: FeatureFlags;
    /** Naming conventions */
    readonly naming: NamingConfig;
    /** Context type injection */
    readonly context: ContextConfig;
    /** Server generation settings */
    readonly server: ServerConfig;
    /** Only generate tools for these tags (empty = all) */
    readonly includeTags: readonly string[];
    /** Exclude these tags from generation */
    readonly excludeTags: readonly string[];
}

// ── Defaults ─────────────────────────────────────────────

/** Default configuration — all features enabled */
export const DEFAULT_CONFIG: GeneratorConfig = {
    features: {
        tags: true,
        annotations: true,
        presenters: true,
        descriptions: true,
        deprecated: 'comment',
        toonDescription: false,
        serverFile: true,
    },
    naming: {
        style: 'snake_case',
        deduplication: true,
    },
    context: {},
    server: {
        name: 'openapi-mcp-server',
        version: '1.0.0',
        transport: 'stdio',
        toolExposition: 'flat',
        actionSeparator: '_',
    },
    includeTags: [],
    excludeTags: [],
};

// ── Merge Helper ─────────────────────────────────────────

/**
 * Deep-merge a partial config with defaults.
 * Partial values override defaults at each level.
 */
export function mergeConfig(partial: PartialConfig): GeneratorConfig {
    const inclTags = partial.includeTags;
    const exclTags = partial.excludeTags;

    // Build server config safely (avoid spreading undefined values)
    const serverOverrides = partial.server ?? {};
    const serverCfg = {
        name: serverOverrides.name ?? DEFAULT_CONFIG.server.name,
        version: serverOverrides.version ?? DEFAULT_CONFIG.server.version,
        transport: serverOverrides.transport ?? DEFAULT_CONFIG.server.transport,
        toolExposition: serverOverrides.toolExposition ?? DEFAULT_CONFIG.server.toolExposition,
        actionSeparator: serverOverrides.actionSeparator ?? DEFAULT_CONFIG.server.actionSeparator,
    };

    // Build context config safely
    const ctxOverrides = partial.context ?? {};
    const ctxCfg: ContextConfig = {
        ...(ctxOverrides.import !== undefined ? { import: ctxOverrides.import } : {}),
    };

    const result: GeneratorConfig = {
        ...(partial.input !== undefined ? { input: partial.input } : {}),
        ...(partial.output !== undefined ? { output: partial.output } : {}),
        ...(partial.baseUrl !== undefined ? { baseUrl: partial.baseUrl } : {}),
        features: {
            ...DEFAULT_CONFIG.features,
            ...(partial.features ?? {}),
        },
        naming: {
            ...DEFAULT_CONFIG.naming,
            ...(partial.naming ?? {}),
        },
        context: ctxCfg,
        server: serverCfg,
        includeTags: inclTags !== undefined ? inclTags.filter((t): t is string => t !== undefined) : DEFAULT_CONFIG.includeTags,
        excludeTags: exclTags !== undefined ? exclTags.filter((t): t is string => t !== undefined) : DEFAULT_CONFIG.excludeTags,
    };
    return result;
}

/** Partial config shape for merging */
export interface PartialConfig {
    readonly input?: string;
    readonly output?: string;
    readonly baseUrl?: string;
    readonly features?: Partial<FeatureFlags>;
    readonly naming?: Partial<NamingConfig>;
    readonly context?: Partial<ContextConfig>;
    readonly server?: Partial<ServerConfig>;
    readonly includeTags?: readonly string[];
    readonly excludeTags?: readonly string[];
}
