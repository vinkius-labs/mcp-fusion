/**
 * RefResolver — JSON $ref Pointer Resolution
 *
 * Resolves `$ref` pointers within an OpenAPI document in-place.
 * Handles nested references and detects circular chains to prevent
 * infinite recursion.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject { [key: string]: JsonValue | undefined; }

// ── Resolver ─────────────────────────────────────────────

/**
 * Resolve all `$ref` pointers in a parsed OpenAPI document.
 *
 * Walks the entire document tree. When a `$ref` is found, it is
 * replaced in-place with the referenced object. Circular references
 * are broken by returning the ref string as a marker.
 *
 * @param doc - The parsed OpenAPI document (mutated in-place)
 * @returns The same document with all refs resolved
 */
export function resolveRefs<T extends Record<string, unknown>>(doc: T): T {
    const resolving = new Set<string>();
    resolveNode(doc as unknown as JsonValue, doc as unknown as JsonObject, resolving);
    return doc;
}

/**
 * Lookup a JSON pointer path (e.g. `#/components/schemas/Pet`) in the doc.
 *
 * @param root - Root document
 * @param refPath - JSON pointer string starting with `#/`
 * @returns The referenced value, or `undefined` if not found
 */
function lookupRef(root: JsonObject, refPath: string): JsonValue | undefined {
    if (!refPath.startsWith('#/')) return undefined;

    const parts = refPath.slice(2).split('/');
    let current: JsonValue | undefined = root;

    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object' || Array.isArray(current)) {
            return undefined;
        }
        current = (current as JsonObject)[part];
    }

    return current;
}

/**
 * Recursively walk and resolve refs in a node.
 * @internal
 */
function resolveNode(node: JsonValue, root: JsonObject, resolving: Set<string>): JsonValue {
    if (node === null || node === undefined || typeof node !== 'object') {
        return node;
    }

    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            node[i] = resolveNode(node[i]!, root, resolving);
        }
        return node;
    }

    const obj = node as JsonObject;

    // ── Handle $ref ──
    const ref = obj['$ref'];
    if (typeof ref === 'string') {
        // Circular detection
        if (resolving.has(ref)) {
            // Break the cycle — return empty schema placeholder
            return { type: 'object', description: `[Circular: ${ref}]` } as JsonValue;
        }

        resolving.add(ref);
        const resolved = lookupRef(root, ref);

        if (resolved !== undefined && typeof resolved === 'object' && resolved !== null) {
            // Recursively resolve the target (it may contain its own $refs)
            const result = resolveNode(resolved, root, resolving);
            resolving.delete(ref);
            return result;
        }

        resolving.delete(ref);
        // Unresolvable ref — return as-is with marker
        return { type: 'string', description: `[Unresolved: ${ref}]` } as JsonValue;
    }

    // ── Walk child properties ──
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value !== undefined && typeof value === 'object' && value !== null) {
            obj[key] = resolveNode(value, root, resolving);
        }
    }

    return obj;
}
