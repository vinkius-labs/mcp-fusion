/**
 * ExpositionCompiler — Topology Compiler Engine
 *
 * Pure-function transformation module responsible for projecting
 * the tool registry's abstract definitions onto the MCP protocol
 * wire format based on the configured Exposition Strategy.
 *
 * - **flat**: Deterministically expands each action into an independent
 *   atomic MCP tool with isolated schema, description, and annotations.
 *
 * - **grouped**: Passthrough — yields the grouped tool definition unmodified.
 *
 * Also emits an O(1) dispatch map for constant-time request proxying
 * during execution.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ZodObject, type ZodRawShape } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { type ToolBuilder, type InternalAction } from '../core/types.js';
import { type ToolExposition } from './types.js';

// ── Types ────────────────────────────────────────────────

/**
 * Routing entry for the O(1) dispatch map.
 *
 * Maps a flat tool name (e.g. `projects_list`) back to its
 * originating builder, the action key, and the discriminator field.
 */
export interface FlatRoute<TContext> {
    /** The originating grouped builder */
    readonly builder: ToolBuilder<TContext>;
    /** Action key to inject as discriminator value (e.g. `"list"`) */
    readonly actionKey: string;
    /** Discriminator field name (e.g. `"action"`) */
    readonly discriminator: string;
}

/**
 * Result of the exposition compilation phase.
 *
 * Contains the protocol-facing tool definitions and the routing map
 * for incoming flat tool calls.
 */
export interface ExpositionResult<TContext> {
    /** MCP Tool definitions to expose in `tools/list` */
    readonly tools: McpTool[];
    /** O(1) dispatch map: flat tool name → route info */
    readonly routingMap: Map<string, FlatRoute<TContext>>;
    /** Whether flat mode is active (controls callHandler behavior) */
    readonly isFlat: boolean;
}

// ── Compiler ─────────────────────────────────────────────

/**
 * Compile tool builders into the protocol-facing exposition format.
 *
 * @param builders - Iterable of registered tool builders
 * @param exposition - Exposition strategy ('flat' or 'grouped')
 * @param separator - Action separator for flat naming (default: '_')
 * @returns Compiled tools and routing map
 */
export function compileExposition<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
    exposition: ToolExposition = 'flat',
    separator: string = '_',
): ExpositionResult<TContext> {
    if (exposition === 'grouped') {
        return compileGrouped(builders);
    }
    return compileFlat(builders, separator);
}

// ── Flat Strategy ────────────────────────────────────────

/**
 * Flat strategy: expand each action into an independent atomic MCP tool.
 *
 * Iterates over each builder, extracts per-action metadata, and
 * synthesizes one McpTool per action with:
 * - Deterministic name: `{toolName}{separator}{actionKey}`
 * - Isolated schema (action-specific + common, no discriminator)
 * - Isolated annotations (readOnlyHint, destructiveHint, idempotentHint)
 * - Per-action description
 */
function compileFlat<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
    separator: string,
): ExpositionResult<TContext> {
    const tools: McpTool[] = [];
    const routingMap = new Map<string, FlatRoute<TContext>>();

    for (const builder of builders) {
        // Ensure the grouped definition is compiled (caches internally)
        builder.buildToolDefinition();

        // Use AST reflection interfaces to access internal structures
        const actions = getBuilderActions<TContext>(builder);
        const discriminator = getBuilderDiscriminator(builder);
        const commonSchema = getBuilderCommonSchema(builder);
        const toolName = builder.getName();

        if (!actions || actions.length === 0) {
            // Fallback: builder has no reflection — pass through as grouped
            tools.push(builder.buildToolDefinition());
            continue;
        }

        for (const action of actions) {
            const flatName = `${toolName}${separator}${action.key}`;

            // ── Schema Purification ──────────────────────────
            const inputSchema = buildAtomicSchema(action, commonSchema);

            // ── Boundary Isolation (Annotations) ─────────────
            const annotations = buildAtomicAnnotations(action);

            // ── Description ──────────────────────────────────
            const description = buildAtomicDescription(action, toolName);

            const tool: McpTool = {
                name: flatName,
                description,
                inputSchema,
            };

            if (Object.keys(annotations).length > 0) {
                Object.defineProperty(tool, 'annotations', {
                    value: annotations,
                    enumerable: true,
                });
            }

            tools.push(tool);

            // ── O(1) Dispatch Map Entry ──────────────────────
            routingMap.set(flatName, {
                builder,
                actionKey: action.key,
                discriminator,
            });
        }
    }

    return { tools, routingMap, isFlat: true };
}

// ── Grouped Strategy ─────────────────────────────────────

/**
 * Grouped strategy: passthrough — yields the grouped tool definition unmodified.
 * This preserves byte-for-byte identical protocol schema compared to pre-exposition behavior.
 */
function compileGrouped<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
): ExpositionResult<TContext> {
    const tools: McpTool[] = [];
    for (const builder of builders) {
        tools.push(builder.buildToolDefinition());
    }
    return { tools, routingMap: new Map(), isFlat: false };
}

// ── Atomic Builders (Internal) ───────────────────────────

/**
 * Build an isolated JSON Schema for a single action.
 *
 * Merges the action's specific schema with the common schema,
 * applies omitCommon fields, and strips the discriminator.
 * Result is a clean object schema without the union wrapper.
 */
function buildAtomicSchema<TContext>(
    action: InternalAction<TContext>,
    commonSchema: ZodObject<ZodRawShape> | undefined,
): McpTool['inputSchema'] {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    // ── Merge common schema fields ───────────────────────
    if (commonSchema) {
        const omitSet = action.omitCommonFields
            ? new Set(action.omitCommonFields)
            : undefined;

        const jsonSchema = zodToJsonSchema(commonSchema, { target: 'jsonSchema7' }) as {
            properties?: Record<string, object>;
            required?: string[];
        };

        for (const [key, value] of Object.entries(jsonSchema.properties ?? {})) {
            if (omitSet?.has(key)) continue;
            properties[key] = value;
        }

        for (const key of jsonSchema.required ?? []) {
            if (omitSet?.has(key)) continue;
            if (key in properties) {
                required.push(key);
            }
        }
    }

    // ── Merge action-specific schema fields ──────────────
    if (action.schema) {
        const jsonSchema = zodToJsonSchema(action.schema, { target: 'jsonSchema7' }) as {
            properties?: Record<string, object>;
            required?: string[];
        };

        for (const [key, value] of Object.entries(jsonSchema.properties ?? {})) {
            properties[key] = value;
        }

        for (const key of jsonSchema.required ?? []) {
            if (key in properties && !required.includes(key)) {
                required.push(key);
            }
        }
    }

    return {
        type: 'object' as const,
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}

/**
 * Build isolated annotations for a single action.
 *
 * Each action gets its own `readOnlyHint`, `destructiveHint`,
 * and `idempotentHint` — no privilege bleed across actions.
 */
function buildAtomicAnnotations<TContext>(
    action: InternalAction<TContext>,
): Record<string, unknown> {
    const annotations: Record<string, unknown> = {};

    if (action.readOnly === true) {
        // Action is read-only → never destructive.
        // readOnlyHint default is false, so we must explicitly signal true.
        // destructiveHint default is true (MCP assumes dangerous), so we must
        // explicitly signal false to prevent unnecessary confirmation dialogs.
        annotations['readOnlyHint'] = true;
        annotations['destructiveHint'] = false;
    } else if (action.destructive === true) {
        // Action is destructive → matches MCP's conservative default.
        // We still emit explicitly for clarity in tools/list responses.
        annotations['destructiveHint'] = true;
    } else {
        // Neither read-only nor destructive.
        // MCP spec defaults destructiveHint to true (assume dangerous).
        // We MUST emit false to override this — otherwise clients like
        // Claude Desktop or Cursor will show unnecessary safety warnings.
        annotations['destructiveHint'] = false;
    }

    if (action.idempotent === true) {
        annotations['idempotentHint'] = true;
    }

    return annotations;
}

/**
 * Build a human-readable description for a single atomic action.
 */
function buildAtomicDescription<TContext>(
    action: InternalAction<TContext>,
    toolName: string,
): string {
    const parts: string[] = [];

    if (action.description) {
        parts.push(action.description);
    } else {
        // Generate a default description from the tool and action name
        const actionLabel = action.groupName
            ? `${action.groupName}.${action.actionName}`
            : action.actionName;
        parts.push(`${toolName} → ${actionLabel}`);
    }

    // Append safety flags for LLM awareness
    if (action.destructive) {
        parts.push('[DESTRUCTIVE]');
    }
    if (action.readOnly) {
        parts.push('[READ-ONLY]');
    }

    return parts.join(' ');
}

// ── AST Reflection Helpers ───────────────────────────────

/**
 * Extract actions from a builder using optional AST reflection interface.
 * Returns undefined if the builder doesn't implement `getActions()`.
 */
function getBuilderActions<TContext>(
    builder: ToolBuilder<TContext>,
): readonly InternalAction<TContext>[] | undefined {
    return builder.getActions?.();
}

/**
 * Extract discriminator field name from a builder.
 * Defaults to 'action' if the builder doesn't implement `getDiscriminator()`.
 */
function getBuilderDiscriminator<TContext>(builder: ToolBuilder<TContext>): string {
    return builder.getDiscriminator?.() ?? 'action';
}

/**
 * Extract common schema from a builder.
 * Returns undefined if the builder doesn't implement `getCommonSchema()`.
 */
function getBuilderCommonSchema<TContext>(builder: ToolBuilder<TContext>): ZodObject<ZodRawShape> | undefined {
    return builder.getCommonSchema?.();
}

