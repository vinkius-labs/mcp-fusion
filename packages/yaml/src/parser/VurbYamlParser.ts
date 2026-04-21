/**
 * VurbYamlParser — YAML String → Typed Spec
 *
 * The core parser for `vurb.yaml` manifests. Converts a raw YAML
 * string into a validated {@link VurbYamlSpec} object.
 *
 * @example
 * ```typescript
 * import { parseVurbYaml } from '@vurb/yaml';
 *
 * const spec = parseVurbYaml(fs.readFileSync('vurb.yaml', 'utf-8'));
 * console.log(spec.server.name);     // "my-server"
 * console.log(spec.tools?.length);   // 5
 * ```
 *
 * @module
 */
import { parse as parseYaml } from 'yaml';
import type { VurbYamlSpec } from '../schema/VurbYamlSpec.js';
import { validateYamlSchema } from './SchemaValidator.js';
import { validateCrossRefs } from './CrossRefValidator.js';

/** Parsing error with structured details. */
export class VurbYamlError extends Error {
    constructor(
        message: string,
        public readonly path?: string,
        public readonly details?: readonly string[],
    ) {
        super(message);
        this.name = 'VurbYamlError';
    }
}

/**
 * Parse a raw YAML string into a validated {@link VurbYamlSpec}.
 *
 * @param yamlString - The raw `vurb.yaml` content
 * @returns Typed and validated spec
 * @throws {@link VurbYamlError} on parse or validation errors
 */
export function parseVurbYaml(yamlString: string): VurbYamlSpec {
    // ── 1. Parse YAML text → raw object ─────────────────
    let raw: unknown;
    try {
        raw = parseYaml(yamlString);
    } catch (err) {
        throw new VurbYamlError(
            `YAML syntax error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    if (raw === null || raw === undefined || typeof raw !== 'object') {
        throw new VurbYamlError('vurb.yaml must be a YAML object (not null, array, or scalar)');
    }

    // ── 2. Schema validation → typed spec ───────────────
    const spec = validateYamlSchema(raw as Record<string, unknown>);

    // ── 3. Cross-reference validation ───────────────────
    validateCrossRefs(spec);

    return spec;
}
