/**
 * ZodDescriptionExtractor — Automatic Prompt Extraction from Zod .describe()
 *
 * Walks a Zod schema's AST and collects `.describe()` annotations from
 * every field. These descriptions are injected as system rules via
 * Context Tree-Shaking, eliminating the need for manual `systemRules`
 * when the Zod schema already carries domain-specific constraints.
 *
 * This ensures documentation never drifts from the actual data shape:
 * the single source of truth is the Zod `.describe()` annotation.
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   amount_cents: z.number().describe('CRITICAL: in CENTS. Divide by 100.'),
 *   status: z.enum(['paid', 'pending']).describe('Always display with emoji'),
 * });
 *
 * extractZodDescriptions(schema);
 * // → ['amount_cents: CRITICAL: in CENTS. Divide by 100.',
 * //    'status: Always display with emoji']
 * ```
 *
 * @module
 */
import { type ZodType } from 'zod';

// ── Internal AST Node Types ──────────────────────────────

/**
 * Minimal duck-typed interface for Zod schema nodes.
 * Works across Zod v3 and v4 without importing internals.
 */
interface ZodNode {
    readonly description?: string;
    readonly _def?: {
        readonly description?: string;
        readonly shape?: (() => Record<string, ZodNode>) | Record<string, ZodNode>;
        readonly innerType?: ZodNode;
        readonly type?: ZodNode;
        readonly schema?: ZodNode;
        readonly options?: readonly ZodNode[];
        readonly items?: readonly ZodNode[];
        readonly left?: ZodNode;
        readonly right?: ZodNode;
        readonly typeName?: string;
    };
}

// ── Extraction Logic ─────────────────────────────────────

/**
 * Recursively unwrap wrapper Zod nodes (optional, nullable, default, branded,
 * readonly, effects, lazy, catches, pipes) to reach the inner schema.
 * @internal
 */
function unwrap(node: ZodNode): ZodNode {
    const def = node._def;
    if (!def) return node;

    const typeName = def.typeName ?? '';
    const wrapperTypes = [
        'ZodOptional', 'ZodNullable', 'ZodDefault', 'ZodBranded',
        'ZodReadonly', 'ZodEffects', 'ZodLazy', 'ZodCatch', 'ZodPipeline',
    ];

    if (wrapperTypes.includes(typeName)) {
        const inner = def.innerType ?? def.type ?? def.schema;
        if (inner) return unwrap(inner);
    }

    return node;
}

/**
 * Get the shape record from a Zod object node.
 * Supports both v3 (`_def.shape()`) and v4 (`_def.shape`) patterns.
 * @internal
 */
function getShape(node: ZodNode): Record<string, ZodNode> | undefined {
    const def = node._def;
    if (!def) return undefined;

    if (typeof def.shape === 'function') {
        return def.shape();
    }

    if (typeof def.shape === 'object' && def.shape !== null) {
        return def.shape;
    }

    return undefined;
}

/**
 * Extract `.describe()` annotations from a Zod schema's fields.
 *
 * Walks the top-level `z.object()` shape and retrieves the description
 * string from each field (after unwrapping wrappers like `z.optional()`,
 * `z.nullable()`, `z.default()`, etc.).
 *
 * Returns an array of human-readable `"fieldName: description"` strings,
 * ready to be injected as system rules.
 *
 * @param schema - A Zod schema (typically z.object, but safely handles non-objects)
 * @returns Array of `"fieldName: description"` strings (empty if no descriptions found)
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   amount_cents: z.number().describe('CRITICAL: value is in CENTS. Divide by 100.'),
 *   currency: z.string(), // No .describe() → skipped
 *   status: z.enum(['paid', 'pending']).describe('Show with emoji'),
 * });
 *
 * extractZodDescriptions(schema);
 * // → ['amount_cents: CRITICAL: value is in CENTS. Divide by 100.',
 * //    'status: Show with emoji']
 * ```
 */
export function extractZodDescriptions(schema: ZodType): string[] {
    const node = schema as unknown as ZodNode;
    const shape = getShape(node);
    if (!shape) return [];

    const descriptions: string[] = [];

    for (const [key, fieldNode] of Object.entries(shape)) {
        const desc = resolveDescription(fieldNode);
        if (desc) {
            descriptions.push(`${key}: ${desc}`);
        }
    }

    return descriptions;
}

/**
 * Resolve the description from a field node by unwrapping wrappers.
 *
 * Priority:
 * 1. Outermost `.description` (Zod v4 style)
 * 2. `_def.description` (Zod v3 style)
 * 3. Unwrapped inner node's description
 * @internal
 */
function resolveDescription(node: ZodNode): string | undefined {
    // Check outermost description first
    if (node.description) return node.description;
    if (node._def?.description) return node._def.description;

    // Unwrap and check inner
    const inner = unwrap(node);
    if (inner !== node) {
        if (inner.description) return inner.description;
        if (inner._def?.description) return inner._def.description;
    }

    return undefined;
}
