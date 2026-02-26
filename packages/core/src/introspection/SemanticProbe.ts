/**
 * SemanticProbe — LLM-as-a-Judge for Opaque Behavior Detection
 *
 * **Evolution 2: Semantic Probing**
 *
 * Provides a framework for using an LLM to evaluate whether
 * a tool handler's actual runtime behavior matches its declared
 * behavioral contract. This detects "semantic drift" — situations
 * where the handler's output changes meaning even when the
 * egress schema and system rules remain structurally identical.
 *
 * **Architecture**: This module defines the probe protocol,
 * types, and evaluation pipeline. The actual LLM invocation
 * is delegated to user-provided adapters — the module never
 * makes LLM calls directly, maintaining the "no hidden
 * network dependencies" principle.
 *
 * **Testing integration**: Designed to be integrated with
 * `FusionTester.callAction()` for automated regression
 * testing: "given these inputs, does the output semantically
 * match the previous known-good output?"
 *
 * Pure-function module for probe construction and evaluation;
 * LLM interaction is async via pluggable adapters.
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for semantic probing.
 */
export interface SemanticProbeConfig {
    /** The LLM adapter to use for evaluation */
    readonly adapter: SemanticProbeAdapter;
    /** Risk thresholds for classification */
    readonly thresholds?: Partial<SemanticThresholds>;
    /** Maximum number of probes to run in parallel */
    readonly concurrency?: number;
    /** Whether to include raw LLM responses in results */
    readonly includeRawResponses?: boolean;
}

/**
 * Pluggable LLM adapter for semantic evaluation.
 *
 * Implementations should call an LLM with the provided prompt
 * and return the structured evaluation result.
 */
export interface SemanticProbeAdapter {
    /** Human-readable name (e.g., 'claude-3.5', 'gpt-4o') */
    readonly name: string;
    /**
     * Send a semantic evaluation prompt to the LLM.
     *
     * @param prompt - Complete evaluation prompt
     * @returns Raw LLM response text
     */
    evaluate(prompt: string): Promise<string>;
}

/**
 * Thresholds for semantic drift classification.
 */
export interface SemanticThresholds {
    /** Score below which drift is considered 'high' (default: 0.5) */
    readonly highDriftThreshold: number;
    /** Score below which drift is considered 'medium' (default: 0.75) */
    readonly mediumDriftThreshold: number;
}

/**
 * A semantic probe definition — a structured test case
 * for LLM-based behavioral evaluation.
 */
export interface SemanticProbe {
    /** Unique identifier for this probe */
    readonly id: string;
    /** Tool name being probed */
    readonly toolName: string;
    /** Action key being probed */
    readonly actionKey: string;
    /** Description of what this probe tests */
    readonly description: string;
    /** Input arguments to the tool */
    readonly input: Record<string, unknown>;
    /** Expected output (known-good baseline) */
    readonly expectedOutput: unknown;
    /** Actual output from the current handler */
    readonly actualOutput: unknown;
    /** Behavioral contract context for the judge */
    readonly contractContext: ProbeContractContext;
}

/**
 * Contract context injected into the LLM judge prompt.
 *
 * Provides the judge with enough information to evaluate
 * whether the behavioral contract was violated.
 */
export interface ProbeContractContext {
    /** Tool description */
    readonly description: string | undefined;
    /** Whether the action is declared readOnly */
    readonly readOnly: boolean;
    /** Whether the action is declared destructive */
    readonly destructive: boolean;
    /** System rules that should be respected */
    readonly systemRules: readonly string[];
    /** Schema field names (expected output shape) */
    readonly schemaKeys: readonly string[];
}

/**
 * Result of a single semantic probe evaluation.
 */
export interface SemanticProbeResult {
    /** The probe that was evaluated */
    readonly probe: SemanticProbe;
    /** Semantic similarity score (0.0 = completely different, 1.0 = identical) */
    readonly similarityScore: number;
    /** Drift classification */
    readonly driftLevel: DriftLevel;
    /** Whether the behavioral contract was violated */
    readonly contractViolated: boolean;
    /** Specific violations detected by the judge */
    readonly violations: readonly string[];
    /** LLM judge's reasoning */
    readonly reasoning: string;
    /** Raw LLM response (if configured) */
    readonly rawResponse: string | null;
    /** ISO-8601 timestamp of evaluation */
    readonly evaluatedAt: string;
}

/** Drift level classification */
export type DriftLevel = 'none' | 'low' | 'medium' | 'high';

/**
 * Aggregated result of multiple semantic probes.
 */
export interface SemanticProbeReport {
    /** Tool name */
    readonly toolName: string;
    /** All individual probe results */
    readonly results: readonly SemanticProbeResult[];
    /** Overall drift assessment */
    readonly overallDrift: DriftLevel;
    /** Number of contract violations */
    readonly violationCount: number;
    /** Whether the tool is considered semantically stable */
    readonly stable: boolean;
    /** Human-readable summary */
    readonly summary: string;
    /** ISO-8601 timestamp */
    readonly completedAt: string;
}

// ============================================================================
// Probe Construction
// ============================================================================

/**
 * Create a semantic probe from input/output pairs.
 *
 * @param toolName - Tool name
 * @param actionKey - Action key
 * @param input - Input arguments
 * @param expectedOutput - Known-good baseline output
 * @param actualOutput - Current handler output
 * @param contractContext - Behavioral contract context
 * @returns A structured semantic probe
 */
export function createProbe(
    toolName: string,
    actionKey: string,
    input: Record<string, unknown>,
    expectedOutput: unknown,
    actualOutput: unknown,
    contractContext: ProbeContractContext,
): SemanticProbe {
    const id = `${toolName}::${actionKey}::${Date.now()}`;

    return {
        id,
        toolName,
        actionKey,
        description: `Semantic probe for ${toolName}.${actionKey}`,
        input,
        expectedOutput,
        actualOutput,
        contractContext,
    };
}

/**
 * Build the evaluation prompt for the LLM judge.
 *
 * The prompt is structured to elicit a JSON-formatted response
 * with specific fields for programmatic parsing.
 *
 * @param probe - The semantic probe to evaluate
 * @returns Complete evaluation prompt
 */
export function buildJudgePrompt(probe: SemanticProbe): string {
    return `You are a semantic evaluation judge for an MCP (Model Context Protocol) tool.

Your task is to compare two outputs from the same tool handler and determine:
1. Whether they are semantically equivalent
2. Whether the current output violates the tool's behavioral contract

## Tool Information
- **Tool**: ${probe.toolName}
- **Action**: ${probe.actionKey}
- **Description**: ${probe.contractContext.description ?? 'No description'}
- **Read-Only**: ${probe.contractContext.readOnly}
- **Destructive**: ${probe.contractContext.destructive}

## Behavioral Contract
${probe.contractContext.systemRules.length > 0
        ? `### System Rules\n${probe.contractContext.systemRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : 'No system rules declared.'}

### Expected Output Schema Fields
${probe.contractContext.schemaKeys.join(', ') || 'No schema declared'}

## Input Arguments
\`\`\`json
${JSON.stringify(probe.input, null, 2)}
\`\`\`

## Expected Output (Baseline)
\`\`\`json
${JSON.stringify(probe.expectedOutput, null, 2)}
\`\`\`

## Actual Output (Current)
\`\`\`json
${JSON.stringify(probe.actualOutput, null, 2)}
\`\`\`

## Evaluation Instructions
Compare the Expected Output with the Actual Output. Consider:
- Are the outputs semantically equivalent (same meaning, even if format differs)?
- Does the Actual Output violate any system rules?
- Does the Actual Output return fields not in the expected schema?
- Has the behavior meaningfully changed from the baseline?

Respond with ONLY a JSON object in this exact format:
\`\`\`json
{
  "similarityScore": <number 0.0-1.0>,
  "contractViolated": <boolean>,
  "violations": [<string descriptions of violations>],
  "reasoning": "<brief explanation of your assessment>"
}
\`\`\``;
}

/**
 * Parse the LLM judge's response into a structured result.
 *
 * Handles malformed responses gracefully by falling back
 * to conservative defaults.
 *
 * @param probe - The probe that was evaluated
 * @param rawResponse - Raw LLM response text
 * @param config - Probe configuration
 * @returns Structured probe result
 */
export function parseJudgeResponse(
    probe: SemanticProbe,
    rawResponse: string,
    config: SemanticProbeConfig,
): SemanticProbeResult {
    const thresholds = resolveThresholds(config);

    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return fallbackResult(probe, rawResponse, config);
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            similarityScore?: number;
            contractViolated?: boolean;
            violations?: string[];
            reasoning?: string;
        };

        const similarityScore = typeof parsed.similarityScore === 'number'
            ? Math.max(0, Math.min(1, parsed.similarityScore))
            : 0.5;

        const driftLevel = classifyDrift(similarityScore, thresholds);

        return {
            probe,
            similarityScore,
            driftLevel,
            contractViolated: parsed.contractViolated ?? false,
            violations: parsed.violations ?? [],
            reasoning: parsed.reasoning ?? 'No reasoning provided',
            rawResponse: config.includeRawResponses ? rawResponse : null,
            evaluatedAt: new Date().toISOString(),
        };
    } catch {
        return fallbackResult(probe, rawResponse, config);
    }
}

/**
 * Run a complete semantic probe evaluation.
 *
 * @param probe - The probe to evaluate
 * @param config - Probe configuration (includes LLM adapter)
 * @returns Evaluation result
 */
export async function evaluateProbe(
    probe: SemanticProbe,
    config: SemanticProbeConfig,
): Promise<SemanticProbeResult> {
    const prompt = buildJudgePrompt(probe);
    const rawResponse = await config.adapter.evaluate(prompt);
    return parseJudgeResponse(probe, rawResponse, config);
}

/**
 * Run multiple probes and aggregate results.
 *
 * @param probes - Array of probes to evaluate
 * @param config - Probe configuration
 * @returns Aggregated report
 */
export async function evaluateProbes(
    probes: readonly SemanticProbe[],
    config: SemanticProbeConfig,
): Promise<SemanticProbeReport> {
    const concurrency = config.concurrency ?? 3;

    // Run probes with concurrency control
    const results: SemanticProbeResult[] = [];
    for (let i = 0; i < probes.length; i += concurrency) {
        const batch = probes.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(probe => evaluateProbe(probe, config)),
        );
        results.push(...batchResults);
    }

    return aggregateResults(probes[0]?.toolName ?? 'unknown', results);
}

/**
 * Aggregate individual probe results into a report.
 *
 * @param toolName - Tool name
 * @param results - Individual probe results
 * @returns Aggregated report
 */
export function aggregateResults(
    toolName: string,
    results: readonly SemanticProbeResult[],
): SemanticProbeReport {
    const violationCount = results.filter(r => r.contractViolated).length;
    const avgSimilarity = results.length > 0
        ? results.reduce((sum, r) => sum + r.similarityScore, 0) / results.length
        : 1.0;

    const overallDrift = results.length > 0
        ? classifyDrift(avgSimilarity, {
            highDriftThreshold: 0.5,
            mediumDriftThreshold: 0.75,
        })
        : 'none' as DriftLevel;

    const stable = overallDrift === 'none' || overallDrift === 'low';

    const summary = results.length === 0
        ? 'No probes evaluated.'
        : `${results.length} probes evaluated. Avg similarity: ${(avgSimilarity * 100).toFixed(1)}%. ` +
        `Drift: ${overallDrift}. Violations: ${violationCount}. ` +
        `Status: ${stable ? 'STABLE' : 'UNSTABLE'}`;

    return {
        toolName,
        results,
        overallDrift,
        violationCount,
        stable,
        summary,
        completedAt: new Date().toISOString(),
    };
}

// ============================================================================
// Internals
// ============================================================================

const DEFAULT_THRESHOLDS: SemanticThresholds = {
    highDriftThreshold: 0.5,
    mediumDriftThreshold: 0.75,
};

function resolveThresholds(config: SemanticProbeConfig): SemanticThresholds {
    return {
        highDriftThreshold: config.thresholds?.highDriftThreshold ?? DEFAULT_THRESHOLDS.highDriftThreshold,
        mediumDriftThreshold: config.thresholds?.mediumDriftThreshold ?? DEFAULT_THRESHOLDS.mediumDriftThreshold,
    };
}

function classifyDrift(similarity: number, thresholds: SemanticThresholds): DriftLevel {
    if (similarity >= 0.95) return 'none';
    if (similarity >= thresholds.mediumDriftThreshold) return 'low';
    if (similarity >= thresholds.highDriftThreshold) return 'medium';
    return 'high';
}

function fallbackResult(
    probe: SemanticProbe,
    rawResponse: string,
    config: SemanticProbeConfig,
): SemanticProbeResult {
    return {
        probe,
        similarityScore: 0.5,
        driftLevel: 'medium',
        contractViolated: false,
        violations: ['Unable to parse LLM judge response'],
        reasoning: 'Fallback: LLM response could not be parsed as JSON',
        rawResponse: config.includeRawResponses ? rawResponse : null,
        evaluatedAt: new Date().toISOString(),
    };
}
