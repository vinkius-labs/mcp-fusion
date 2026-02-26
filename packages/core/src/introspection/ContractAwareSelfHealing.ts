/**
 * ContractAwareSelfHealing — Runtime Contract Delta Injection
 *
 * **Evolution 4: Self-Healing Context**
 *
 * When a Zod validation error occurs (the LLM sent malformed
 * arguments), this module enriches the error response with
 * contract change context. If the tool's behavioral contract
 * has changed since the LLM was last calibrated, the error
 * message includes:
 *
 * 1. Which contract fields changed (from ContractDiff)
 * 2. What the previous contract looked like
 * 3. What the current contract requires
 *
 * This gives the LLM enough context to self-correct on the
 * next invocation instead of repeating the same mistake.
 *
 * **Integration**: Plugs into the existing `formatValidationError()`
 * pipeline via a wrapping function that checks for relevant
 * contract deltas and injects them into the XML error response.
 *
 * **Zero-overhead**: When no contract changes exist, the function
 * passes through to the original formatter with zero additional cost.
 *
 * @module
 */
import type { ContractDelta, ContractDiffResult } from './ContractDiff.js';
import { formatDeltasAsXml } from './ContractDiff.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for contract-aware self-healing.
 */
export interface SelfHealingConfig {
    /**
     * Active contract diff results, keyed by tool name.
     * Populated at server startup by diffing current contracts
     * against the last known-good lockfile.
     */
    readonly activeDeltas: ReadonlyMap<string, ContractDiffResult>;

    /**
     * Whether to inject deltas for all severity levels.
     * Default: only BREAKING and RISKY.
     */
    readonly includeAllSeverities?: boolean;

    /**
     * Maximum number of deltas to inject per error.
     * Prevents context flooding from large diffs.
     * Default: 5.
     */
    readonly maxDeltasPerError?: number;
}

/**
 * Result of self-healing injection.
 */
export interface SelfHealingResult {
    /** The original error XML */
    readonly originalError: string;
    /** The enriched error XML with contract context */
    readonly enrichedError: string;
    /** Whether any contract context was injected */
    readonly injected: boolean;
    /** Number of deltas injected */
    readonly deltaCount: number;
    /** Tool name */
    readonly toolName: string;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Enrich a validation error with contract change context.
 *
 * If the tool has relevant contract changes (from `SelfHealingConfig.activeDeltas`),
 * this function injects them into the error XML so the LLM can self-correct.
 *
 * @param originalError - The original XML error from `formatValidationError()`
 * @param toolName - The tool that failed validation
 * @param actionKey - The action that failed
 * @param config - Self-healing configuration with active deltas
 * @returns Enriched error string with contract context
 */
export function enrichValidationError(
    originalError: string,
    toolName: string,
    actionKey: string,
    config: SelfHealingConfig,
): SelfHealingResult {
    const diffResult = config.activeDeltas.get(toolName);

    // No deltas for this tool → pass through
    if (!diffResult || diffResult.deltas.length === 0) {
        return {
            originalError,
            enrichedError: originalError,
            injected: false,
            deltaCount: 0,
            toolName,
        };
    }

    // Filter deltas by relevance
    const relevantDeltas = filterRelevantDeltas(
        diffResult.deltas,
        actionKey,
        config,
    );

    if (relevantDeltas.length === 0) {
        return {
            originalError,
            enrichedError: originalError,
            injected: false,
            deltaCount: 0,
            toolName,
        };
    }

    // Build the contract context injection
    const contractXml = buildContractContext(toolName, actionKey, relevantDeltas);

    // Inject before the closing </validation_error> tag
    const enrichedError = injectIntoXml(originalError, contractXml);

    return {
        originalError,
        enrichedError,
        injected: true,
        deltaCount: relevantDeltas.length,
        toolName,
    };
}

/**
 * Create a tool-scoped self-healing enhancer.
 *
 * This is the primary integration point: wraps a per-tool
 * error formatter with contract delta context.
 *
 * @param toolName - The tool name for delta lookup
 * @param config - Self-healing configuration
 * @returns A function that enriches error strings
 */
export function createToolEnhancer(
    toolName: string,
    config: SelfHealingConfig,
): (errorXml: string, actionKey: string) => string {
    const diffResult = config.activeDeltas.get(toolName);

    // No deltas → return identity function (zero overhead)
    if (!diffResult || diffResult.deltas.length === 0) {
        return (errorXml: string) => errorXml;
    }

    // Pre-compute relevant deltas (avoids per-call filtering)
    return (errorXml: string, actionKey: string) => {
        const result = enrichValidationError(errorXml, toolName, actionKey, config);
        return result.enrichedError;
    };
}

// ============================================================================
// Internals
// ============================================================================

/** Severity levels considered actionable by default */
const ACTIONABLE_SEVERITIES = new Set<string>(['BREAKING', 'RISKY']);

/**
 * Filter deltas relevant to the failing action.
 * @internal
 */
function filterRelevantDeltas(
    deltas: readonly ContractDelta[],
    actionKey: string,
    config: SelfHealingConfig,
): readonly ContractDelta[] {
    const maxDeltas = config.maxDeltasPerError ?? 5;
    const includeAll = config.includeAllSeverities ?? false;
    const actionPrefix = `actions.${actionKey}`;

    const isRelevant = (delta: ContractDelta): boolean => {
        const severityOk = includeAll || ACTIONABLE_SEVERITIES.has(delta.severity);
        const isGlobal = !delta.field.includes('actions.');
        const isForAction = delta.field.includes(actionPrefix);
        return severityOk && (isGlobal || isForAction);
    };

    return deltas.filter(isRelevant).slice(0, maxDeltas);
}

/**
 * Build the contract context XML block.
 * @internal
 */
function buildContractContext(
    toolName: string,
    actionKey: string,
    deltas: readonly ContractDelta[],
): string {
    const lines: string[] = [
        '',
        '<contract_awareness>',
        `  <system_note>IMPORTANT: The behavioral contract for tool "${toolName}" has changed since your last calibration.</system_note>`,
        `  <action>${actionKey}</action>`,
        `  <change_count>${deltas.length}</change_count>`,
        `  <max_severity>${deltas[0]?.severity ?? 'UNKNOWN'}</max_severity>`,
        '',
        '  <instructions>',
        '    Review the contract changes below and adjust your next invocation accordingly.',
        '    These changes may explain why your previous arguments were rejected.',
        '  </instructions>',
        '',
        `  ${formatDeltasAsXml(deltas).split('\n').join('\n  ')}`,
        '</contract_awareness>',
    ];

    return lines.join('\n');
}

/**
 * Inject contract context into the validation error XML.
 *
 * Inserts before `</validation_error>` if present,
 * otherwise appends at the end.
 * @internal
 */
function injectIntoXml(originalXml: string, contractXml: string): string {
    const closingTag = '</validation_error>';
    const insertionPoint = originalXml.lastIndexOf(closingTag);

    return insertionPoint === -1
        ? `${originalXml}\n${contractXml}`
        : `${originalXml.slice(0, insertionPoint)}\n${contractXml}\n${originalXml.slice(insertionPoint)}`;
}
