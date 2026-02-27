/**
 * ToolContract — Behavioral Contract Materialization
 *
 * Unifies the declarative surface (tool names, schemas, tags) with
 * the behavioral contract (Presenter egress schema, system rules,
 * cognitive guardrails, middleware chain, state-sync policies) into
 * a single, serializable, diffable, hashable artifact.
 *
 * **Key insight**: MCP Fusion's Presenter is not just a response
 * formatter — it's a declarative behavioral specification. The Zod
 * schema, system rules, agent limits, and affordances are all
 * explicit, serializable contracts. By materializing them into a
 * `ToolContract`, we create a fingerprint that changes when behavior
 * changes — even if the MCP tool declaration stays identical.
 *
 * **Zero developer effort**: The contract materializes from what the
 * developer has already declared. No annotations, no config, no
 * ceremony — just `materializeContract(builder)`.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import { type ToolBuilder } from '../core/types.js';
import { sha256, canonicalize } from './canonicalize.js';

// ============================================================================
// Contract Types
// ============================================================================

/**
 * Complete behavioral contract for a single tool.
 *
 * Captures both the MCP-visible surface (schema, description) and
 * the behavioral internals (Presenter egress, rules, guardrails,
 * middleware, state-sync, concurrency).
 */
export interface ToolContract {
    /** Declarative surface visible via MCP `tools/list` */
    readonly surface: ToolSurface;
    /** Behavioral contract extracted from runtime primitives */
    readonly behavior: ToolBehavior;
    /** Token economics profile for cognitive overload detection */
    readonly tokenEconomics: TokenEconomicsProfile;
    /** Handler entitlements from static analysis */
    readonly entitlements: HandlerEntitlements;
}

/** Declarative surface — what `tools/list` exposes */
export interface ToolSurface {
    /** Tool name */
    readonly name: string;
    /** Tool description */
    readonly description: string | undefined;
    /** Tags for selective exposure */
    readonly tags: readonly string[];
    /** Per-action contracts */
    readonly actions: Record<string, ActionContract>;
    /** SHA-256 of canonical JSON Schema */
    readonly inputSchemaDigest: string;
}

/** Per-action behavioral contract */
export interface ActionContract {
    /** Human-readable description */
    readonly description: string | undefined;
    /** Whether this action is destructive */
    readonly destructive: boolean;
    /** Whether this action is idempotent */
    readonly idempotent: boolean;
    /** Whether this action is read-only */
    readonly readOnly: boolean;
    /** Required field names */
    readonly requiredFields: readonly string[];
    /** Presenter name (if MVA pattern is used) */
    readonly presenterName: string | undefined;
    /** SHA-256 of action-level input schema */
    readonly inputSchemaDigest: string;
    /** Whether the action has per-action middleware */
    readonly hasMiddleware: boolean;
}

/** Behavioral contract — internal runtime guarantees */
export interface ToolBehavior {
    /** SHA-256 of Presenter's Zod schema shape (field names + types) */
    readonly egressSchemaDigest: string | null;
    /**
     * Fingerprint of system rules configuration.
     * Static rules: SHA-256 of sorted rule strings.
     * Dynamic rules: `"dynamic:<function-hash>"`.
     */
    readonly systemRulesFingerprint: string;
    /** Cognitive guardrail configuration */
    readonly cognitiveGuardrails: CognitiveGuardrailsContract;
    /** Middleware chain identity */
    readonly middlewareChain: readonly string[];
    /** State sync policy fingerprint */
    readonly stateSyncFingerprint: string | null;
    /** Concurrency configuration fingerprint */
    readonly concurrencyFingerprint: string | null;
    /** Affordance topology — tool names from suggestActions */
    readonly affordanceTopology: readonly string[];
    /** Embedded child Presenter names */
    readonly embeddedPresenters: readonly string[];
}

/** Cognitive guardrails configuration snapshot */
export interface CognitiveGuardrailsContract {
    /** Maximum items before truncation (from Presenter) */
    readonly agentLimitMax: number | null;
    /** Maximum egress payload bytes (from builder) */
    readonly egressMaxBytes: number | null;
}

/**
 * Token economics profile for cognitive overload detection.
 *
 * Captures the expected token density of a tool's responses
 * to detect context inflation that would evict system rules
 * from the LLM's working memory.
 */
export interface TokenEconomicsProfile {
    /** Estimated tokens per field in the egress schema */
    readonly schemaFieldCount: number;
    /** Whether collections may be unbounded (no agentLimit) */
    readonly unboundedCollection: boolean;
    /** Estimated base token overhead (rules + UI + affordances) */
    readonly baseOverheadTokens: number;
    /** Risk level based on configuration */
    readonly inflationRisk: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Handler entitlements derived from static analysis.
 *
 * Tracks I/O capabilities that the handler accesses, forming
 * a security contract. If a read-only tool suddenly imports
 * `fs.writeFileSync`, the entitlement contract breaks.
 */
export interface HandlerEntitlements {
    /** Whether any handler references filesystem APIs */
    readonly filesystem: boolean;
    /** Whether any handler references network/fetch APIs */
    readonly network: boolean;
    /** Whether any handler references child_process/exec APIs */
    readonly subprocess: boolean;
    /** Whether any handler references crypto/signing APIs */
    readonly crypto: boolean;
    /** Whether any handler uses dynamic code evaluation (eval, Function, vm) */
    readonly codeEvaluation: boolean;
    /** Raw entitlement identifiers for granular diff */
    readonly raw: readonly string[];
}

// ============================================================================
// Materialization
// ============================================================================

/**
 * Materialize a `ToolContract` from a builder's public API.
 *
 * Extracts all behavioral metadata from the builder's introspection
 * methods without accessing any private internals. This guarantees
 * compatibility with any `ToolBuilder` implementation.
 *
 * @param builder - A registered tool builder
 * @returns A fully materialized `ToolContract`
 */
export async function materializeContract<TContext>(
    builder: ToolBuilder<TContext>,
): Promise<ToolContract> {
    const toolDef = builder.buildToolDefinition();
    const metadata = builder.getActionMetadata();

    // Surface
    const actions: Record<string, ActionContract> = {};
    for (const action of metadata) {
        actions[action.key] = {
            description: action.description,
            destructive: action.destructive,
            idempotent: action.idempotent,
            readOnly: action.readOnly,
            requiredFields: action.requiredFields,
            presenterName: action.presenterName,
            inputSchemaDigest: await sha256(JSON.stringify(action.requiredFields)),
            hasMiddleware: action.hasMiddleware,
        };
    }

    const surface: ToolSurface = {
        name: builder.getName(),
        description: toolDef.description,
        tags: builder.getTags(),
        actions,
        inputSchemaDigest: await sha256(canonicalize(toolDef.inputSchema)),
    };

    // Behavior — extract from action metadata (Presenter introspection accessors)
    const behavior = await materializeBehavior(metadata, builder);

    // Token Economics
    const tokenEconomics = computeTokenEconomics(metadata, behavior);

    // Entitlements — placeholder (real AST analysis in EntitlementScanner)
    const entitlements: HandlerEntitlements = {
        filesystem: false,
        network: false,
        subprocess: false,
        crypto: false,
        codeEvaluation: false,
        raw: [],
    };

    return { surface, behavior, tokenEconomics, entitlements };
}

/**
 * Materialize the behavioral contract from action metadata.
 * @internal
 */
async function materializeBehavior<TContext>(
    metadata: readonly import('../core/types.js').ActionMetadata[],
    builder: ToolBuilder<TContext>,
): Promise<ToolBehavior> {
    // Collect Presenter data from the first action that declares one
    let egressSchemaDigest: string | null = null;
    let systemRulesFingerprint = 'none';
    const affordanceTopology: string[] = [];
    const embeddedPresenters: string[] = [];  

    // Collect unique Presenter metadata across all actions
    const presenterSchemaKeys = new Set<string>();

    for (const action of metadata) {
        if (action.presenterSchemaKeys) {
            for (const key of action.presenterSchemaKeys) {
                presenterSchemaKeys.add(key);
            }
        }
        if (action.presenterHasContextualRules) {
            systemRulesFingerprint = 'dynamic';
        }
    }

    if (presenterSchemaKeys.size > 0) {
        const sortedKeys = [...presenterSchemaKeys].sort();
        egressSchemaDigest = await sha256(sortedKeys.join(','));
    }

    if (systemRulesFingerprint !== 'dynamic' && presenterSchemaKeys.size > 0) {
        systemRulesFingerprint = 'static:' + await sha256([...presenterSchemaKeys].sort().join(','));
    }

    // Middleware chain — extract names from builder
    const middlewareChain: string[] = [];
    // Cannot access private _middlewares, but we can infer from action metadata
    for (const action of metadata) {
        if (action.hasMiddleware) {
            middlewareChain.push(`${action.key}:mw`);
        }
    }

    return {
        egressSchemaDigest,
        systemRulesFingerprint,
        cognitiveGuardrails: {
            agentLimitMax: null, // Extracted per-Presenter in extended materialization
            egressMaxBytes: null,
        },
        middlewareChain,
        stateSyncFingerprint: null, // Injected by StateSyncLayer integration
        concurrencyFingerprint: null,
        affordanceTopology,
        embeddedPresenters,
    };
}

/**
 * Compute token economics profile from contract metadata.
 * @internal
 */
function computeTokenEconomics(
    metadata: readonly import('../core/types.js').ActionMetadata[],
    behavior: ToolBehavior,
): TokenEconomicsProfile {
    // Count schema fields across all Presenters
    let schemaFieldCount = 0;
    const seenPresenters = new Set<string>();

    for (const action of metadata) {
        if (action.presenterName && !seenPresenters.has(action.presenterName)) {
            seenPresenters.add(action.presenterName);
            schemaFieldCount += action.presenterSchemaKeys?.length ?? 0;
        }
    }

    // Unbounded collection risk
    const unboundedCollection = behavior.cognitiveGuardrails.agentLimitMax === null
        && schemaFieldCount > 0;

    // Base overhead estimation (~4 chars per token, GPT heuristic)
    // Rules: ~50 tokens each, UI blocks: ~100 tokens each
    const rulesOverhead = behavior.systemRulesFingerprint !== 'none' ? 50 : 0;
    const affordanceOverhead = behavior.affordanceTopology.length * 20;
    const baseOverheadTokens = rulesOverhead + affordanceOverhead;

    // Inflation risk — derived from guardrails and schema density
    const inflationRisk = classifyInflationRisk(unboundedCollection, schemaFieldCount);

    return {
        schemaFieldCount,
        unboundedCollection,
        baseOverheadTokens,
        inflationRisk,
    };
}

// ============================================================================
// Server-Level Contract Compilation
// ============================================================================

/**
 * Compile contracts for all tools in a registry.
 *
 * @param builders - Iterable of all registered tool builders
 * @returns Record mapping tool names to their materialized contracts
 */
export async function compileContracts<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
): Promise<Record<string, ToolContract>> {
    const contracts: Record<string, ToolContract> = {};
    for (const builder of builders) {
        const contract = await materializeContract(builder);
        contracts[contract.surface.name] = contract;
    }
    return contracts;
}

// ============================================================================
// Internals
// ============================================================================

/** @internal */
function classifyInflationRisk(
    unbounded: boolean,
    fieldCount: number,
): TokenEconomicsProfile['inflationRisk'] {
    if (unbounded && fieldCount > 10) return 'critical';
    if (unbounded) return 'high';
    if (fieldCount > 20) return 'medium';
    return 'low';
}

// ── Re-export shared utilities for public API stability ──
export { sha256, canonicalize } from './canonicalize.js';
