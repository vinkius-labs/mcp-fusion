/**
 * ToonDescriptionGenerator — Token-Optimized Description Strategy
 *
 * Generates descriptions using TOON (Token-Oriented Object Notation) format,
 * achieving ~30-50% token reduction compared to the default markdown descriptions.
 *
 * Uses `@toon-format/toon` encode() to serialize action metadata as compact
 * pipe-delimited tabular data inside the description string.
 *
 * Pure-function module: no state, no side effects.
 */
import { encode } from '@toon-format/toon';
import { type InternalAction } from './Types.js';
import { getActionRequiredFields } from './SchemaUtils.js';

// ── Public API ───────────────────────────────────────────

export function generateToonDescription<TContext>(
    actions: readonly InternalAction<TContext>[],
    name: string,
    description: string | undefined,
    hasGroup: boolean,
): string {
    const lines: string[] = [];

    // Layer 1: Tool summary (always human-readable)
    lines.push(description || name);
    lines.push('');

    // Layer 2: Action metadata in TOON tabular format
    if (hasGroup) {
        lines.push(encodeGroupedActions(actions));
    } else {
        lines.push(encodeFlatActions(actions));
    }

    return lines.join('\n');
}

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
    return encode(rows, { delimiter: '|' });
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

    // Build a structure that TOON can encode efficiently
    const groupData: Record<string, ActionRow[]> = {};
    for (const [groupName, groupActions] of groups) {
        groupData[groupName] = groupActions.map(a =>
            buildActionRow(a.actionName, a),
        );
    }

    return encode(groupData, { delimiter: '|' });
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
