/**
 * DescriptionGenerator — LLM-friendly Tool Description Strategy
 *
 * Generates 3-layer descriptions from action metadata:
 * - Layer 1: Tool summary + module/action listing
 * - Layer 2: Workflow section with required params and destructive warnings
 *
 * Pure-function module: no state, no side effects.
 */
import type { InternalAction } from './Types.js';
import { getActionRequiredFields } from './SchemaUtils.js';

// ── Public API ───────────────────────────────────────────

export function generateDescription<TContext>(
    actions: readonly InternalAction<TContext>[],
    name: string,
    description: string | undefined,
    hasGroup: boolean,
): string {
    const lines: string[] = [];

    // Layer 1: Tool description + action/module summary
    if (hasGroup) {
        const groups = getGroupSummaries(actions);
        const moduleList = groups
            .map(g => `${g.name} (${g.actions.join(',')})`)
            .join(' | ');
        lines.push(
            `${description || name}. ` +
            `Modules: ${moduleList}`
        );
    } else {
        const actionNames = actions.map(a => a.key);
        lines.push(
            `${description || name}. ` +
            `Actions: ${actionNames.join(', ')}`
        );
    }

    // Layer 2: Workflow section
    const workflowLines = generateWorkflowLines(actions);
    if (workflowLines.length > 0) {
        lines.push('');
        lines.push('Workflow:');
        lines.push(...workflowLines);
    }

    return lines.join('\n');
}

// ── Internal helpers ─────────────────────────────────────

function generateWorkflowLines<TContext>(
    actions: readonly InternalAction<TContext>[],
): string[] {
    const lines: string[] = [];
    for (const action of actions) {
        const requiredFields = getActionRequiredFields(action);
        const isDestructive = action.destructive === true;

        if (!action.description && requiredFields.length === 0 && !isDestructive) {
            continue;
        }

        let line = `- '${action.key}': `;
        if (action.description) {
            line += action.description;
        }
        if (requiredFields.length > 0) {
            line += action.description ? '. Requires: ' : 'Requires: ';
            line += requiredFields.join(', ');
        }
        if (isDestructive) {
            line += ' ⚠️ DESTRUCTIVE';
        }
        lines.push(line);
    }
    return lines;
}

function getGroupSummaries<TContext>(
    actions: readonly InternalAction<TContext>[],
): Array<{ name: string; description: string; actions: string[] }> {
    const groups = new Map<string, { description: string; actions: string[] }>();
    for (const action of actions) {
        if (!action.groupName) continue;
        let group = groups.get(action.groupName);
        if (!group) {
            group = { description: action.groupDescription || '', actions: [] };
            groups.set(action.groupName, group);
        }
        group.actions.push(action.actionName);
    }
    return Array.from(groups.entries()).map(([name, data]) => ({
        name,
        description: data.description,
        actions: data.actions,
    }));
}
