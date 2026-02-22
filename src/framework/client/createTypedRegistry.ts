/**
 * createTypedRegistry — Type-Preserving Registry Factory
 *
 * Creates a `ToolRegistry` that preserves the builder types at compile time,
 * enabling `InferRouter<typeof registry>` to extract a fully typed router map.
 *
 * Uses the **curried factory pattern** (like tRPC's `initTRPC.create()`)
 * to separate the context type parameter from the builder tuple inference.
 *
 * @example
 * ```typescript
 * import { createTypedRegistry, createTool, success } from '@vinkius-core/mcp-fusion';
 *
 * interface AppContext { db: Database; user: User }
 *
 * const projects = createTool<AppContext>('projects')
 *     .action({ name: 'list', handler: async (ctx) => success([]) })
 *     .action({ name: 'create', schema: z.object({ name: z.string() }),
 *               handler: async (ctx, args) => success(args.name) });
 *
 * const billing = createTool<AppContext>('billing')
 *     .action({ name: 'refund', handler: async (ctx) => success('ok') });
 *
 * // Curried: first call sets context, second registers builders
 * const registry = createTypedRegistry<AppContext>()(projects, billing);
 *
 * // Runtime: use registry.registry for server attachment
 * registry.registry.attachToServer(server, { contextFactory });
 *
 * // Types: export for client-side inference
 * export type AppRouter = InferRouter<typeof registry>;
 * ```
 *
 * @typeParam TContext - Application context type
 * @returns A curried function that accepts builders and returns a typed registry
 *
 * @module
 */
import { ToolRegistry } from '../registry/ToolRegistry.js';
import { type ToolBuilder } from '../types.js';
import { type TypedToolRegistry } from './InferRouter.js';

/**
 * Create a type-preserving tool registry.
 *
 * Uses currying to separate the `TContext` generic (explicitly provided)
 * from the builder tuple types (automatically inferred).
 *
 * @typeParam TContext - Application context type (must be specified explicitly)
 * @returns A function that accepts builders and creates the typed registry
 *
 * @example
 * ```typescript
 * // Step 1: Set the context type
 * const createRegistry = createTypedRegistry<AppContext>();
 *
 * // Step 2: Register builders (types are inferred)
 * const registry = createRegistry(projectsTool, billingTool);
 *
 * // Or as a one-liner:
 * const registry = createTypedRegistry<AppContext>()(projectsTool, billingTool);
 * ```
 */
export function createTypedRegistry<TContext>() {
    return function <TBuilders extends ToolBuilder<TContext>[]>(
        ...builders: TBuilders
    ): TypedToolRegistry<TContext, TBuilders> {
        const registry = new ToolRegistry<TContext>();
        registry.registerAll(...builders);
        return {
            registry,
            _builders: builders,
            _context: undefined as unknown as TContext,
        };
    };
}
