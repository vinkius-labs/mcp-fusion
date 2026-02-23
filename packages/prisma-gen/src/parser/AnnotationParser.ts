/**
 * AnnotationParser — Extracts @fusion.* annotations from Prisma DMMF
 *
 * Reads the `documentation` field (/// triple-comments) from each Prisma
 * model field and extracts MCP Fusion security annotations.
 *
 * IMPORTANT: Prisma DMMF concatenates multi-line comments with \n.
 * We use `includes()` for boolean flags (not anchored regex)
 * to handle cases like "User's password.\n@fusion.hide".
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────

/** Parsed annotations for a single field */
export interface FieldAnnotation {
    /** Field is excluded from the Response Zod schema (Egress Firewall) */
    readonly hidden: boolean;
    /** LLM-facing description injected via .describe() */
    readonly description?: string;
    /** Field used for tenant isolation in WHERE clauses */
    readonly tenantKey: boolean;
}

/** Parsed annotations for an entire model */
export interface ModelAnnotations {
    /** Per-field annotation map (field name → annotations) */
    readonly fields: Map<string, FieldAnnotation>;
    /** The field name marked as @fusion.tenantKey (at most one per model) */
    readonly tenantKeyField?: string;
}

// ── Types from Prisma DMMF (minimal subset) ──────────────

/** Minimal Prisma DMMF field shape */
export interface DMMFField {
    readonly name: string;
    readonly kind: string;
    readonly type: string;
    readonly isList: boolean;
    readonly isRequired: boolean;
    readonly isId: boolean;
    readonly hasDefaultValue: boolean;
    readonly isUnique: boolean;
    readonly documentation?: string;
}

/** Minimal Prisma DMMF model shape */
export interface DMMFModel {
    readonly name: string;
    readonly fields: readonly DMMFField[];
}

// ── Constants ────────────────────────────────────────────

const FUSION_HIDE = '@fusion.hide';
const FUSION_TENANT_KEY = '@fusion.tenantKey';
const FUSION_DESCRIBE_REGEX = /@fusion\.describe\("([^"]+)"\)/;

// ── Public API ───────────────────────────────────────────

/**
 * Parse all @fusion.* annotations from a Prisma DMMF model.
 *
 * @param model - Prisma DMMF model
 * @returns Parsed annotations with field map and tenant key
 */
export function parseAnnotations(model: DMMFModel): ModelAnnotations {
    const fields = new Map<string, FieldAnnotation>();
    let tenantKeyField: string | undefined;

    for (const field of model.fields) {
        const doc = field.documentation ?? '';

        // Boolean flags — simple includes(), no anchored regex
        // Handles multi-line docs like "User's password.\n@fusion.hide"
        const hidden = doc.includes(FUSION_HIDE);
        const tenantKey = doc.includes(FUSION_TENANT_KEY);

        // String extraction — non-anchored regex
        const describeMatch = doc.match(FUSION_DESCRIBE_REGEX);
        const description = describeMatch?.[1];

        if (tenantKey) {
            tenantKeyField = field.name;
        }

        const annotation: FieldAnnotation = description !== undefined
            ? { hidden, description, tenantKey }
            : { hidden, tenantKey };
        fields.set(field.name, annotation);
    }

    const result: ModelAnnotations = tenantKeyField !== undefined
        ? { fields, tenantKeyField }
        : { fields };
    return result;
}
