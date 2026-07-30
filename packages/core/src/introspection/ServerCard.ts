/**
 * ServerCard — MCP Server Card Compiler (SEP-1649)
 *
 * Compiles a standard `/.well-known/mcp/server-card.json` payload from
 * the MCP Fusion registry metadata for auto-discovery by MCP clients
 * (Claude, Cursor, ChatGPT, etc.).
 *
 * The Server Card enables AI agents to automatically discover and
 * inspect a server's capabilities, authentication requirements,
 * and available primitives before establishing a connection.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import { type ServerCardConfig, type ServerCardPayload, type ServerCardToolEntry } from './types.js';

/**
 * Minimal duck-typed interface for tool builders.
 * Avoids hard dependency on the full ToolBuilder<TContext> generic.
 * Any object with these three methods qualifies.
 * @internal
 */
interface ServerCardBuilderLike {
    getName(): string;
    buildToolDefinition(): unknown;
    getTags?(): readonly string[];
}

// ── Constants ────────────────────────────────────────────

/** Default schema URL for the MCP Server Card format */
const DEFAULT_SCHEMA = 'https://modelcontextprotocol.io/schemas/server-card/v1';

/** Default server card schema version */
const DEFAULT_CARD_VERSION = '1.0';

/** Default MCP protocol version (MCP 2.0 — 2026-07-28 spec) */
const DEFAULT_PROTOCOL_VERSION = '2026-07-28';

/** Well-known path for the server card endpoint */
export const SERVER_CARD_PATH = '/.well-known/mcp/server-card.json';

// ── Prompt/Resource Interfaces (duck-typed) ──────────────

/**
 * Minimal duck-typed interface for prompt entries.
 * Avoids hard dependency on PromptRegistry.
 * @internal
 */
interface PromptEntryLike {
    readonly name: string;
    readonly description?: string;
}

/**
 * Minimal duck-typed interface for resource entries.
 * Avoids hard dependency on ResourceRegistry.
 * @internal
 */
interface ResourceEntryLike {
    readonly uri: string;
    readonly name: string;
    readonly description?: string;
    readonly mimeType?: string;
}

// ── Public API ───────────────────────────────────────────

/**
 * Compile a Server Card payload from MCP Fusion registry metadata.
 *
 * Extracts tool names, descriptions, prompt definitions, resource
 * URIs, and auth requirements into the standard Server Card format.
 *
 * @param config - Server card configuration
 * @param builders - Iterable of all registered tool builders
 * @param prompts - Optional list of prompt definitions
 * @param resources - Optional list of resource definitions
 * @returns A JSON-serializable Server Card payload
 *
 * @example
 * ```typescript
 * const card = compileServerCard(
 *     { name: 'billing-api', version: '1.0.0', transport: 'http' },
 *     registry.getBuilders(),
 * );
 * // Serve at /.well-known/mcp/server-card.json
 * ```
 */
export function compileServerCard(
    config: ServerCardConfig,
    builders: Iterable<ServerCardBuilderLike>,
    prompts?: Iterable<PromptEntryLike>,
    resources?: Iterable<ResourceEntryLike>,
): ServerCardPayload {
    // ── Tools ─────────────────────────────────────────────
    const tools: ServerCardToolEntry[] = [];
    for (const builder of builders) {
        const def = builder.buildToolDefinition() as { description?: string } | undefined;
        tools.push({
            name: builder.getName(),
            description: def?.description,
            tags: builder.getTags ? builder.getTags() : [],
        });
    }

    // ── Prompts ──────────────────────────────────────────
    const promptEntries: Array<{ name: string; description?: string }> = [];
    if (prompts) {
        for (const p of prompts) {
            promptEntries.push({ name: p.name, ...(p.description ? { description: p.description } : {}) });
        }
    }

    // ── Resources ────────────────────────────────────────
    const resourceEntries: Array<{ uri: string; name: string; description?: string; mimeType?: string }> = [];
    if (resources) {
        for (const r of resources) {
            resourceEntries.push({
                uri: r.uri,
                name: r.name,
                ...(r.description ? { description: r.description } : {}),
                ...(r.mimeType ? { mimeType: r.mimeType } : {}),
            });
        }
    }

    // ── Transport ────────────────────────────────────────
    const transport = config.transport === 'stdio'
        ? { type: 'stdio' as const }
        : {
              type: 'streamable-http' as const,
              endpoint: config.endpoint ?? '/mcp',
          };

    // ── Capabilities ─────────────────────────────────────
    const capabilities: ServerCardPayload['capabilities'] = {};
    if (tools.length > 0) capabilities.tools = {};
    if (promptEntries.length > 0) capabilities.prompts = {};
    if (resourceEntries.length > 0) capabilities.resources = {};

    // ── Payload ──────────────────────────────────────────
    const payload: ServerCardPayload = {
        $schema: DEFAULT_SCHEMA,
        version: DEFAULT_CARD_VERSION,
        protocolVersion: config.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        serverInfo: {
            name: config.name,
            version: config.version ?? '1.0.0',
            ...(config.title ? { title: config.title } : {}),
        },
        ...(config.description ? { description: config.description } : {}),
        ...(config.iconUrl ? { iconUrl: config.iconUrl } : {}),
        ...(config.documentationUrl ? { documentationUrl: config.documentationUrl } : {}),
        transport,
        capabilities,
        ...(tools.length > 0 ? { tools } : {}),
        ...(promptEntries.length > 0 ? { prompts: promptEntries } : {}),
        ...(resourceEntries.length > 0 ? { resources: resourceEntries } : {}),
    };

    return payload;
}
