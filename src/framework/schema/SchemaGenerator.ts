/**
 * SchemaGenerator — JSON Schema Input Schema Strategy
 *
 * Generates MCP-compatible inputSchema from Zod definitions:
 * - Discriminator enum from action keys
 * - Common + per-action schema merging
 * - Per-field annotations (required-for / optional-for)
 *
 * Pure-function module: no state, no side effects.
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type InternalAction } from '../types.js';
import { assertFieldCompatibility } from './SchemaUtils.js';

/** Shape of an object-level JSON Schema emitted by zod-to-json-schema */
interface JsonSchemaObject {
    properties?: Record<string, object>;
    required?: string[];
}

// ── Public API ───────────────────────────────────────────

export function generateInputSchema<TContext>(
    actions: readonly InternalAction<TContext>[],
    discriminator: string,
    hasGroup: boolean,
    commonSchema: ZodObject<ZodRawShape> | undefined,
): McpTool['inputSchema'] {
    const actionKeys = actions.map(a => a.key);
    const properties: Record<string, object> = {};
    const topLevelRequired: string[] = [discriminator];

    // Discriminator field with enum
    properties[discriminator] = {
        type: 'string',
        enum: actionKeys,
        description: hasGroup
            ? `Module and operation (module.${discriminator} format)`
            : 'Which operation to perform',
    };

    // Track field → action keys mapping for annotations
    const fieldActions = new Map<string, { keys: string[]; requiredIn: string[] }>();

    // Common schema fields
    const commonRequiredFields = new Set<string>();
    if (commonSchema) {
        const jsonSchema = zodToJsonSchema(commonSchema, { target: 'jsonSchema7' }) as JsonSchemaObject;
        const schemaProps = jsonSchema.properties ?? {};
        const schemaRequired = jsonSchema.required ?? [];

        for (const field of schemaRequired) {
            commonRequiredFields.add(field);
            topLevelRequired.push(field);
        }

        for (const [key, value] of Object.entries(schemaProps)) {
            properties[key] = value;
            fieldActions.set(key, {
                keys: [...actionKeys],
                requiredIn: commonRequiredFields.has(key) ? [...actionKeys] : [],
            });
        }
    }

    // Per-action schema fields
    for (const action of actions) {
        if (!action.schema) continue;

        const jsonSchema = zodToJsonSchema(action.schema, { target: 'jsonSchema7' }) as JsonSchemaObject;
        const schemaProps = jsonSchema.properties ?? {};
        const schemaRequired = jsonSchema.required ?? [];
        const requiredSet = new Set(schemaRequired);

        for (const [key, value] of Object.entries(schemaProps)) {
            const existing = properties[key];
            if (!existing) {
                // First declaration defines the canonical type
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

    // Apply per-field annotations
    for (const [key, tracking] of fieldActions.entries()) {
        if (commonRequiredFields.has(key)) {
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

    return {
        type: 'object' as const,
        properties,
        required: topLevelRequired,
    };
}

// ── Internal helpers ─────────────────────────────────────

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
