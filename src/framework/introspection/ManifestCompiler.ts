/**
 * ManifestCompiler — Compiles the Dynamic Introspection Manifest
 *
 * Given a registry of tool builders, extracts all metadata (names,
 * descriptions, action metadata, Zod→JSON Schema, presenter info)
 * and compiles a structured {@link ManifestPayload}.
 *
 * The compiler operates on the **public** {@link ToolBuilder} interface,
 * never accessing internals. This guarantees compatibility with custom
 * builder implementations.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import { type ToolBuilder } from '../types.js';
import {
    type ManifestPayload,
    type ManifestCapabilities,
    type ManifestTool,
    type ManifestAction,
    type ManifestPresenter,
} from './types.js';

// ── Package Version ──────────────────────────────────────

/**
 * Framework version injected into every manifest.
 * Imported at build time — zero runtime FS overhead.
 */
const MCP_FUSION_VERSION = '1.1.0';

// ── Public API ───────────────────────────────────────────

/**
 * Compile a full manifest payload from a set of tool builders.
 *
 * @param serverName - The server name (from config or fallback)
 * @param builders - Iterable of all registered tool builders
 * @returns A deep-cloneable manifest payload
 */
export function compileManifest<TContext>(
    serverName: string,
    builders: Iterable<ToolBuilder<TContext>>,
): ManifestPayload {
    const capabilities = compileCapabilities(builders);

    return {
        server: serverName,
        mcp_fusion_version: MCP_FUSION_VERSION,
        architecture: 'MVA (Model-View-Agent)',
        capabilities,
    };
}

// ── Internal Steps ───────────────────────────────────────

/** Compile tools and collect unique presenters across all builders. */
function compileCapabilities<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
): ManifestCapabilities {
    const tools: Record<string, ManifestTool> = {};
    const presenters: Record<string, ManifestPresenter> = {};

    for (const builder of builders) {
        const toolDef = builder.buildToolDefinition();
        const metadata = builder.getActionMetadata();

        // Compile actions
        const actions: Record<string, ManifestAction> = {};
        for (const action of metadata) {
            const presenterName = action.presenterName;

            actions[action.key] = {
                description: action.description,
                destructive: action.destructive,
                idempotent: action.idempotent,
                readOnly: action.readOnly,
                required_fields: action.requiredFields,
                returns_presenter: presenterName,
            };

            // Collect presenter stub (if not already registered)
            if (presenterName && !presenters[presenterName]) {
                presenters[presenterName] = {
                    schema_keys: action.presenterSchemaKeys ?? [],
                    ui_blocks_supported: action.presenterUiBlockTypes ?? [],
                    has_contextual_rules: action.presenterHasContextualRules ?? false,
                };
            }
        }

        tools[builder.getName()] = {
            description: toolDef.description,
            tags: builder.getTags(),
            actions,
            input_schema: toolDef.inputSchema,
        };
    }

    return { tools, presenters };
}

/**
 * Deep-clone a manifest payload for safe mutation by the RBAC filter.
 *
 * Uses structured clone semantics via JSON round-trip (the manifest
 * is a pure JSON-serializable object — no functions, no circular refs).
 */
export function cloneManifest(manifest: ManifestPayload): ManifestPayload {
    return JSON.parse(JSON.stringify(manifest)) as ManifestPayload;
}
