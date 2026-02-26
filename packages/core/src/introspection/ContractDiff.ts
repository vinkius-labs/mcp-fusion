/**
 * ContractDiff — Behavioral Contract Diffing Engine
 *
 * Computes the semantic difference between two snapshots of a
 * `ToolContract`. Unlike naive JSON diffing, this engine understands
 * the behavioral semantics of each field and classifies changes by
 * severity:
 *
 * - **BREAKING**: The behavioral surface changed in a way that will
 *   cause an LLM that was previously calibrated to this tool to
 *   fail or hallucinate. Examples: egress schema fields removed,
 *   system rules changed, affordance topology altered.
 *
 * - **RISKY**: The behavioral surface changed in a way that might
 *   affect LLM behavior but won't cause immediate failure. Examples:
 *   cognitive guardrails loosened, middleware chain changed.
 *
 * - **SAFE**: The change is additive and won't affect existing
 *   LLM behavior. Examples: new action added, description improved.
 *
 * - **COSMETIC**: No behavioral impact. Examples: description
 *   rewording with identical semantics.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import type { ToolContract, ToolBehavior, ActionContract, TokenEconomicsProfile, HandlerEntitlements } from './ToolContract.js';

// ============================================================================
// Delta Types
// ============================================================================

/** Severity classification for a contract change */
export type DeltaSeverity = 'BREAKING' | 'RISKY' | 'SAFE' | 'COSMETIC';

/**
 * A single atomic change in a tool contract.
 *
 * Designed to be human-readable, machine-diffable, and injectable
 * into LLM correction prompts (Self-Healing Context).
 */
export interface ContractDelta {
    /** Which part of the contract changed */
    readonly category: DeltaCategory;
    /** Specific field or sub-path that changed */
    readonly field: string;
    /** Severity classification */
    readonly severity: DeltaSeverity;
    /** Human-readable description of the change */
    readonly description: string;
    /** Previous value (serialized) */
    readonly before: string | null;
    /** New value (serialized) */
    readonly after: string | null;
}

/**
 * Broad category of what changed in the contract.
 * Maps to the major sections of `ToolContract`.
 */
export type DeltaCategory =
    | 'surface'
    | 'surface.action'
    | 'behavior.egress'
    | 'behavior.rules'
    | 'behavior.guardrails'
    | 'behavior.middleware'
    | 'behavior.stateSync'
    | 'behavior.affordances'
    | 'tokenEconomics'
    | 'entitlements';

/**
 * Result of a full contract diff operation.
 */
export interface ContractDiffResult {
    /** Tool name */
    readonly toolName: string;
    /** All detected deltas, sorted by severity */
    readonly deltas: readonly ContractDelta[];
    /** Highest severity found */
    readonly maxSeverity: DeltaSeverity;
    /** Whether the overall behavior digest changed */
    readonly digestChanged: boolean;
    /** Whether the contract is backwards-compatible */
    readonly isBackwardsCompatible: boolean;
}

// ============================================================================
// Diff Engine
// ============================================================================

const SEVERITY_ORDER: Record<DeltaSeverity, number> = {
    BREAKING: 3,
    RISKY: 2,
    SAFE: 1,
    COSMETIC: 0,
};

/**
 * Compute the semantic diff between two snapshots of a tool contract.
 *
 * @param before - Previous contract snapshot
 * @param after  - Current contract snapshot
 * @returns Classified, sorted list of deltas
 */
export function diffContracts(
    before: ToolContract,
    after: ToolContract,
): ContractDiffResult {
    const deltas: ContractDelta[] = [];

    // Surface diff
    diffSurface(before, after, deltas);

    // Action-level diff
    diffActions(before, after, deltas);

    // Behavior diff
    diffBehavior(before.behavior, after.behavior, deltas);

    // Token Economics diff
    diffTokenEconomics(before.tokenEconomics, after.tokenEconomics, deltas);

    // Entitlements diff
    diffEntitlements(before.entitlements, after.entitlements, deltas);

    // Sort by severity (BREAKING first)
    deltas.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

    const maxSeverity = deltas.length > 0
        ? deltas[0]!.severity
        : 'COSMETIC' as DeltaSeverity;

    const digestChanged = before.behavior.egressSchemaDigest !== after.behavior.egressSchemaDigest
        || before.behavior.systemRulesFingerprint !== after.behavior.systemRulesFingerprint;

    return {
        toolName: after.surface.name,
        deltas,
        maxSeverity,
        digestChanged,
        isBackwardsCompatible: maxSeverity !== 'BREAKING',
    };
}

/**
 * Diff tool surfaces but exclude actions (handled separately).
 * @internal
 */
function diffSurface(
    before: ToolContract,
    after: ToolContract,
    out: ContractDelta[],
): void {
    if (before.surface.name !== after.surface.name) {
        out.push({
            category: 'surface',
            field: 'name',
            severity: 'BREAKING',
            description: 'Tool name changed',
            before: before.surface.name,
            after: after.surface.name,
        });
    }

    if (before.surface.description !== after.surface.description) {
        out.push({
            category: 'surface',
            field: 'description',
            severity: 'COSMETIC',
            description: 'Tool description changed',
            before: before.surface.description ?? null,
            after: after.surface.description ?? null,
        });
    }

    if (before.surface.inputSchemaDigest !== after.surface.inputSchemaDigest) {
        out.push({
            category: 'surface',
            field: 'inputSchemaDigest',
            severity: 'BREAKING',
            description: 'Input schema changed — previously calibrated LLM arguments may fail',
            before: before.surface.inputSchemaDigest,
            after: after.surface.inputSchemaDigest,
        });
    }

    // Tags
    const removedTags = before.surface.tags.filter(t => !after.surface.tags.includes(t));
    const addedTags = after.surface.tags.filter(t => !before.surface.tags.includes(t));
    if (removedTags.length > 0 || addedTags.length > 0) {
        out.push({
            category: 'surface',
            field: 'tags',
            severity: removedTags.length > 0 ? 'SAFE' : 'COSMETIC',
            description: `Tags changed: ${removedTags.length > 0 ? `removed [${removedTags.join(', ')}]` : ''} ${addedTags.length > 0 ? `added [${addedTags.join(', ')}]` : ''}`.trim(),
            before: JSON.stringify(before.surface.tags),
            after: JSON.stringify(after.surface.tags),
        });
    }
}

/**
 * Diff action-level contracts. Detects added, removed, and modified actions.
 * @internal
 */
function diffActions(
    before: ToolContract,
    after: ToolContract,
    out: ContractDelta[],
): void {
    const beforeKeys = new Set(Object.keys(before.surface.actions));
    const afterKeys = new Set(Object.keys(after.surface.actions));

    // Removed actions → BREAKING
    for (const key of beforeKeys) {
        if (!afterKeys.has(key)) {
            out.push({
                category: 'surface.action',
                field: `actions.${key}`,
                severity: 'BREAKING',
                description: `Action "${key}" was removed`,
                before: key,
                after: null,
            });
        }
    }

    // Added actions → SAFE
    for (const key of afterKeys) {
        if (!beforeKeys.has(key)) {
            out.push({
                category: 'surface.action',
                field: `actions.${key}`,
                severity: 'SAFE',
                description: `Action "${key}" was added`,
                before: null,
                after: key,
            });
        }
    }

    // Modified actions
    for (const key of beforeKeys) {
        if (afterKeys.has(key)) {
            diffSingleAction(
                key,
                before.surface.actions[key]!,
                after.surface.actions[key]!,
                out,
            );
        }
    }
}

/**
 * Diff a single action's contract fields.
 * @internal
 */
function diffSingleAction(
    actionKey: string,
    before: ActionContract,
    after: ActionContract,
    out: ContractDelta[],
): void {
    if (before.destructive !== after.destructive) {
        out.push({
            category: 'surface.action',
            field: `actions.${actionKey}.destructive`,
            severity: 'BREAKING',
            description: `Action "${actionKey}" destructive flag changed: ${before.destructive} → ${after.destructive}`,
            before: String(before.destructive),
            after: String(after.destructive),
        });
    }

    if (before.idempotent !== after.idempotent) {
        out.push({
            category: 'surface.action',
            field: `actions.${actionKey}.idempotent`,
            severity: 'RISKY',
            description: `Action "${actionKey}" idempotent flag changed`,
            before: String(before.idempotent),
            after: String(after.idempotent),
        });
    }

    if (before.readOnly !== after.readOnly) {
        out.push({
            category: 'surface.action',
            field: `actions.${actionKey}.readOnly`,
            severity: 'BREAKING',
            description: `Action "${actionKey}" readOnly flag changed: ${before.readOnly} → ${after.readOnly}`,
            before: String(before.readOnly),
            after: String(after.readOnly),
        });
    }

    // Required fields
    const removedFields = before.requiredFields.filter(f => !after.requiredFields.includes(f));
    const addedFields = after.requiredFields.filter(f => !before.requiredFields.includes(f));
    if (removedFields.length > 0) {
        out.push({
            category: 'surface.action',
            field: `actions.${actionKey}.requiredFields`,
            severity: 'SAFE',
            description: `Action "${actionKey}" no longer requires: [${removedFields.join(', ')}]`,
            before: JSON.stringify(before.requiredFields),
            after: JSON.stringify(after.requiredFields),
        });
    }
    if (addedFields.length > 0) {
        out.push({
            category: 'surface.action',
            field: `actions.${actionKey}.requiredFields`,
            severity: 'BREAKING',
            description: `Action "${actionKey}" now requires new fields: [${addedFields.join(', ')}]`,
            before: JSON.stringify(before.requiredFields),
            after: JSON.stringify(after.requiredFields),
        });
    }

    // Presenter change
    if (before.presenterName !== after.presenterName) {
        out.push({
            category: 'surface.action',
            field: `actions.${actionKey}.presenterName`,
            severity: before.presenterName && !after.presenterName ? 'BREAKING' : 'RISKY',
            description: `Action "${actionKey}" Presenter changed: ${before.presenterName ?? 'none'} → ${after.presenterName ?? 'none'}`,
            before: before.presenterName ?? null,
            after: after.presenterName ?? null,
        });
    }

    if (before.inputSchemaDigest !== after.inputSchemaDigest) {
        out.push({
            category: 'surface.action',
            field: `actions.${actionKey}.inputSchemaDigest`,
            severity: 'RISKY',
            description: `Action "${actionKey}" input schema changed`,
            before: before.inputSchemaDigest,
            after: after.inputSchemaDigest,
        });
    }
}

/**
 * Diff behavioral contracts.
 * @internal
 */
function diffBehavior(
    before: ToolBehavior,
    after: ToolBehavior,
    out: ContractDelta[],
): void {
    // Egress schema
    if (before.egressSchemaDigest !== after.egressSchemaDigest) {
        out.push({
            category: 'behavior.egress',
            field: 'egressSchemaDigest',
            severity: 'BREAKING',
            description: 'Presenter egress schema changed — LLM response parsing may break',
            before: before.egressSchemaDigest,
            after: after.egressSchemaDigest,
        });
    }

    // System rules
    if (before.systemRulesFingerprint !== after.systemRulesFingerprint) {
        out.push({
            category: 'behavior.rules',
            field: 'systemRulesFingerprint',
            severity: 'BREAKING',
            description: 'System rules changed — LLM behavioral calibration invalidated',
            before: before.systemRulesFingerprint,
            after: after.systemRulesFingerprint,
        });
    }

    // Cognitive guardrails
    if (before.cognitiveGuardrails.agentLimitMax !== after.cognitiveGuardrails.agentLimitMax) {
        const severity: DeltaSeverity = after.cognitiveGuardrails.agentLimitMax === null
            ? 'RISKY' // Removed limit → risk of context flooding
            : 'SAFE';
        out.push({
            category: 'behavior.guardrails',
            field: 'agentLimitMax',
            severity,
            description: `Agent limit changed: ${before.cognitiveGuardrails.agentLimitMax ?? 'unlimited'} → ${after.cognitiveGuardrails.agentLimitMax ?? 'unlimited'}`,
            before: String(before.cognitiveGuardrails.agentLimitMax),
            after: String(after.cognitiveGuardrails.agentLimitMax),
        });
    }

    if (before.cognitiveGuardrails.egressMaxBytes !== after.cognitiveGuardrails.egressMaxBytes) {
        const severity: DeltaSeverity = after.cognitiveGuardrails.egressMaxBytes === null
            ? 'RISKY' // Removed cap → risk of payload inflation
            : 'SAFE';
        out.push({
            category: 'behavior.guardrails',
            field: 'egressMaxBytes',
            severity,
            description: `Egress max bytes changed: ${before.cognitiveGuardrails.egressMaxBytes ?? 'unlimited'} → ${after.cognitiveGuardrails.egressMaxBytes ?? 'unlimited'}`,
            before: String(before.cognitiveGuardrails.egressMaxBytes),
            after: String(after.cognitiveGuardrails.egressMaxBytes),
        });
    }

    // Middleware chain
    const beforeMw = before.middlewareChain.join(',');
    const afterMw = after.middlewareChain.join(',');
    if (beforeMw !== afterMw) {
        out.push({
            category: 'behavior.middleware',
            field: 'middlewareChain',
            severity: 'RISKY',
            description: 'Middleware chain changed — execution semantics may differ',
            before: beforeMw || null,
            after: afterMw || null,
        });
    }

    // State sync
    if (before.stateSyncFingerprint !== after.stateSyncFingerprint) {
        out.push({
            category: 'behavior.stateSync',
            field: 'stateSyncFingerprint',
            severity: 'RISKY',
            description: 'State sync policy changed',
            before: before.stateSyncFingerprint,
            after: after.stateSyncFingerprint,
        });
    }

    // Affordance topology
    const beforeAffordances = before.affordanceTopology.join(',');
    const afterAffordances = after.affordanceTopology.join(',');
    if (beforeAffordances !== afterAffordances) {
        out.push({
            category: 'behavior.affordances',
            field: 'affordanceTopology',
            severity: 'RISKY',
            description: 'Affordance topology changed — suggested action navigation graph differs',
            before: beforeAffordances || null,
            after: afterAffordances || null,
        });
    }

    // Concurrency
    if (before.concurrencyFingerprint !== after.concurrencyFingerprint) {
        out.push({
            category: 'behavior.stateSync',
            field: 'concurrencyFingerprint',
            severity: 'RISKY',
            description: 'Concurrency configuration changed',
            before: before.concurrencyFingerprint,
            after: after.concurrencyFingerprint,
        });
    }

    // Embedded presenters
    const beforePresenters = before.embeddedPresenters.join(',');
    const afterPresenters = after.embeddedPresenters.join(',');
    if (beforePresenters !== afterPresenters) {
        out.push({
            category: 'behavior.egress',
            field: 'embeddedPresenters',
            severity: 'RISKY',
            description: 'Embedded Presenter set changed — response composition differs',
            before: beforePresenters || null,
            after: afterPresenters || null,
        });
    }
}

/**
 * Diff token economics profiles.
 * @internal
 */
function diffTokenEconomics(
    before: TokenEconomicsProfile,
    after: TokenEconomicsProfile,
    out: ContractDelta[],
): void {
    if (before.inflationRisk !== after.inflationRisk) {
        const escalated = SEVERITY_ORDER[riskToSeverity(after.inflationRisk)]
            > SEVERITY_ORDER[riskToSeverity(before.inflationRisk)];

        out.push({
            category: 'tokenEconomics',
            field: 'inflationRisk',
            severity: escalated ? 'BREAKING' : 'SAFE',
            description: `Cognitive overload risk changed: ${before.inflationRisk} → ${after.inflationRisk}`,
            before: before.inflationRisk,
            after: after.inflationRisk,
        });
    }

    if (before.unboundedCollection !== after.unboundedCollection) {
        out.push({
            category: 'tokenEconomics',
            field: 'unboundedCollection',
            severity: after.unboundedCollection ? 'RISKY' : 'SAFE',
            description: `Unbounded collection flag: ${before.unboundedCollection} → ${after.unboundedCollection}`,
            before: String(before.unboundedCollection),
            after: String(after.unboundedCollection),
        });
    }
}

/**
 * Map inflation risk to comparable severity.
 * @internal
 */
function riskToSeverity(risk: TokenEconomicsProfile['inflationRisk']): DeltaSeverity {
    switch (risk) {
        case 'critical': return 'BREAKING';
        case 'high': return 'RISKY';
        case 'medium': return 'SAFE';
        case 'low': return 'COSMETIC';
    }
}

/**
 * Diff handler entitlements.
 * @internal
 */
function diffEntitlements(
    before: HandlerEntitlements,
    after: HandlerEntitlements,
    out: ContractDelta[],
): void {
    const entitlementFlags = ['filesystem', 'network', 'subprocess', 'crypto', 'codeEvaluation'] as const;

    for (const flag of entitlementFlags) {
        if (!before[flag] && after[flag]) {
            out.push({
                category: 'entitlements',
                field: flag,
                severity: 'BREAKING',
                description: `Handler gained "${flag}" entitlement — blast radius expanded`,
                before: 'false',
                after: 'true',
            });
        } else if (before[flag] && !after[flag]) {
            out.push({
                category: 'entitlements',
                field: flag,
                severity: 'SAFE',
                description: `Handler lost "${flag}" entitlement — blast radius reduced`,
                before: 'true',
                after: 'false',
            });
        }
    }
}

// ============================================================================
// Diff Formatting
// ============================================================================

/**
 * Format a diff result as a human-readable report.
 *
 * Designed for both terminal output and injection into
 * LLM correction prompts (Self-Healing Context).
 */
export function formatDiffReport(result: ContractDiffResult): string {
    if (result.deltas.length === 0) {
        return `[${result.toolName}] No contract changes detected.`;
    }

    const lines: string[] = [
        `[${result.toolName}] Contract diff: ${result.deltas.length} change(s), max severity: ${result.maxSeverity}`,
        '',
    ];

    for (const delta of result.deltas) {
        lines.push(`  [${delta.severity}] ${delta.field}: ${delta.description}`);
        lines.push(`         ${formatArrow(delta)}`);
    }

    return lines.join('\n');
}

/**
 * Format deltas as XML for injection into LLM correction prompts.
 * Compatible with ValidationErrorFormatter's XML format.
 */
export function formatDeltasAsXml(deltas: readonly ContractDelta[]): string {
    if (deltas.length === 0) return '';

    const lines: string[] = ['<contract_changes>'];

    for (const delta of deltas) {
        lines.push(`  <change severity="${escapeXml(delta.severity)}" field="${escapeXml(delta.field)}">`);
        lines.push(`    <description>${escapeXml(delta.description)}</description>`);
        if (delta.before !== null) lines.push(`    <before>${escapeXml(delta.before)}</before>`);
        if (delta.after !== null) lines.push(`    <after>${escapeXml(delta.after)}</after>`);
        lines.push('  </change>');
    }

    lines.push('</contract_changes>');
    return lines.join('\n');
}

// ============================================================================
// Utility
// ============================================================================

function truncate(s: string, maxLen: number): string {
    return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
}

/**
 * Format the before→after arrow for a contract delta.
 * @internal
 */
function formatArrow(delta: ContractDelta): string {
    if (delta.before !== null && delta.after !== null) {
        return `${truncate(delta.before, 40)} → ${truncate(delta.after, 40)}`;
    }
    return delta.after !== null
        ? `(added) ${truncate(delta.after, 40)}`
        : `(removed) ${truncate(delta.before!, 40)}`;
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
