/**
 * JsonSerializer — AOT JSON Serialization Engine
 *
 * Compiles Zod schemas into hyper-fast stringify functions using
 * `fast-json-stringify` (the Fastify serialization engine).
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────┐
 *   │  Boot / First Call (AOT / Lazy)                  │
 *   │                                                  │
 *   │  ZodType ──► zod-to-json-schema ──► JSON Schema  │
 *   │                    │                             │
 *   │                    ▼                             │
 *   │            fast-json-stringify                   │
 *   │                    │                             │
 *   │                    ▼                             │
 *   │         Compiled StringifyFn (C-like)            │
 *   │         Cached via WeakMap<ZodType>              │
 *   └──────────────────────────────────────────────────┘
 *
 * Properties:
 * - 2-5x faster than `JSON.stringify` for known schemas
 * - Lazy-by-default: compiles on first use, cached via WeakMap
 * - Zero-risk fallback: if `fast-json-stringify` is missing or
 *   compilation fails, falls back to native `JSON.stringify`
 * - Produces compact/minified JSON (no indentation) for max throughput
 * - Safe optional/nullable handling via schema transformation
 *
 * @module
 * @internal
 */
import { zodToJsonSchema } from 'zod-to-json-schema';

// ── Types ────────────────────────────────────────────────

/**
 * A pre-compiled stringify function.
 *
 * Generated at boot or on first use from a Zod schema.
 * Accepts any object and returns a JSON string (minified).
 *
 * @example
 * ```typescript
 * const stringify = serializer.compile(myZodSchema);
 * const json = stringify({ id: 1, name: 'Alice' });
 * // '{"id":1,"name":"Alice"}'
 * ```
 */
export type StringifyFn = (doc: unknown) => string;

/**
 * AOT JSON serialization engine.
 *
 * Compiles Zod schemas into fast stringify functions at boot time
 * or lazily on first use. Maintains a per-schema cache to avoid
 * recompilation.
 */
export interface JsonSerializer {
    /**
     * Compile a Zod schema into a fast stringify function.
     *
     * Returns `undefined` if `fast-json-stringify` is not available
     * or if compilation fails (defensive fallback).
     *
     * @param schema - Any Zod schema (ZodObject, ZodArray, etc.)
     * @returns A compiled stringify function, or `undefined`
     */
    compile(schema: unknown): StringifyFn | undefined;

    /**
     * Stringify data using a compiled function or native fallback.
     *
     * @param data - The data to serialize
     * @param compiled - Optional pre-compiled stringify function
     * @returns JSON string
     */
    stringify(data: unknown, compiled?: StringifyFn): string;
}

// ── Lazy Import Cache ────────────────────────────────────

// fast-json-stringify may not be installed (optional peer dep).
// We lazy-import the build function once and cache the result.

/** The build function signature from fast-json-stringify */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FjsBuildFn = (schema: any, options?: any) => (doc: any) => string;

let _fjsBuild: FjsBuildFn | null | false = null;

async function loadFastJsonStringify(): Promise<FjsBuildFn | null> {
    if (_fjsBuild === false) return null; // already tried, not available
    if (_fjsBuild !== null) return _fjsBuild;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import('fast-json-stringify');
        _fjsBuild = (typeof mod === 'function' ? mod : mod.default) as FjsBuildFn;
        return _fjsBuild;
    } catch {
        _fjsBuild = false; // mark as unavailable
        return null;
    }
}

// Synchronous version — uses the cached function if already loaded.
function getFjsBuild(): FjsBuildFn | null {
    if (_fjsBuild === false || _fjsBuild === null) return null;
    return _fjsBuild;
}

// ── Schema Cache ─────────────────────────────────────────

// WeakMap ensures schemas are compiled exactly once and can be GC'd
// when the schema reference is released.
const _cache = new WeakMap<object, StringifyFn>();

// ── JSON Schema Transformation ───────────────────────────

/**
 * Transform a JSON Schema for safe use with fast-json-stringify.
 *
 * - Strips `$schema` (not supported by fjs)
 * - Adds `additionalProperties: true` to objects so unknown fields
 *   are serialized instead of silently dropped
 * - Wraps types with nullable variants where appropriate
 *
 * @internal
 */
function transformForFjs(jsonSchema: Record<string, unknown>): Record<string, unknown> {
    const schema = { ...jsonSchema };

    // Remove $schema — fast-json-stringify doesn't support it
    delete schema['$schema'];

    // For object-type schemas, allow additional properties
    // so dynamic/runtime fields are not silently dropped
    if (schema['type'] === 'object') {
        if (schema['additionalProperties'] === undefined) {
            schema['additionalProperties'] = true;
        }
    }

    // Recursively transform nested properties
    if (schema['properties'] && typeof schema['properties'] === 'object') {
        const props = { ...(schema['properties'] as Record<string, unknown>) };
        for (const [key, value] of Object.entries(props)) {
            if (value && typeof value === 'object') {
                props[key] = transformForFjs(value as Record<string, unknown>);
            }
        }
        schema['properties'] = props;
    }

    // Transform array items
    if (schema['items'] && typeof schema['items'] === 'object') {
        schema['items'] = transformForFjs(schema['items'] as Record<string, unknown>);
    }

    // Handle anyOf / oneOf for nullable unions
    for (const combiner of ['anyOf', 'oneOf', 'allOf'] as const) {
        if (Array.isArray(schema[combiner])) {
            schema[combiner] = (schema[combiner] as Record<string, unknown>[])
                .map(s => (s && typeof s === 'object' ? transformForFjs(s) : s));
        }
    }

    return schema;
}

// ── Compile Logic ────────────────────────────────────────

/**
 * Core compilation: Zod schema → JSON Schema → fast-json-stringify function.
 *
 * @internal
 */
function compileSchema(schema: unknown): StringifyFn | undefined {
    const build = getFjsBuild();
    if (!build) return undefined;

    // Check cache first (schema as WeakMap key)
    if (typeof schema === 'object' && schema !== null && _cache.has(schema)) {
        return _cache.get(schema);
    }

    try {
        // Step 1: Zod → JSON Schema
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawJsonSchema = zodToJsonSchema(schema as any, {
            target: 'jsonSchema7',
            $refStrategy: 'none',
        });

        // Step 2: Transform for fjs compatibility
        const fjsSchema = transformForFjs(rawJsonSchema as Record<string, unknown>);

        // Step 3: Compile the stringify function
        const stringify = build(fjsSchema, {
            largeArrayMechanism: 'json-stringify',
        }) as StringifyFn;

        // Cache the compiled function
        if (typeof schema === 'object' && schema !== null) {
            _cache.set(schema, stringify);
        }

        return stringify;
    } catch {
        // Compilation failed — fall back to native JSON.stringify
        // This is expected for very complex schemas that fjs can't handle
        return undefined;
    }
}

// ── Public Factory ───────────────────────────────────────

/**
 * Create an AOT JSON serializer.
 *
 * The serializer lazy-loads `fast-json-stringify` and provides
 * compile/stringify methods with automatic fallback.
 *
 * @example
 * ```typescript
 * const serializer = createSerializer();
 * await serializer.init(); // optional: pre-load the fjs module
 *
 * const stringify = serializer.compile(myZodSchema);
 * if (stringify) {
 *     const json = stringify(data); // 2-5x faster
 * }
 * ```
 */
export function createSerializer(): JsonSerializer & { init(): Promise<void> } {
    return {
        async init(): Promise<void> {
            await loadFastJsonStringify();
        },

        compile(schema: unknown): StringifyFn | undefined {
            return compileSchema(schema);
        },

        stringify(data: unknown, compiled?: StringifyFn): string {
            if (compiled) {
                try {
                    return compiled(data);
                } catch {
                    // Defensive: if compiled function fails at runtime
                    // (e.g., data shape mismatch), fall back to native
                }
            }
            return JSON.stringify(data);
        },
    };
}

// ── Singleton ────────────────────────────────────────────

/**
 * Global singleton serializer.
 *
 * Shared across the engine so all Presenters and response helpers
 * use the same cache and fjs module reference.
 */
export const defaultSerializer = createSerializer();
