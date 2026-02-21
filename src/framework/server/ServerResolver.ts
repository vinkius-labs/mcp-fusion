/**
 * ServerResolver — Chain of Responsibility for MCP Server Detection
 *
 * Resolves an unknown input into a low-level McpServerLike instance
 * using a chain of type-narrowing strategies. Each step either resolves
 * the server or passes to the next resolver.
 *
 * Pure-function module: no state, no side effects.
 */


// ── Types ────────────────────────────────────────────────

/** Minimal duck-typed interface for the low-level MCP Server */
export interface McpServerLike {
    setRequestHandler: (...args: never[]) => void;
}

/** A single resolver in the chain */
type Resolver = (input: unknown) => McpServerLike | undefined;

// ── Type Guards (pure predicates) ────────────────────────

function isMcpServerLike(obj: unknown): obj is McpServerLike {
    return typeof obj === 'object' && obj !== null && 'setRequestHandler' in obj;
}

function hasServerProperty(obj: unknown): obj is { server: unknown } {
    return typeof obj === 'object' && obj !== null && 'server' in obj;
}

// ── Resolver Chain ───────────────────────────────────────

/** Resolve direct Server instance */
const directServerResolver: Resolver = (input) =>
    isMcpServerLike(input) ? input : undefined;

/** Resolve McpServer wrapper (has .server property exposing low-level Server) */
const wrappedServerResolver: Resolver = (input) =>
    hasServerProperty(input) && isMcpServerLike(input.server) ? input.server : undefined;

/** Ordered chain of resolvers — first match wins */
const resolverChain: readonly Resolver[] = [
    directServerResolver,
    wrappedServerResolver,
];

// ── Public API ───────────────────────────────────────────

/**
 * Resolve an unknown server input into a McpServerLike instance.
 *
 * Walks the resolver chain until one succeeds, or throws if none match.
 *
 * @param server - Server or McpServer instance (duck-typed)
 * @returns The resolved low-level Server
 * @throws Error if the input is not a valid server
 */
export function resolveServer(server: unknown): McpServerLike {
    if (server === null || server === undefined || typeof server !== 'object') {
        throw new Error(
            'attachToServer() requires a Server or McpServer instance.',
        );
    }

    for (const resolver of resolverChain) {
        const resolved = resolver(server);
        if (resolved !== undefined) {
            return resolved;
        }
    }

    throw new Error(
        'attachToServer() requires a Server or McpServer instance. ' +
        'The provided object does not have setRequestHandler().',
    );
}
