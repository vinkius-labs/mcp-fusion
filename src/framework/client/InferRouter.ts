/**
 * InferRouter — Compile-Time Router Type Extraction
 *
 * Extracts a fully typed `RouterMap` from a `TypedToolRegistry` or
 * an array of `GroupedToolBuilder` instances. This is the key piece
 * that makes the FusionClient tRPC-style experience real.
 *
 * **Zero runtime cost** — this module contains only type declarations.
 *
 * @example
 * ```typescript
 * // ── SERVER SIDE ──
 * const registry = createTypedRegistry<AppContext>()(
 *     projectsTool,  // GroupedToolBuilder<AppContext, ..., 'projects', { 'projects.list': ..., ... }>
 *     billingTool,
 * );
 * export type AppRouter = InferRouter<typeof registry>;
 *
 * // ── CLIENT SIDE ──
 * import type { AppRouter } from './server';
 * const client = createFusionClient<AppRouter>(transport);
 * await client.execute('projects.list', { workspace_id: 'ws_1' });
 * //                    ^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^^
 * //                    autocomplete!     typed args!
 * ```
 *
 * @module
 */
import { type GroupedToolBuilder } from '../builder/GroupedToolBuilder.js';

// ============================================================================
// TypedToolRegistry — Type-Preserving Registry
// ============================================================================

/**
 * A typed wrapper around `ToolRegistry` that preserves builder types
 * for compile-time router inference.
 *
 * Created by {@link createTypedRegistry}. The registry itself stores
 * builders at runtime via a standard `ToolRegistry`, but the `_builders`
 * tuple type is preserved for `InferRouter` extraction.
 *
 * @typeParam TContext - Application context type
 * @typeParam TBuilders - Tuple of registered builder types
 */
export interface TypedToolRegistry<TContext, TBuilders extends readonly unknown[]> {
    /** The underlying ToolRegistry instance (for runtime use) */
    readonly registry: import('../registry/ToolRegistry.js').ToolRegistry<TContext>;
    /** Branded field for type inference — never accessed at runtime */
    readonly _builders: TBuilders;
    /** Branded phantom type for context inference */
    readonly _context: TContext;
}

// ============================================================================
// InferRouter — The Main Type Utility
// ============================================================================

/**
 * Infer a `RouterMap` from a `TypedToolRegistry`.
 *
 * Extracts the accumulated `TRouterMap` from each builder registered
 * in the typed registry, producing a flat intersection of all
 * `{ 'toolName.actionName': ArgsType }` entries.
 *
 * @typeParam T - A `TypedToolRegistry` instance type
 *
 * @example
 * ```typescript
 * const projects = createTool<Ctx>('projects')
 *     .action({ name: 'list', schema: z.object({ status: z.string() }), handler: ... })
 *     .action({ name: 'create', schema: z.object({ name: z.string() }), handler: ... });
 *
 * const registry = createTypedRegistry<Ctx>()(projects);
 * type AppRouter = InferRouter<typeof registry>;
 * // Result: {
 * //   'projects.list': { status: string };
 * //   'projects.create': { name: string };
 * // }
 * ```
 */
export type InferRouter<T> =
    T extends TypedToolRegistry<infer _TCtx, infer TBuilders>
        ? InferRouterFromBuilders<TBuilders>
        : T extends readonly unknown[]
            ? InferRouterFromBuilders<T>
            : Record<string, Record<string, unknown>>;

/**
 * Infer router entries from a tuple of builders.
 *
 * Recursively intersects the `TRouterMap` from each builder in the tuple.
 *
 * @internal
 */
type InferRouterFromBuilders<T> =
    T extends readonly [infer First, ...infer Rest]
        ? ExtractRouterMap<First> & InferRouterFromBuilders<Rest>
        : T extends readonly []
            ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
              {}
            : Record<string, Record<string, unknown>>;

/**
 * Extract the accumulated `TRouterMap` from a single `GroupedToolBuilder`.
 *
 * The 4th generic parameter of `GroupedToolBuilder<TCtx, TCommon, TName, TRouterMap>`
 * carries the compile-time action map. This type extracts it.
 *
 * @internal
 */
type ExtractRouterMap<T> =
    T extends GroupedToolBuilder<infer _TCtx, infer _TCommon, infer _TName, infer TRouterMap>
        ? TRouterMap
        : Record<string, Record<string, unknown>>;
