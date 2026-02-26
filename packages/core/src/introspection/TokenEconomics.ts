/**
 * TokenEconomics — Cognitive Overload Detection
 *
 * **Evolution 3: Token Economics**
 *
 * Profiles the token density and context spread of MCP tool
 * responses to detect cognitive overload scenarios where the
 * LLM's working memory is flooded by verbose tool output,
 * evicting system rules and degrading reasoning quality.
 *
 * **Key insight**: An MCP tool that returns 50KB of JSON per
 * call will rapidly exhaust the context window. If that output
 * isn't constrained by `agentLimit` or `egressMaxBytes`, the
 * system rules injected by the Presenter's `addRules()` will
 * be pushed out of the LLM's attention window — silently
 * degrading behavioral correctness.
 *
 * This module provides:
 *
 * 1. **Static analysis**: Estimate token density from Presenter
 *    schema and guardrail configuration (zero-cost at runtime).
 *
 * 2. **Runtime profiling**: Measure actual token counts of
 *    response blocks after Presenter rendering (opt-in).
 *
 * 3. **Overload classification**: Classify responses into
 *    risk levels based on configurable thresholds.
 *
 * 4. **Integration with BehaviorDigest**: Token economics risk
 *    level is part of the behavioral contract — changes to
 *    the token profile are tracked as contract deltas.
 *
 * Pure-function module for analysis; runtime profiling hooks
 * are designed for zero-overhead when not configured.
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Token economics analysis for a single tool response.
 */
export interface TokenAnalysis {
    /** Tool name */
    readonly toolName: string;
    /** Action key, if applicable */
    readonly actionKey: string | null;
    /** Estimated total tokens in the response */
    readonly estimatedTokens: number;
    /** Number of content blocks in the response */
    readonly blockCount: number;
    /** Per-block token breakdown */
    readonly blocks: readonly BlockTokenProfile[];
    /** Overhead tokens (rules, affordances, UI decorators) */
    readonly overheadTokens: number;
    /** Data payload tokens (actual tool output) */
    readonly dataTokens: number;
    /** Overhead-to-data ratio (higher = more overhead) */
    readonly overheadRatio: number;
    /** Risk classification */
    readonly risk: TokenRisk;
    /** Human-readable advisory */
    readonly advisory: string | null;
}

/**
 * Token profile for a single content block.
 */
export interface BlockTokenProfile {
    /** Block type (e.g., 'text', 'resource', 'image') */
    readonly type: string;
    /** Estimated tokens in this block */
    readonly estimatedTokens: number;
    /** Raw byte size */
    readonly bytes: number;
}

/**
 * Token risk classification.
 */
export type TokenRisk = 'low' | 'medium' | 'high' | 'critical';

/**
 * Thresholds for token risk classification.
 */
export interface TokenThresholds {
    /** Maximum tokens for 'low' risk (default: 1000) */
    readonly low: number;
    /** Maximum tokens for 'medium' risk (default: 4000) */
    readonly medium: number;
    /** Maximum tokens for 'high' risk (default: 8000) */
    readonly high: number;
    // Above 'high' → 'critical'
}

/**
 * Configuration for the token economics profiler.
 */
export interface TokenEconomicsConfig {
    /** Custom thresholds (defaults provided) */
    readonly thresholds?: Partial<TokenThresholds>;
    /** Whether to emit warnings to debug observer */
    readonly emitWarnings?: boolean;
    /** Maximum acceptable overhead ratio (default: 0.3) */
    readonly maxOverheadRatio?: number;
}

/**
 * Static token profile derived from Presenter configuration.
 * Computed once at build time — zero runtime cost.
 */
export interface StaticTokenProfile {
    /** Tool name */
    readonly toolName: string;
    /** Estimated minimum tokens per response */
    readonly minTokens: number;
    /** Estimated maximum tokens per response (with agentLimit) */
    readonly maxTokens: number;
    /** Whether the maximum is bounded (agentLimit/egressMaxBytes set) */
    readonly bounded: boolean;
    /** Per-field estimated token cost */
    readonly fieldBreakdown: readonly FieldTokenEstimate[];
    /** Risk classification based on max estimate */
    readonly risk: TokenRisk;
    /** Recommendations for reducing token cost */
    readonly recommendations: readonly string[];
}

/**
 * Per-field token estimate.
 */
export interface FieldTokenEstimate {
    /** Field name */
    readonly name: string;
    /** Estimated tokens per occurrence */
    readonly estimatedTokens: number;
    /** Whether this field is a collection/array type */
    readonly isCollection: boolean;
}

// ============================================================================
// Default Thresholds
// ============================================================================

const DEFAULT_THRESHOLDS: TokenThresholds = {
    low: 1000,
    medium: 4000,
    high: 8000,
};

const DEFAULT_MAX_OVERHEAD_RATIO = 0.3;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count from a string using the ~4 chars/token heuristic.
 *
 * This is a fast approximation suitable for profiling. For precise
 * token counting, use a tokenizer library (tiktoken, etc.).
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
    // GPT-family heuristic: ~4 characters per token for English
    // JSON/code tends to be ~3.5 chars/token due to syntax characters
    return Math.ceil(text.length / 3.5);
}

/**
 * Estimate tokens for a content block structure (MCP response block).
 *
 * @param block - The content block with `type` and `text` fields
 * @returns Block-level token profile
 */
export function profileBlock(block: { type: string; text?: string }): BlockTokenProfile {
    const text = block.text ?? '';
    const bytes = new TextEncoder().encode(text).byteLength;
    const estimatedTokens = estimateTokens(text);

    return {
        type: block.type,
        estimatedTokens,
        bytes,
    };
}

// ============================================================================
// Runtime Profiling
// ============================================================================

/**
 * Profile a complete tool response for token economics.
 *
 * Analyzes all content blocks in a tool response to compute
 * total token usage, overhead ratio, and risk classification.
 *
 * @param toolName - Name of the tool that produced the response
 * @param actionKey - Action key (if applicable)
 * @param blocks - Content blocks from the tool response
 * @param overheadBlocks - Number of blocks that are overhead (rules, UI)
 * @param config - Token economics configuration
 * @returns Complete token analysis
 */
export function profileResponse(
    toolName: string,
    actionKey: string | null,
    blocks: readonly { type: string; text?: string }[],
    overheadBlocks: number = 0,
    config: TokenEconomicsConfig = {},
): TokenAnalysis {
    const thresholds = resolveThresholds(config);
    const blockProfiles = blocks.map(profileBlock);
    const totalTokens = blockProfiles.reduce((sum, b) => sum + b.estimatedTokens, 0);

    // Split tokens into overhead vs data
    const overheadTokens = blockProfiles
        .slice(0, overheadBlocks)
        .reduce((sum, b) => sum + b.estimatedTokens, 0);
    const dataTokens = totalTokens - overheadTokens;
    const overheadRatio = dataTokens > 0 ? overheadTokens / dataTokens : 0;

    const risk = classifyRisk(totalTokens, thresholds);
    const advisory = generateAdvisory(toolName, totalTokens, risk, overheadRatio, config);

    return {
        toolName,
        actionKey,
        estimatedTokens: totalTokens,
        blockCount: blocks.length,
        blocks: blockProfiles,
        overheadTokens,
        dataTokens,
        overheadRatio,
        risk,
        advisory,
    };
}

// ============================================================================
// Static Analysis
// ============================================================================

/**
 * Compute a static token profile from Presenter metadata.
 *
 * This runs once at manifest compilation time and produces
 * a zero-cost profile that estimates the worst-case token
 * usage for a tool based on its schema and guardrail config.
 *
 * @param toolName - Tool name
 * @param schemaKeys - Presenter schema field names
 * @param agentLimitMax - Maximum items from agentLimit() config
 * @param egressMaxBytes - Maximum bytes from egressMaxBytes() config
 * @returns Static token profile with recommendations
 */
export function computeStaticProfile(
    toolName: string,
    schemaKeys: readonly string[],
    agentLimitMax: number | null,
    egressMaxBytes: number | null,
): StaticTokenProfile {
    // Estimate per-field token cost
    const fieldBreakdown: FieldTokenEstimate[] = schemaKeys.map(name => ({
        name,
        estimatedTokens: estimateFieldTokens(name),
        isCollection: name.endsWith('s') || name.includes('list') || name.includes('items'),
    }));

    // Base token cost: field names + structure + JSON overhead
    const baseTokens = fieldBreakdown.reduce((sum, f) => sum + f.estimatedTokens, 0);

    // Minimum: one item with all fields
    const minTokens = baseTokens + 20; // JSON structure overhead

    // Maximum: bounded by egressMaxBytes, agentLimit, or worst-case estimate
    const { maxTokens, bounded } = computeBounds(baseTokens, agentLimitMax, egressMaxBytes);

    const risk = classifyRisk(maxTokens, DEFAULT_THRESHOLDS);

    const recommendations = buildRecommendations(
        toolName, bounded, risk, schemaKeys, agentLimitMax, fieldBreakdown,
    );

    return {
        toolName,
        minTokens,
        maxTokens,
        bounded,
        fieldBreakdown,
        risk,
        recommendations,
    };
}

/**
 * Aggregate static profiles into a server-level summary.
 *
 * @param profiles - All static profiles for the server
 * @returns Server-level token economics summary
 */
export function aggregateProfiles(
    profiles: readonly StaticTokenProfile[],
): ServerTokenSummary {
    const totalMinTokens = profiles.reduce((sum, p) => sum + p.minTokens, 0);
    const totalMaxTokens = profiles.reduce((sum, p) => sum + p.maxTokens, 0);
    const unboundedTools = profiles.filter(p => !p.bounded);
    const criticalTools = profiles.filter(p => p.risk === 'critical');
    const highRiskTools = profiles.filter(p => p.risk === 'high');

    const overallRisk: TokenRisk = criticalTools.length > 0
        ? 'critical'
        : highRiskTools.length > 0
            ? 'high'
            : unboundedTools.length > 0
                ? 'medium'
                : 'low';

    return {
        toolCount: profiles.length,
        totalMinTokens,
        totalMaxTokens,
        unboundedToolCount: unboundedTools.length,
        unboundedToolNames: unboundedTools.map(p => p.toolName),
        overallRisk,
        criticalToolNames: criticalTools.map(p => p.toolName),
        recommendations: [
            ...criticalTools.flatMap(p => p.recommendations.map(r => `[${p.toolName}] ${r}`)),
            ...highRiskTools.flatMap(p => p.recommendations.map(r => `[${p.toolName}] ${r}`)),
        ],
    };
}

/**
 * Server-level token economics summary.
 */
export interface ServerTokenSummary {
    /** Total number of tools */
    readonly toolCount: number;
    /** Sum of all tools' minimum token estimates */
    readonly totalMinTokens: number;
    /** Sum of all tools' maximum token estimates */
    readonly totalMaxTokens: number;
    /** Number of tools without bounded output */
    readonly unboundedToolCount: number;
    /** Names of unbounded tools */
    readonly unboundedToolNames: readonly string[];
    /** Overall risk classification */
    readonly overallRisk: TokenRisk;
    /** Names of critical-risk tools */
    readonly criticalToolNames: readonly string[];
    /** Aggregated recommendations */
    readonly recommendations: readonly string[];
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Classify token risk based on thresholds.
 * @internal
 */
function classifyRisk(tokens: number, thresholds: TokenThresholds): TokenRisk {
    if (tokens <= thresholds.low) return 'low';
    if (tokens <= thresholds.medium) return 'medium';
    if (tokens <= thresholds.high) return 'high';
    return 'critical';
}

/**
 * Resolve thresholds with defaults.
 * @internal
 */
function resolveThresholds(config: TokenEconomicsConfig): TokenThresholds {
    return {
        low: config.thresholds?.low ?? DEFAULT_THRESHOLDS.low,
        medium: config.thresholds?.medium ?? DEFAULT_THRESHOLDS.medium,
        high: config.thresholds?.high ?? DEFAULT_THRESHOLDS.high,
    };
}

/** Advisory templates keyed by risk level. @internal */
const ADVISORY_TEMPLATES: Record<string, (toolName: string, tokens: number) => string> = {
    critical: (toolName, tokens) =>
        `COGNITIVE OVERLOAD: Tool "${toolName}" response estimated at ${tokens} tokens. ` +
        `This will consume significant context window space. Consider adding agentLimit() or egressMaxBytes().`,
    high: (toolName, tokens) =>
        `HIGH TOKEN DENSITY: Tool "${toolName}" response estimated at ${tokens} tokens. ` +
        `Consider reducing response verbosity or adding pagination.`,
};

/**
 * Generate advisory for elevated risk levels.
 * @internal
 */
function generateAdvisory(
    toolName: string,
    tokens: number,
    risk: TokenRisk,
    overheadRatio: number,
    config: TokenEconomicsConfig,
): string | null {
    const template = ADVISORY_TEMPLATES[risk];
    if (template) return template(toolName, tokens);

    const maxRatio = config.maxOverheadRatio ?? DEFAULT_MAX_OVERHEAD_RATIO;
    if (overheadRatio > maxRatio) {
        return `OVERHEAD WARNING: Tool "${toolName}" has ${Math.round(overheadRatio * 100)}% overhead ratio. ` +
            `System rules and UI decorators are consuming significant context.`;
    }

    return null;
}

/**
 * Compute upper bounds for token estimation.
 * @internal
 */
function computeBounds(
    baseTokens: number,
    agentLimitMax: number | null,
    egressMaxBytes: number | null,
): { maxTokens: number; bounded: boolean } {
    // egressMaxBytes provides a hard ceiling
    if (egressMaxBytes !== null) return { maxTokens: Math.ceil(egressMaxBytes / 3.5), bounded: true };
    // agentLimit bounds the collection size
    if (agentLimitMax !== null) return { maxTokens: baseTokens * agentLimitMax + 50, bounded: true };
    // No bounds — worst-case estimate (100 items)
    return { maxTokens: baseTokens * 100, bounded: false };
}

/** Recommendation rule. @internal */
interface RecommendationRule {
    readonly predicate: (bounded: boolean, risk: TokenRisk, hasUnboundedCollections: boolean, fieldCount: number) => boolean;
    readonly message: string;
}

const RECOMMENDATION_RULES: readonly RecommendationRule[] = [
    { predicate: (bounded) => !bounded, message: 'Add .agentLimit() to bound collection size' },
    { predicate: (_, risk) => risk === 'critical' || risk === 'high', message: 'Add .egressMaxBytes() to cap payload size' },
    { predicate: (_, __, hasUnbounded) => hasUnbounded, message: 'Collection fields detected without agentLimit — risk of context flooding' },
    { predicate: (_, __, ___, fieldCount) => fieldCount > 15, message: 'Consider reducing schema field count (>15 fields adds cognitive load)' },
];

/**
 * Build recommendations based on profile characteristics.
 * @internal
 */
function buildRecommendations(
    _toolName: string,
    bounded: boolean,
    risk: TokenRisk,
    schemaKeys: readonly string[],
    agentLimitMax: number | null,
    fieldBreakdown: readonly FieldTokenEstimate[],
): readonly string[] {
    const hasUnboundedCollections = fieldBreakdown.some(f => f.isCollection) && agentLimitMax === null;
    return RECOMMENDATION_RULES
        .filter(rule => rule.predicate(bounded, risk, hasUnboundedCollections, schemaKeys.length))
        .map(rule => rule.message);
}

/**
 * Estimate tokens for a single field name.
 * Heuristic: field name tokens + value tokens (estimated from name length).
 * @internal
 */
function estimateFieldTokens(fieldName: string): number {
    // Field name in JSON: "fieldName": → ~name.length/4 + 1
    const nameTokens = Math.ceil(fieldName.length / 4) + 1;
    // Value estimate: assume average 5 tokens per field value
    const valueTokens = 5;
    return nameTokens + valueTokens;
}
