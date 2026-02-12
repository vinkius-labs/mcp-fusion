/**
 * SchemaUtils — Shared Schema Inspection Utilities
 *
 * Extracted helpers for inspecting Zod schema metadata,
 * used by DescriptionGenerator and ToonDescriptionGenerator.
 *
 * Pure-function module: no state, no side effects.
 */
import { z } from 'zod';
import type { InternalAction } from './Types.js';

/**
 * Get the list of required field names from an action's Zod schema.
 * Returns an empty array if the action has no schema.
 */
export function getActionRequiredFields<TContext>(action: InternalAction<TContext>): string[] {
    if (!action.schema) return [];
    const shape = action.schema.shape;
    const required: string[] = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
        if (!((fieldSchema as z.ZodTypeAny).isOptional())) {
            required.push(key);
        }
    }
    return required;
}
