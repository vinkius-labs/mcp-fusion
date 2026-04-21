/**
 * CrossRefValidator — Cross-Reference Validation
 *
 * Validates referential integrity across the manifest:
 * - Tools reference connections that exist
 * - Resources reference connections that exist
 * - ${SECRETS.KEY} references match declared secrets
 *
 * @internal
 * @module
 */
import type { VurbYamlSpec } from '../schema/VurbYamlSpec.js';
import { VurbYamlError } from './VurbYamlParser.js';

/** Regex to find ${SECRETS.KEY} references in any string. */
const SECRETS_REF_REGEX = /\$\{SECRETS\.([A-Z0-9_]+)\}/g;

/**
 * Recursively scan an object for ${SECRETS.KEY} references.
 * @returns Set of referenced secret key names
 */
function findSecretRefs(value: unknown, refs: Set<string> = new Set()): Set<string> {
    if (typeof value === 'string') {
        let match: RegExpExecArray | null;
        SECRETS_REF_REGEX.lastIndex = 0;
        while ((match = SECRETS_REF_REGEX.exec(value)) !== null) {
            refs.add(match[1]!);
        }
    } else if (Array.isArray(value)) {
        for (const item of value) {
            findSecretRefs(item, refs);
        }
    } else if (value !== null && typeof value === 'object') {
        for (const v of Object.values(value)) {
            findSecretRefs(v, refs);
        }
    }
    return refs;
}

/**
 * Validate cross-references in a parsed spec.
 *
 * @param spec - Validated spec from {@link validateYamlSchema}
 * @throws {@link VinkiusYamlError} when references are broken
 *
 * @internal
 */
export function validateCrossRefs(spec: VurbYamlSpec): void {
    const errors: string[] = [];

    const connectionNames = new Set(Object.keys(spec.connections ?? {}));
    const secretNames = new Set(Object.keys(spec.secrets ?? {}));

    // ── 1. Tools reference valid connections ─────────────
    for (const tool of spec.tools ?? []) {
        if (!connectionNames.has(tool.execute.connection)) {
            errors.push(
                `tool "${tool.name}" references connection "${tool.execute.connection}" which is not defined in connections`,
            );
        }
    }

    // ── 2. Resources reference valid connections ─────────
    for (const resource of spec.resources ?? []) {
        if (resource.execute.type === 'connection' && resource.execute.connection) {
            if (!connectionNames.has(resource.execute.connection)) {
                errors.push(
                    `resource "${resource.name}" references connection "${resource.execute.connection}" which is not defined in connections`,
                );
            }
        }
    }

    // ── 3. ${SECRETS.KEY} references match declarations ──
    const allRefs = findSecretRefs(spec);
    for (const ref of allRefs) {
        if (!secretNames.has(ref)) {
            errors.push(
                `\${SECRETS.${ref}} is referenced but not declared in the secrets section`,
            );
        }
    }

    // ── 4. Duplicate names ───────────────────────────────
    const toolNames = new Set<string>();
    for (const tool of spec.tools ?? []) {
        if (toolNames.has(tool.name)) {
            errors.push(`duplicate tool name: "${tool.name}"`);
        }
        toolNames.add(tool.name);
    }

    const resourceUris = new Set<string>();
    for (const resource of spec.resources ?? []) {
        if (resourceUris.has(resource.uri)) {
            errors.push(`duplicate resource URI: "${resource.uri}"`);
        }
        resourceUris.add(resource.uri);
    }

    const promptNames = new Set<string>();
    for (const prompt of spec.prompts ?? []) {
        if (promptNames.has(prompt.name)) {
            errors.push(`duplicate prompt name: "${prompt.name}"`);
        }
        promptNames.add(prompt.name);
    }

    // ── Report ───────────────────────────────────────────
    if (errors.length > 0) {
        throw new VurbYamlError(
            `vurb.yaml cross-reference errors:\n${errors.map(e => `  - ${e}`).join('\n')}`,
            undefined,
            errors,
        );
    }
}
