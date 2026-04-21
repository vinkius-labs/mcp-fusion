/**
 * ResponseTransformer — Extract & Shape API Responses
 *
 * Transforms raw API responses using dot-notation path extraction.
 * Keeps only the fields the LLM needs — reduces token waste.
 *
 * **Open-source behavior**: `extract` only (dot-path extraction)
 * **Vinkius Engine**: + `rename`, `max_items`, deep projections
 *
 * @module
 */
import type { YamlResponseTransform } from '../schema/VurbYamlSpec.js';

/**
 * Extract a value from a nested object using dot-notation.
 *
 * Supports:
 * - Simple paths: `"ticket.id"` → `obj.ticket.id`
 * - Nested: `"fields.status.name"` → `obj.fields.status.name`
 * - Array projection: `"data[].{id, name}"` → maps each element
 *
 * @param obj - Source object
 * @param path - Dot-notation path
 * @returns Extracted value or undefined
 */
export function extractPath(obj: unknown, path: string): unknown {
    if (obj === null || obj === undefined) return undefined;

    // ── Array projection: "data[].{id, name, email}" ─────
    const arrayMatch = path.match(/^(.+?)\[\]\.?\{(.+)\}$/);
    if (arrayMatch) {
        const arrayPath = arrayMatch[1]!;
        const fields = arrayMatch[2]!;
        const arr = extractPath(obj, arrayPath);
        if (!Array.isArray(arr)) return undefined;

        const fieldNames = fields.split(',').map(f => f.trim());
        return arr.map(item => {
            const projected: Record<string, unknown> = {};
            for (const field of fieldNames) {
                projected[field] = extractPath(item, field);
            }
            return projected;
        });
    }

    // ── Simple dot-notation traversal ────────────────────
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Apply a response transform to an API response.
 *
 * @param response - Raw API response object
 * @param transform - Transform definition from the YAML spec
 * @returns Transformed response — only the fields the LLM needs
 */
export function applyResponseTransform(
    response: unknown,
    transform: YamlResponseTransform | undefined,
): unknown {
    if (!transform?.extract || transform.extract.length === 0) {
        return response;
    }

    // Single extraction → return the value directly
    if (transform.extract.length === 1) {
        return extractPath(response, transform.extract[0]!);
    }

    // Multiple extractions → return an object with each path as key
    const result: Record<string, unknown> = {};
    for (const path of transform.extract) {
        // Use the last segment as the key name
        const key = path.split('.').pop() ?? path;
        result[key] = extractPath(response, path);
    }

    return result;
}
