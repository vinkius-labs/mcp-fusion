// ============================================================================
// SchemaInferrer — WebhookConfig → Zod schema for MCP Fusion tools
// ============================================================================

import { z, type ZodTypeAny } from 'zod';
import type { WebhookConfig } from './types.js';

/**
 * Infers Zod schemas from n8n webhook configurations.
 *
 * Strategy:
 * - Query parameters → strict Zod fields with type coercion
 * - Request body → `z.record(z.any())` fallback (n8n webhooks accept any JSON)
 * - Workflow notes → `.describe()` on the schema for LLM semantic understanding
 */
export function inferSchema(config: WebhookConfig): Record<string, ZodTypeAny> {
    const fields: Record<string, ZodTypeAny> = {};

    // ── Query parameters → strict Zod fields ──
    for (const param of config.queryParams) {
        const field = buildParamField(param.type, param.required);
        fields[param.name] = field;
    }

    // ── Body → open record (n8n webhooks accept arbitrary JSON) ──
    // Only add for methods that accept a body
    const method = config.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
        fields['body'] = z.record(z.any())
            .optional()
            .describe('Request body — see workflow description for expected fields');
    }

    return fields;
}

/**
 * Build a Zod field for a query parameter with correct type coercion.
 */
function buildParamField(type: string, required: boolean): ZodTypeAny {
    let field: ZodTypeAny;

    switch (type) {
        case 'number':
            field = z.coerce.number();
            break;
        case 'boolean':
            field = z.coerce.boolean();
            break;
        default:
            field = z.string();
            break;
    }

    return required ? field : field.optional();
}
