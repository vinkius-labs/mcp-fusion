/**
 * SchemaGenerator — JSON Schema Input Schema Strategy
 *
 * Generates MCP-compatible inputSchema from Zod definitions:
 * - Discriminator enum from action keys
 * - Common + per-action schema merging (with omitCommon support)
 * - Per-field annotations (required-for / optional-for)
 *
 * Pure-function module: no state, no side effects.
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type InternalAction } from '../types.js';
import { assertFieldCompatibility } from './SchemaUtils.js';
import { isPresenter } from '../../presenter/Presenter.js';

/** Shape of an object-level JSON Schema emitted by zod-to-json-schema */
interface JsonSchemaObject {
    properties?: Record<string, object>;
    required?: string[];
}

/** Tracks which actions use a field and where it's required */
interface FieldTracking {
    keys: string[];
    requiredIn: string[];
}

// ── Public API ───────────────────────────────────────────

export function generateInputSchema<TContext>(
    actions: readonly InternalAction<TContext>[],
    discriminator: string,
    hasGroup: boolean,
    commonSchema: ZodObject<ZodRawShape> | undefined,
    selectEnabled = false,
): McpTool['inputSchema'] {
    const actionKeys = actions.map(a => a.key);
    const properties: Record<string, object> = {};
    const topLevelRequired: string[] = [discriminator];
    const fieldActions = new Map<string, FieldTracking>();

    addDiscriminatorProperty(properties, discriminator, actionKeys, hasGroup);

    const omitSets = buildOmitSets(actions);
    const commonRequiredFields = collectCommonFields(
        commonSchema, actionKeys, omitSets, properties, topLevelRequired, fieldActions,
    );
    collectActionFields(actions, properties, fieldActions);
    applyAnnotations(fieldActions, commonRequiredFields, actionKeys, properties);

    // ── _select Reflection (opt-in) ──────────────────────
    if (selectEnabled) {
        injectSelectProperty(actions, properties);
    }

    return {
        type: 'object' as const,
        properties,
        required: topLevelRequired,
    };
}

// ── Internal Steps ───────────────────────────────────────

/** Step 1: Add the discriminator enum property */
function addDiscriminatorProperty(
    properties: Record<string, object>,
    discriminator: string,
    actionKeys: string[],
    hasGroup: boolean,
): void {
    properties[discriminator] = {
        type: 'string',
        enum: actionKeys,
        description: hasGroup
            ? `Module and operation (module.${discriminator} format)`
            : 'Which operation to perform',
    };
}

/** Build per-action omit sets for O(1) field exclusion checks */
function buildOmitSets<TContext>(
    actions: readonly InternalAction<TContext>[],
): Map<string, Set<string>> {
    const sets = new Map<string, Set<string>>();
    for (const action of actions) {
        if ((action.omitCommonFields?.length ?? 0) > 0) {
             
            sets.set(action.key, new Set(action.omitCommonFields!));
        }
    }
    return sets;
}

/**
 * Step 2: Process commonSchema fields.
 *
 * Omitted fields are excluded from per-action tracking.
 * Fields required by ALL actions go to topLevelRequired.
 *
 * @returns The set of common required field names (for annotation logic)
 */
function collectCommonFields(
    commonSchema: ZodObject<ZodRawShape> | undefined,
    actionKeys: string[],
    omitSets: Map<string, Set<string>>,
    properties: Record<string, object>,
    topLevelRequired: string[],
    fieldActions: Map<string, FieldTracking>,
): Set<string> {
    const commonRequiredFields = new Set<string>();
    if (!commonSchema) return commonRequiredFields;

    const jsonSchema = zodToJsonSchema(commonSchema, { target: 'jsonSchema7' }) as JsonSchemaObject;
    const schemaProps = jsonSchema.properties ?? {};
    const schemaRequired = jsonSchema.required ?? [];

    for (const field of schemaRequired) {
        commonRequiredFields.add(field);
    }

    for (const [key, value] of Object.entries(schemaProps)) {
        const actionsUsingField = actionKeys.filter(ak => {
            const omitSet = omitSets.get(ak);
            return !omitSet || !omitSet.has(key);
        });

        // If no action uses the field, skip it entirely
        if (actionsUsingField.length === 0) continue;

        properties[key] = value;

        // Only add to topLevelRequired if ALL actions use this field
        if (commonRequiredFields.has(key) && actionsUsingField.length === actionKeys.length) {
            topLevelRequired.push(key);
        }

        fieldActions.set(key, {
            keys: [...actionsUsingField],
            requiredIn: commonRequiredFields.has(key) ? [...actionsUsingField] : [],
        });
    }

    return commonRequiredFields;
}

/** Step 3: Collect per-action schema fields with compatibility checks */
function collectActionFields<TContext>(
    actions: readonly InternalAction<TContext>[],
    properties: Record<string, object>,
    fieldActions: Map<string, FieldTracking>,
): void {
    for (const action of actions) {
        if (!action.schema) continue;

        const jsonSchema = zodToJsonSchema(action.schema, { target: 'jsonSchema7' }) as JsonSchemaObject;
        const schemaProps = jsonSchema.properties ?? {};
        const schemaRequired = jsonSchema.required ?? [];
        const requiredSet = new Set(schemaRequired);

        for (const [key, value] of Object.entries(schemaProps)) {
            const existing = properties[key];
            if (!existing) {
                properties[key] = value;
            } else {
                assertFieldCompatibility(existing, value, key, action.key);
            }

            let tracking = fieldActions.get(key);
            if (!tracking) {
                tracking = { keys: [], requiredIn: [] };
                fieldActions.set(key, tracking);
            }
            tracking.keys.push(action.key);
            if (requiredSet.has(key)) {
                tracking.requiredIn.push(action.key);
            }
        }
    }
}

/** Step 4: Apply per-field annotations based on tracking data */
function applyAnnotations(
    fieldActions: Map<string, FieldTracking>,
    commonRequiredFields: Set<string>,
    actionKeys: string[],
    properties: Record<string, object>,
): void {
    for (const [key, tracking] of fieldActions.entries()) {
        if (commonRequiredFields.has(key) && tracking.keys.length === actionKeys.length) {
            annotateField(properties, key, '(always required)');
        } else if (tracking.requiredIn.length > 0 && tracking.requiredIn.length === tracking.keys.length) {
            annotateField(properties, key, `Required for: ${tracking.requiredIn.join(', ')}`);
        } else if (tracking.requiredIn.length > 0) {
            const optionalIn = tracking.keys.filter(k => !tracking.requiredIn.includes(k));
            let annotation = `Required for: ${tracking.requiredIn.join(', ')}`;
            if (optionalIn.length > 0) {
                annotation += `. For: ${optionalIn.join(', ')}`;
            }
            annotateField(properties, key, annotation);
        } else {
            annotateField(properties, key, `For: ${tracking.keys.join(', ')}`);
        }
    }
}

// ── Low-level helpers ────────────────────────────────────

/** Minimal shape of a JSON Schema field that we annotate */
interface JsonSchemaField {
    description?: string;
    [key: string]: unknown;
}

function annotateField(
    properties: Record<string, object>,
    key: string,
    annotation: string,
): void {
    const field = properties[key] as JsonSchemaField | undefined;
    if (!field) return;

    const existingDesc = field.description ?? '';
    field.description = existingDesc
        ? `${existingDesc}. ${annotation}`
        : annotation;
}

// ── _select Reflection ───────────────────────────────────

/**
 * Inject `_select` property into the input schema.
 *
 * Collects the union of all top-level schema keys from Presenters
 * across all actions. If any action has a Presenter with extractable
 * keys, a `_select` optional array property is added with an enum
 * constraint of those keys.
 *
 * **Top-level only**: The enum lists root-level keys only.
 * Nested objects are returned whole when selected.
 */
function injectSelectProperty<TContext>(
    actions: readonly InternalAction<TContext>[],
    properties: Record<string, object>,
): void {
    const allKeys = new Set<string>();

    for (const action of actions) {
        if (action.returns && isPresenter(action.returns)) {
            for (const key of action.returns.getSchemaKeys()) {
                allKeys.add(key);
            }
        }
    }

    if (allKeys.size === 0) return;

    properties['_select'] = {
        type: 'array',
        description: '⚡ Context optimization: select only the response fields you need. Omit to receive all fields.',
        items: {
            type: 'string',
            enum: [...allKeys].sort(),
        },
    };
}
