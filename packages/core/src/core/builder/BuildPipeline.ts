/**
 * BuildPipeline — Compiles FluentToolBuilder state into a GroupedToolBuilder.
 *
 * Extracts the `_build()` pipeline from FluentToolBuilder into a
 * standalone function for SRP compliance. Handles:
 * - Name parsing (`domain.action`)
 * - Description compilation (instructions + sandbox prompting)
 * - Semantic defaults resolution
 * - Handler wrapping (implicit `success()`)
 * - GroupedToolBuilder assembly + middleware propagation
 *
 * @module
 */

import { type ZodObject, type ZodRawShape, type ZodType } from 'zod';
import { z } from 'zod';
import { GroupedToolBuilder } from './GroupedToolBuilder.js';
import { type ToolResponse, type MiddlewareFn } from '../types.js';
import { success, TOOL_RESPONSE_BRAND } from '../response.js';
import { type Presenter } from '../../presenter/Presenter.js';
import { type ConcurrencyConfig } from '../execution/ConcurrencyGuard.js';
import { type SandboxConfig } from '../../sandbox/SandboxEngine.js';
import { SANDBOX_SYSTEM_INSTRUCTION } from '../../sandbox/index.js';
import { type SemanticDefaults } from './SemanticDefaults.js';

/**
 * Configuration object assembled from FluentToolBuilder state.
 * Passed to `buildToolFromFluent()` to produce a `GroupedToolBuilder`.
 */
export interface FluentBuildConfig<TContext, TCtx> {
    name: string;
    description: string | undefined;
    instructions: string | undefined;
    withParams: Record<string, ZodType>;
    inputSchema?: ZodObject<ZodRawShape>;
    tags: string[];
    middlewares: MiddlewareFn<TContext>[];
    returns: Presenter<unknown> | undefined;
    semanticDefaults: SemanticDefaults;
    readOnly: boolean | undefined;
    destructive: boolean | undefined;
    idempotent: boolean | undefined;
    toonMode: boolean;
    annotations: Record<string, unknown> | undefined;
    invalidatesPatterns: string[];
    cacheControl: 'no-store' | 'immutable' | undefined;
    concurrency: ConcurrencyConfig | undefined;
    egressMaxBytes: number | undefined;
    sandboxConfig: SandboxConfig | undefined;
    fsmStates: string[] | undefined;
    fsmTransition: string | undefined;
    handler: (
        input: Record<string, unknown>,
        ctx: TCtx,
    ) => Promise<ToolResponse | unknown>;
}

/**
 * Compile FluentToolBuilder state into a GroupedToolBuilder.
 *
 * @param config - Assembled configuration from builder state
 * @returns A `GroupedToolBuilder` ready for registration
 */
export function buildToolFromFluent<TContext, TCtx>(
    config: FluentBuildConfig<TContext, TCtx>,
): GroupedToolBuilder<TContext> {
    // Build accumulated with* params into ZodObject
    let inputSchema: ZodObject<ZodRawShape> | undefined;
    if (Object.keys(config.withParams).length > 0) {
        inputSchema = z.object(config.withParams as ZodRawShape);
    }

    // Parse name: 'domain.action' → tool='domain', action='action'
    const dotIndex = config.name.indexOf('.');
    // Bug #109 fix: reject multi-dot names early with a clear error.
    if (dotIndex > 0 && config.name.indexOf('.', dotIndex + 1) !== -1) {
        throw new Error(
            `Tool name '${config.name}' has too many dot-separated segments. ` +
            `Only one dot is allowed (e.g. 'group.action'). Use f.router() for nested prefixes.`,
        );
    }
    const toolName = dotIndex > 0 ? config.name.slice(0, dotIndex) : config.name;
    const actionName = dotIndex > 0 ? config.name.slice(dotIndex + 1) : 'default';

    // Compile description: instructions + description
    const descParts: string[] = [];
    if (config.instructions) {
        descParts.push(`[INSTRUCTIONS] ${config.instructions}`);
    }
    if (config.description) {
        descParts.push(config.description);
    }
    // HATEOAS Auto-Prompting: teach the LLM about sandbox capability
    if (config.sandboxConfig) {
        descParts.push(SANDBOX_SYSTEM_INSTRUCTION.trim());
    }
    const compiledDescription = descParts.length > 0 ? descParts.join('\n\n') : undefined;

    // Resolve semantic defaults + overrides
    const readOnly = config.readOnly ?? config.semanticDefaults.readOnly;
    const destructive = config.destructive ?? config.semanticDefaults.destructive;
    const idempotent = config.idempotent ?? config.semanticDefaults.idempotent;

    // Wrap handler: (input, ctx) → (ctx, args)
    const resolvedHandler = config.handler;
    const wrappedHandler = async (ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> => {
        const result = await resolvedHandler(args as never, ctx as never);

        // Guard: void/null handlers → safe fallback (Bug #41)
        if (result === undefined || result === null) {
            return success('OK');
        }

        // Auto-wrap non-ToolResponse results (implicit success).
        // Detection is based solely on the brand symbol stamped by the response helpers
        // (success(), error(), toolError(), required(), toonSuccess()).
        //
        // The previous shape-based heuristic (checking 'content', 'isError', etc.) was
        // removed because domain objects that coincidentally match the ToolResponse shape
        // would be returned as-is instead of being serialized — a silent data loss bug.
        // Always use the framework helpers; never construct ToolResponse manually.
        if (typeof result === 'object' && result !== null) {
            // Brand check — reliable, no false positives (Bug #127)
            if (TOOL_RESPONSE_BRAND in result) {
                return result as unknown as ToolResponse;
            }
        }

        // Implicit success() — the dev just returns raw data!
        return success(result as string | object);
    };

    // Build via GroupedToolBuilder for consistency with existing pipeline
    const builder = new GroupedToolBuilder<TContext>(toolName);

    if (compiledDescription) builder.description(compiledDescription);
    if (config.tags.length > 0) builder.tags(...config.tags);
    if (config.toonMode) builder.toonDescription();
    if (config.annotations) builder.annotations(config.annotations);

    // Propagate state sync hints
    if (config.invalidatesPatterns.length > 0) {
        builder.invalidates(...config.invalidatesPatterns);
    }
    if (config.cacheControl) {
        if (config.cacheControl === 'immutable') { builder.cached(); } else { builder.stale(); }
    }

    // Propagate runtime guards
    if (config.concurrency) {
        builder.concurrency(config.concurrency);
    }
    if (config.egressMaxBytes !== undefined) {
        builder.maxPayloadBytes(config.egressMaxBytes);
    }

    // Propagate sandbox config
    if (config.sandboxConfig) {
        builder.sandbox(config.sandboxConfig);
    }

    // Propagate FSM state gate
    if (config.fsmStates) {
        builder.bindState(config.fsmStates, config.fsmTransition);
    }

    // Apply middleware
    for (const mw of config.middlewares) {
        builder.use(mw);
    }

    // Register the single action
    builder.action({
        name: actionName,
        handler: wrappedHandler,
        ...(inputSchema ? { schema: inputSchema } : {}),
        ...(readOnly !== undefined ? { readOnly } : {}),
        ...(destructive !== undefined ? { destructive } : {}),
        ...(idempotent !== undefined ? { idempotent } : {}),
        ...(config.returns ? { returns: config.returns } : {}),
    });

    return builder;
}
