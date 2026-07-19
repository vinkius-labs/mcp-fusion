/**
 * GcfDescriptionGenerator -- Token-Optimized Description Strategy
 *
 * Generates descriptions using GCF (Graph Compact Format),
 * achieving ~30-50% token reduction compared to the default markdown descriptions.
 *
 * Uses `@blackwell-systems/gcf` encodeGeneric() to serialize action metadata as
 * compact structured data inside the description string.
 *
 * Pure-function module: no state, no side effects.
 */
import { encodeGeneric } from '@blackwell-systems/gcf';
import { type InternalAction } from '../types.js';
import { getActionRequiredFields } from './SchemaUtils.js';

// ── Public API ───────────────────────────────────────────

export function generateGcfDescription<TContext>(
    actions: readonly InternalAction<TContext>[],
    name: string,
    description: string | undefined,
    hasGroup: boolean,
    discriminator = 'action',
): string {
    const lines: string[] = [];

    // Layer 1: Tool summary + dispatch instruction (always human-readable)
    lines.push(`${description || name}. Select operation via the \`${discriminator}\` parameter.`);
    lines.push('');

    // Layer 2: Action metadata in GCF format
    if (hasGroup) {
        lines.push(encodeGroupedActions(actions));
    } else {
        lines.push(encodeFlatActions(actions));
    }

    return lines.join('\n');
}

// Backward-compatible alias
export const generateToonDescription = generateGcfDescription;

// ── Internal helpers ─────────────────────────────────────

interface ActionRow {
    action: string;
    desc: string;
    required: string;
    destructive?: boolean;
}

function encodeFlatActions<TContext>(
    actions: readonly InternalAction<TContext>[],
): string {
    const rows = actions.map(a => buildActionRow(a.key, a));
    return encodeGeneric(rows);
}

function encodeGroupedActions<TContext>(
    actions: readonly InternalAction<TContext>[],
): string {
    // Group actions by their groupName
    const groups = new Map<string, InternalAction<TContext>[]>();
    for (const action of actions) {
        const key = action.groupName || '_ungrouped';
        let list = groups.get(key);
        if (!list) {
            list = [];
            groups.set(key, list);
        }
        list.push(action);
    }

    // Build a structure that GCF can encode efficiently
    const groupData: Record<string, ActionRow[]> = {};
    for (const [groupName, groupActions] of groups) {
        groupData[groupName] = groupActions.map(a =>
            buildActionRow(a.actionName, a),
        );
    }

    return encodeGeneric(groupData);
}

function buildActionRow<TContext>(
    key: string,
    action: InternalAction<TContext>,
): ActionRow {
    const required = getActionRequiredFields(action);
    const row: ActionRow = {
        action: key,
        desc: action.description || '',
        required: required.join(','),
    };

    if (action.destructive) {
        row.destructive = true;
    }

    return row;
}
