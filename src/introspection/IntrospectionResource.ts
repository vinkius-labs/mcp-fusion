/**
 * IntrospectionResource — MCP Resource Registration for Dynamic Manifest
 *
 * When introspection is enabled, this module silently registers two
 * MCP request handlers on the low-level Server:
 *
 *   1. `resources/list` — Advertises the manifest resource
 *   2. `resources/read` — Returns the RBAC-filtered manifest JSON
 *
 * Uses the native MCP Resource protocol — no custom HTTP endpoints.
 * Zero overhead when introspection is disabled (this module is never imported).
 *
 * @module
 */
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type ToolBuilder } from '../core/types.js';
import { type IntrospectionConfig, type ManifestPayload } from './types.js';
import { compileManifest, cloneManifest } from './ManifestCompiler.js';

// ── Types ────────────────────────────────────────────────

/** Default URI for the introspection resource */
const DEFAULT_URI = 'fusion://manifest.json';

/** Default resource name */
const RESOURCE_NAME = 'MCP Fusion Manifest';

/** Default resource description */
const RESOURCE_DESCRIPTION =
    'Dynamic introspection manifest exposing all registered tools, actions, ' +
    'and presenters. RBAC-filtered per session context.';

/** Default MIME type for the manifest resource */
const RESOURCE_MIME_TYPE = 'application/json';

/**
 * Typed interface for the low-level MCP Server with resource handler support.
 * Follows the same duck-typing pattern as ServerAttachment.
 */
interface McpServerWithResources {
    setRequestHandler(schema: typeof ListResourcesRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof ReadResourceRequestSchema, handler: (...args: never[]) => unknown): void;
}

/** Delegate interface for accessing registered builders (subset of ToolRegistry) */
export interface IntrospectionRegistryDelegate<TContext> {
    /** Iterate over all registered builders */
    values(): Iterable<ToolBuilder<TContext>>;
}

// ── Public API ───────────────────────────────────────────

/**
 * Register MCP Resource handlers for introspection on the low-level Server.
 *
 * Called by `attachToServer()` when `options.introspection.enabled` is `true`.
 *
 * @param server - The resolved low-level MCP Server instance
 * @param config - Introspection configuration (from AttachOptions)
 * @param serverName - Server name for the manifest payload
 * @param builders - Registry delegate providing builder iteration
 * @param contextFactory - Factory to create per-request context (from AttachOptions)
 */
export function registerIntrospectionResource<TContext>(
    server: unknown,
    config: IntrospectionConfig<TContext>,
    serverName: string,
    builders: IntrospectionRegistryDelegate<TContext>,
    contextFactory?: (extra: unknown) => TContext | Promise<TContext>,
): void {
    const resolved = server as McpServerWithResources;
    const uri = config.uri ?? DEFAULT_URI;

    // ── resources/list handler ────────────────────────────
    // Advertises the manifest resource to clients/orchestrators
    const existingListHandler = safeGetExistingListHandler(resolved);

    resolved.setRequestHandler(ListResourcesRequestSchema, (() => {
        // Merge with any previously registered resources
        const existingResources = existingListHandler ? existingListHandler() : [];

        return {
            resources: [
                ...existingResources,
                {
                    uri,
                    name: RESOURCE_NAME,
                    description: RESOURCE_DESCRIPTION,
                    mimeType: RESOURCE_MIME_TYPE,
                },
            ],
        };
    }) as (...args: never[]) => unknown);

    // ── resources/read handler ───────────────────────────
    // Returns the RBAC-filtered manifest when requested
    resolved.setRequestHandler(ReadResourceRequestSchema, (async (
        request: { params: { uri: string } },
        extra: unknown,
    ) => {
        const requestedUri = request.params.uri;

        // Only handle our manifest URI
        if (requestedUri !== uri) {
            return {
                contents: [],
            };
        }

        // Compile the full manifest from current registry state
        const fullManifest = compileManifest(serverName, builders.values());

        // Apply RBAC filter if configured
        let manifest: ManifestPayload;
        if (config.filter && contextFactory) {
            const ctx = await contextFactory(extra);
            // Clone before mutation to protect the compiled tree
            manifest = config.filter(cloneManifest(fullManifest), ctx);
        } else if (config.filter) {
            // Filter without context (e.g. static rules)
            manifest = config.filter(
                cloneManifest(fullManifest),
                undefined as TContext,
            );
        } else {
            manifest = fullManifest;
        }

        return {
            contents: [
                {
                    uri,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: JSON.stringify(manifest, null, 2),
                },
            ],
        };
    }) as (...args: never[]) => unknown);
}

// ── Private Helpers ──────────────────────────────────────

/**
 * Attempt to preserve an existing resources/list handler.
 *
 * Since the low-level Server replaces handlers (not appends), we
 * capture any existing handler before overwriting it. This allows
 * introspection to coexist with user-registered resources.
 *
 * @returns A function returning existing resources, or undefined
 */
function safeGetExistingListHandler(
    _server: McpServerWithResources,
): (() => Array<{ uri: string; name: string }>) | undefined {
    // The low-level MCP SDK doesn't expose a getter for existing handlers.
    // For now, introspection assumes it's the first to register resources/list.
    // If the user also registers resources, they should do so AFTER
    // attachToServer() or use the high-level McpServer.resource() API.
    return undefined;
}
