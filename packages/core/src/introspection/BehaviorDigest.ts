/**
 * BehaviorDigest — Content-Addressed Behavioral Fingerprinting
 *
 * Produces a single SHA-256 digest that captures the complete
 * behavioral identity of a `ToolContract`. When this digest changes,
 * the tool's behavior has changed — even if the input schema,
 * tool name, and description remain identical.
 *
 * This is the foundation for the Capability Lockfile:
 * `mcp-fusion.lock` stores per-tool digests, and any change in
 * any digest triggers a lockfile update.
 *
 * **Content-addressed**: Two tools with identical behavior will
 * produce identical digests, regardless of creation order or runtime.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import type { ToolContract } from './ToolContract.js';
import { sha256, canonicalize } from './canonicalize.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Content-addressed digest of a tool's behavioral contract.
 *
 * The `digest` field is a SHA-256 over the canonical form of
 * all behavioral fields. The `components` field provides
 * per-section digests for granular change detection.
 */
export interface BehaviorDigestResult {
    /** Overall SHA-256 over all behavioral components */
    readonly digest: string;
    /** Per-section component digests */
    readonly components: DigestComponents;
    /** ISO-8601 timestamp of when the digest was computed */
    readonly computedAt: string;
    /** Tool name for correlation */
    readonly toolName: string;
}

/**
 * Per-section component digests for granular tracking.
 *
 * Each component is a SHA-256 of the canonical form of that
 * section. When the overall digest changes, comparing components
 * reveals exactly which section changed.
 */
export interface DigestComponents {
    /** SHA-256 of input surface (schema, actions) */
    readonly surface: string;
    /** SHA-256 of behavioral contract (egress, rules, guardrails) */
    readonly behavior: string;
    /** SHA-256 of token economics profile */
    readonly tokenEconomics: string;
    /** SHA-256 of handler entitlements */
    readonly entitlements: string;
}

/**
 * Server-level digest that covers all tools.
 *
 * Used as the content address for Capability Lockfile entries.
 */
export interface ServerDigest {
    /** SHA-256 over all per-tool digests (sorted by tool name) */
    readonly digest: string;
    /** Per-tool digests, keyed by tool name */
    readonly tools: Record<string, BehaviorDigestResult>;
    /** ISO-8601 timestamp */
    readonly computedAt: string;
}

// ============================================================================
// Digest Computation
// ============================================================================

/**
 * Compute the behavioral digest for a single tool contract.
 *
 * The digest is deterministic: same contract → same digest.
 * It uses canonical JSON serialization (sorted keys) to ensure
 * platform-independent consistency.
 *
 * @param contract - The materialized tool contract
 * @returns Content-addressed digest with per-section components
 */
export function computeDigest(contract: ToolContract): BehaviorDigestResult {
    const surfaceHash = hashSection({
        name: contract.surface.name,
        description: contract.surface.description,
        tags: [...contract.surface.tags].sort(),
        inputSchemaDigest: contract.surface.inputSchemaDigest,
        actions: sortedActions(contract),
    });

    const behaviorHash = hashSection({
        egressSchemaDigest: contract.behavior.egressSchemaDigest,
        systemRulesFingerprint: contract.behavior.systemRulesFingerprint,
        cognitiveGuardrails: contract.behavior.cognitiveGuardrails,
        middlewareChain: contract.behavior.middlewareChain,
        stateSyncFingerprint: contract.behavior.stateSyncFingerprint,
        concurrencyFingerprint: contract.behavior.concurrencyFingerprint,
        affordanceTopology: [...contract.behavior.affordanceTopology],
        embeddedPresenters: [...contract.behavior.embeddedPresenters],
    });

    const tokenEconomicsHash = hashSection({
        schemaFieldCount: contract.tokenEconomics.schemaFieldCount,
        unboundedCollection: contract.tokenEconomics.unboundedCollection,
        baseOverheadTokens: contract.tokenEconomics.baseOverheadTokens,
        inflationRisk: contract.tokenEconomics.inflationRisk,
    });

    const entitlementsHash = hashSection({
        filesystem: contract.entitlements.filesystem,
        network: contract.entitlements.network,
        subprocess: contract.entitlements.subprocess,
        crypto: contract.entitlements.crypto,
        codeEvaluation: contract.entitlements.codeEvaluation,
        raw: [...contract.entitlements.raw].sort(),
    });

    // Composite digest over all components
    const compositeInput = [surfaceHash, behaviorHash, tokenEconomicsHash, entitlementsHash].join(':');
    const digest = sha256(compositeInput);

    return {
        digest,
        components: {
            surface: surfaceHash,
            behavior: behaviorHash,
            tokenEconomics: tokenEconomicsHash,
            entitlements: entitlementsHash,
        },
        computedAt: new Date().toISOString(),
        toolName: contract.surface.name,
    };
}

/**
 * Compute a server-level digest covering all tools.
 *
 * The server digest is the SHA-256 over all per-tool digests,
 * sorted by tool name for determinism.
 *
 * @param contracts - Record of tool name → contract
 * @returns Server-level content-addressed digest
 */
export function computeServerDigest(
    contracts: Record<string, ToolContract>,
): ServerDigest {
    const tools: Record<string, BehaviorDigestResult> = {};
    const sortedNames = Object.keys(contracts).sort();

    const perToolDigests: string[] = [];
    for (const name of sortedNames) {
        const result = computeDigest(contracts[name]!);
        tools[name] = result;
        perToolDigests.push(`${name}:${result.digest}`);
    }

    const digest = sha256(perToolDigests.join('\n'));

    return {
        digest,
        tools,
        computedAt: new Date().toISOString(),
    };
}

/**
 * Compare two server digests and return which tools changed.
 *
 * @param before - Previous server digest
 * @param after  - Current server digest
 * @returns Object with added, removed, and changed tool names
 */
export function compareServerDigests(
    before: ServerDigest,
    after: ServerDigest,
): DigestComparison {
    const beforeNames = new Set(Object.keys(before.tools));
    const afterNames = new Set(Object.keys(after.tools));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];

    for (const name of afterNames) {
        if (!beforeNames.has(name)) {
            added.push(name);
        } else if (before.tools[name]!.digest !== after.tools[name]!.digest) {
            changed.push(name);
        } else {
            unchanged.push(name);
        }
    }

    for (const name of beforeNames) {
        if (!afterNames.has(name)) {
            removed.push(name);
        }
    }

    return {
        serverDigestChanged: before.digest !== after.digest,
        added,
        removed,
        changed,
        unchanged,
    };
}

/**
 * Result of comparing two server digests.
 */
export interface DigestComparison {
    /** Whether the overall server digest changed */
    readonly serverDigestChanged: boolean;
    /** Tools that were added */
    readonly added: readonly string[];
    /** Tools that were removed */
    readonly removed: readonly string[];
    /** Tools whose behavioral digest changed */
    readonly changed: readonly string[];
    /** Tools whose behavioral digest is identical */
    readonly unchanged: readonly string[];
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Sort actions by key for deterministic hashing.
 * @internal
 */
function sortedActions(contract: ToolContract): Record<string, unknown>[] {
    return Object.keys(contract.surface.actions)
        .sort()
        .map(key => ({
            key,
            ...contract.surface.actions[key],
        }));
}

/**
 * Hash a section object using canonical JSON serialization.
 * @internal
 */
function hashSection(obj: unknown): string {
    return sha256(canonicalize(obj));
}
