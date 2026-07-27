/**
 * DescriptionGenerator — LLM-friendly Tool Description Strategy
 *
 * Generates 3-layer descriptions from action metadata:
 * - Layer 1: Tool summary + module/action listing
 * - Layer 2: Workflow section with required params and destructive warnings
 *
 * Pure-function module: no state, no side effects.
 */
import { type InternalAction } from '../types.js';
import { getActionRequiredFields } from './SchemaUtils.js';

// ── Public API ───────────────────────────────────────────

export function generateDescription<TContext>(
    actions: readonly InternalAction<TContext>[],
    name: string,
    description: string | undefined,
    hasGroup: boolean,
    discriminator = 'action',
): string {
    const lines: string[] = [];

    // Layer 1: Tool description + action/module summary + dispatch instruction
    if (hasGroup) {
        const groups = getGroupSummaries(actions);
        const moduleList = groups
            .map(g => `${g.name} (${g.actions.join(',')})`)
            .join(' | ');
        lines.push(
            `${description || name}. ` +
            `Select operation via the \`${discriminator}\` parameter. ` +
            `Modules: ${moduleList}`
        );
    } else {
        const actionNames = actions.map(a => a.key);
        lines.push(
            `${description || name}. ` +
            `Select operation via the \`${discriminator}\` parameter. ` +
            `Actions: ${actionNames.join(', ')}`
        );
    }

    // Layer 2: Workflow section.
    // Emitted for grouped tools (a grouping is inherently multi-operation) and
    // for flat tools with 2+ actions. A flat tool with a single action has
    // nothing to dispatch between, so the per-action Workflow block is
    // redundant and is omitted.
    if (hasGroup || actions.length >= 2) {
        const workflowLines = generateWorkflowLines(actions);
        if (workflowLines.length > 0) {
            lines.push('');
            lines.push('Workflow:');
            lines.push(...workflowLines);
        }
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
            line += ' [DESTRUCTIVE]';
        }
        lines.push(line);
    }
    return lines;
}

function getGroupSummaries<TContext>(
    actions: readonly InternalAction<TContext>[],
): Array<{ name: string; actions: string[] }> {
    const groups = new Map<string, string[]>();
    for (const action of actions) {
        if (!action.groupName) continue;
        let group = groups.get(action.groupName);
        if (!group) {
            group = [];
            groups.set(action.groupName, group);
        }
        group.push(action.actionName);
    }
    return Array.from(groups.entries()).map(([name, groupActions]) => ({
        name,
        actions: groupActions,
    }));
}
