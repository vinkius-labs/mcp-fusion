/**
 * CapabilityLockfile — Behavioral Surface Snapshot
 *
 * Generates a deterministic, human-readable, git-diffable lockfile
 * that captures the complete behavioral surface of an MCP Fusion
 * server at a point in time.
 *
 * **Inspired by**: `yarn.lock`, `package-lock.json`, `Cargo.lock`.
 * Those files snapshot the dependency resolution graph so that every
 * `install` produces the same tree. `mcp-fusion.lock` does the same
 * for the **behavioral surface** — ensuring that every deployment
 * exposes the same tool contracts, cognitive guardrails, entitlements,
 * and token economics that were reviewed and approved.
 *
 * **Why this matters for AI**:
 *
 * An LLM's calibration to a tool server depends on the *behavioral*
 * surface — not just the input schema. If a system rule changes, an
 * affordance link disappears, or a Presenter's egress schema mutates,
 * the LLM may hallucinate or violate requirements. The lockfile makes
 * these invisible changes **visible and auditable** in version control.
 *
 * **Workflow**:
 *
 * ```bash
 * # Generate or update the lockfile
 * fusion lock
 *
 * # CI gate: fail if the lockfile is stale
 * fusion lock --check
 * ```
 *
 * The lockfile is committed alongside the code. Pull request diffs
 * show exactly which behavioral surfaces changed, enabling reviewers
 * to assess AI-facing impact before merge.
 *
 * Pure-function module for generation and verification.
 * Side-effectful I/O is clearly separated.
 *
 * @module
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ToolContract } from './ToolContract.js';
import type { ServerDigest, BehaviorDigestResult } from './BehaviorDigest.js';
import { computeServerDigest } from './BehaviorDigest.js';
import { sha256, canonicalize } from './canonicalize.js';

// ============================================================================
// Lockfile Schema
// ============================================================================

/** Current lockfile format version. */
const LOCKFILE_VERSION = 1 as const;

/** Default lockfile name. */
export const LOCKFILE_NAME = 'mcp-fusion.lock' as const;

/**
 * Root structure of `mcp-fusion.lock`.
 *
 * Designed for human reviewability in pull request diffs.
 * Keys are sorted, values are deterministic.
 */
export interface CapabilityLockfile {
    /** Format version for forward-compatible parsing */
    readonly lockfileVersion: typeof LOCKFILE_VERSION;
    /** MCP server name */
    readonly serverName: string;
    /** MCP Fusion framework version */
    readonly fusionVersion: string;
    /** ISO-8601 generation timestamp */
    readonly generatedAt: string;
    /** SHA-256 over all tool digests — the server's behavioral identity */
    readonly integrityDigest: string;
    /** Per-capability lockfile entries */
    readonly capabilities: LockfileCapabilities;
}

/**
 * Capability sections in the lockfile.
 *
 * Currently supports `tools` and `prompts`. Future sections may
 * include `resources` and `subscriptions`.
 */
export interface LockfileCapabilities {
    /** Per-tool behavioral snapshots, sorted by tool name */
    readonly tools: Readonly<Record<string, LockfileTool>>;
    /** Per-prompt declarative snapshots, sorted by prompt name */
    readonly prompts?: Readonly<Record<string, LockfilePrompt>>;
}

/**
 * Behavioral snapshot for a single tool.
 *
 * Every field is derived from the `ToolContract` — no manual
 * annotation required. The snapshot captures everything an LLM
 * relies on to behave correctly with this tool.
 */
export interface LockfileTool {
    /** SHA-256 integrity digest for this tool's behavioral contract */
    readonly integrityDigest: string;
    /** Declarative surface visible via MCP `tools/list` */
    readonly surface: LockfileToolSurface;
    /** Behavioral contract internals */
    readonly behavior: LockfileToolBehavior;
    /** Token economics profile */
    readonly tokenEconomics: LockfileTokenEconomics;
    /** Handler entitlements (I/O capabilities) */
    readonly entitlements: LockfileEntitlements;
}

/** Surface section of a lockfile tool entry. */
export interface LockfileToolSurface {
    /** Tool description */
    readonly description: string | null;
    /** Sorted action keys */
    readonly actions: readonly string[];
    /** SHA-256 of the canonical input schema */
    readonly inputSchemaDigest: string;
    /** Sorted tags */
    readonly tags: readonly string[];
}

/** Behavior section of a lockfile tool entry. */
export interface LockfileToolBehavior {
    /** Presenter egress schema digest (null if no Presenter) */
    readonly egressSchemaDigest: string | null;
    /** System rules fingerprint */
    readonly systemRulesFingerprint: string;
    /** Actions marked as destructive */
    readonly destructiveActions: readonly string[];
    /** Actions marked as read-only */
    readonly readOnlyActions: readonly string[];
    /** Named middleware chain */
    readonly middlewareChain: readonly string[];
    /** Affordance topology — suggested next-action tool names */
    readonly affordanceTopology: readonly string[];
    /** Cognitive guardrails */
    readonly cognitiveGuardrails: {
        readonly agentLimitMax: number | null;
        readonly egressMaxBytes: number | null;
    };
}

/** Token economics section of a lockfile tool entry. */
export interface LockfileTokenEconomics {
    /** Cognitive overload risk classification */
    readonly inflationRisk: string;
    /** Number of fields in the egress schema */
    readonly schemaFieldCount: number;
    /** Whether output collections are unbounded */
    readonly unboundedCollection: boolean;
}

/** Entitlements section of a lockfile tool entry. */
export interface LockfileEntitlements {
    /** Filesystem I/O */
    readonly filesystem: boolean;
    /** Network I/O */
    readonly network: boolean;
    /** Subprocess execution */
    readonly subprocess: boolean;
    /** Cryptographic operations */
    readonly crypto: boolean;
    /** Dynamic code evaluation (eval, Function, vm) */
    readonly codeEvaluation: boolean;
}

// ============================================================================
// Prompt Lockfile Types
// ============================================================================

/**
 * Duck-typed interface for prompt builders.
 *
 * Decouples the lockfile module from the Prompt Engine implementation.
 * Any object implementing these methods can be snapshotted.
 */
export interface PromptBuilderLike {
    getName(): string;
    getDescription(): string | undefined;
    getTags(): string[];
    hasMiddleware(): boolean;
    getHydrationTimeout(): number | undefined;
    buildPromptDefinition(): {
        name: string;
        title?: string;
        description?: string;
        icons?: { light?: string; dark?: string };
        arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    };
}

/**
 * Behavioral snapshot for a single prompt.
 *
 * Captures the declarative surface that an LLM client relies on
 * to offer the correct slash-command palette. Changes to arguments,
 * descriptions, or middleware affect how the LLM invokes the prompt.
 */
export interface LockfilePrompt {
    /** SHA-256 integrity digest for this prompt's declarative contract */
    readonly integrityDigest: string;
    /** Human-readable description */
    readonly description: string | null;
    /** Display title (MCP BaseMetadata.title) */
    readonly title: string | null;
    /** Sorted capability tags */
    readonly tags: readonly string[];
    /** Argument definitions from the Zod schema */
    readonly arguments: readonly LockfilePromptArgument[];
    /** SHA-256 of canonical arguments JSON */
    readonly argumentsDigest: string;
    /** Whether middleware is attached to this prompt */
    readonly hasMiddleware: boolean;
    /** Hydration timeout in ms, or null if unlimited */
    readonly hydrationTimeout: number | null;
}

/** A single prompt argument definition. */
export interface LockfilePromptArgument {
    /** Argument name */
    readonly name: string;
    /** Human-readable description */
    readonly description: string | null;
    /** Whether this argument is required */
    readonly required: boolean;
}

// ============================================================================
// Lockfile Generation (Pure)
// ============================================================================

/**
 * Options for lockfile generation beyond tools.
 */
export interface GenerateLockfileOptions {
    /** Prompt builders to snapshot alongside tools */
    readonly prompts?: ReadonlyArray<PromptBuilderLike>;
}

/**
 * Generate a `CapabilityLockfile` from compiled tool contracts
 * and (optionally) prompt builders.
 *
 * This is a **pure function**: given the same contracts and metadata,
 * it always produces the same lockfile (modulo `generatedAt` timestamp).
 *
 * @param serverName    - MCP server name
 * @param contracts     - Record of tool name → materialized contract
 * @param fusionVersion - MCP Fusion version string
 * @param options       - Optional: prompt builders to include
 * @returns A fully materialized lockfile
 */
export function generateLockfile(
    serverName: string,
    contracts: Readonly<Record<string, ToolContract>>,
    fusionVersion: string,
    options?: GenerateLockfileOptions,
): CapabilityLockfile {
    const serverDigest = computeServerDigest(contracts);

    const sortedNames = Object.keys(contracts).sort();
    const tools: Record<string, LockfileTool> = {};

    for (const name of sortedNames) {
        tools[name] = snapshotTool(contracts[name]!, serverDigest.tools[name]!);
    }

    // ── Prompt Snapshots ─────────────────────────────────
    const promptBuilders = options?.prompts ?? [];
    let prompts: Record<string, LockfilePrompt> | undefined;
    const promptDigestParts: string[] = [];

    if (promptBuilders.length > 0) {
        prompts = {};
        const sortedPromptNames = promptBuilders
            .map(b => b.getName())
            .sort();

        for (const name of sortedPromptNames) {
            const builder = promptBuilders.find(b => b.getName() === name)!;
            const snapshot = snapshotPrompt(builder);
            prompts[name] = snapshot;
            promptDigestParts.push(`${name}:${snapshot.integrityDigest}`);
        }
    }

    // ── Integrity Digest (tools + prompts) ───────────────
    const digestInput = promptDigestParts.length > 0
        ? `${serverDigest.digest}\n---prompts---\n${promptDigestParts.join('\n')}`
        : serverDigest.digest;
    const integrityDigest = promptDigestParts.length > 0
        ? sha256(digestInput)
        : serverDigest.digest;

    const capabilities: LockfileCapabilities = prompts
        ? { tools, prompts }
        : { tools };

    return {
        lockfileVersion: LOCKFILE_VERSION,
        serverName,
        fusionVersion,
        generatedAt: new Date().toISOString(),
        integrityDigest: `sha256:${integrityDigest}`,
        capabilities,
    };
}

/**
 * Serialize a lockfile to a deterministic JSON string.
 *
 * Uses sorted keys and 2-space indentation for git-friendly diffs.
 * The output is canonical — identical lockfiles produce identical strings.
 *
 * @param lockfile - The lockfile to serialize
 * @returns Deterministic JSON string with trailing newline
 */
export function serializeLockfile(lockfile: CapabilityLockfile): string {
    return JSON.stringify(lockfile, (_key, value) => {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value as Record<string, unknown>)
                .sort()
                .reduce<Record<string, unknown>>((sorted, k) => {
                    sorted[k] = (value as Record<string, unknown>)[k];
                    return sorted;
                }, {});
        }
        return value;
    }, 2) + '\n';
}

// ============================================================================
// Lockfile Verification (Pure)
// ============================================================================

/**
 * Result of a lockfile verification check.
 */
export interface LockfileCheckResult {
    /** Whether the lockfile matches the current server surface */
    readonly ok: boolean;
    /** Human-readable status message */
    readonly message: string;
    /** Added tools since lockfile was generated */
    readonly added: readonly string[];
    /** Removed tools since lockfile was generated */
    readonly removed: readonly string[];
    /** Tools whose behavioral digest changed */
    readonly changed: readonly string[];
    /** Tools that match the lockfile exactly */
    readonly unchanged: readonly string[];
    /** Added prompts since lockfile was generated */
    readonly addedPrompts: readonly string[];
    /** Removed prompts since lockfile was generated */
    readonly removedPrompts: readonly string[];
    /** Prompts whose declarative digest changed */
    readonly changedPrompts: readonly string[];
    /** Prompts that match the lockfile exactly */
    readonly unchangedPrompts: readonly string[];
}

/**
 * Verify that a lockfile matches the current server contracts and prompts.
 *
 * This is the **CI gate**: `fusion lock --check` calls this function
 * and exits non-zero if the lockfile is stale.
 *
 * @param lockfile  - Previously generated lockfile (from disk)
 * @param contracts - Current compiled tool contracts (from code)
 * @param options   - Optional: prompt builders for prompt verification
 * @returns Check result with per-tool and per-prompt diff details
 */
export function checkLockfile(
    lockfile: CapabilityLockfile,
    contracts: Readonly<Record<string, ToolContract>>,
    options?: GenerateLockfileOptions,
): LockfileCheckResult {
    // Regenerate a fresh lockfile to compare digests
    const fresh = generateLockfile(lockfile.serverName, contracts, lockfile.fusionVersion, options);

    // Fast path: integrity digest matches → everything is identical
    if (lockfile.integrityDigest === fresh.integrityDigest) {
        return {
            ok: true,
            message: 'Lockfile is up to date.',
            added: [],
            removed: [],
            changed: [],
            unchanged: Object.keys(contracts).sort(),
            addedPrompts: [],
            removedPrompts: [],
            changedPrompts: [],
            unchangedPrompts: Object.keys(fresh.capabilities.prompts ?? {}).sort(),
        };
    }

    // Slow path: per-tool comparison
    const lockedToolNames = new Set(Object.keys(lockfile.capabilities.tools));
    const currentToolNames = new Set(Object.keys(contracts));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];

    for (const name of currentToolNames) {
        if (!lockedToolNames.has(name)) {
            added.push(name);
        } else {
            const lockedDigest = lockfile.capabilities.tools[name]!.integrityDigest;
            const freshDigest = fresh.capabilities.tools[name]!.integrityDigest;
            if (lockedDigest === freshDigest) {
                unchanged.push(name);
            } else {
                changed.push(name);
            }
        }
    }

    for (const name of lockedToolNames) {
        if (!currentToolNames.has(name)) {
            removed.push(name);
        }
    }

    // ── Per-prompt comparison ────────────────────────────
    const lockedPrompts = lockfile.capabilities.prompts ?? {};
    const freshPrompts = fresh.capabilities.prompts ?? {};
    const lockedPromptNames = new Set(Object.keys(lockedPrompts));
    const currentPromptNames = new Set(Object.keys(freshPrompts));

    const addedPrompts: string[] = [];
    const removedPrompts: string[] = [];
    const changedPrompts: string[] = [];
    const unchangedPrompts: string[] = [];

    for (const name of currentPromptNames) {
        if (!lockedPromptNames.has(name)) {
            addedPrompts.push(name);
        } else {
            const lockedDigest = lockedPrompts[name]!.integrityDigest;
            const freshDigest = freshPrompts[name]!.integrityDigest;
            if (lockedDigest === freshDigest) {
                unchangedPrompts.push(name);
            } else {
                changedPrompts.push(name);
            }
        }
    }

    for (const name of lockedPromptNames) {
        if (!currentPromptNames.has(name)) {
            removedPrompts.push(name);
        }
    }

    // ── Build message ────────────────────────────────────
    const driftParts: string[] = [];
    if (added.length > 0) driftParts.push(`tools added: [${added.join(', ')}]`);
    if (removed.length > 0) driftParts.push(`tools removed: [${removed.join(', ')}]`);
    if (changed.length > 0) driftParts.push(`tools changed: [${changed.join(', ')}]`);
    if (addedPrompts.length > 0) driftParts.push(`prompts added: [${addedPrompts.join(', ')}]`);
    if (removedPrompts.length > 0) driftParts.push(`prompts removed: [${removedPrompts.join(', ')}]`);
    if (changedPrompts.length > 0) driftParts.push(`prompts changed: [${changedPrompts.join(', ')}]`);

    return {
        ok: false,
        message: `Lockfile is stale. ${driftParts.join('; ')}. Run \`fusion lock\` to update.`,
        added,
        removed,
        changed,
        unchanged,
        addedPrompts,
        removedPrompts,
        changedPrompts,
        unchangedPrompts,
    };
}

/**
 * Parse and validate a lockfile JSON string.
 *
 * @param content - Raw JSON string from `mcp-fusion.lock`
 * @returns Parsed lockfile, or null if invalid
 */
export function parseLockfile(content: string): CapabilityLockfile | null {
    try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (parsed['lockfileVersion'] !== LOCKFILE_VERSION) return null;
        if (typeof parsed['serverName'] !== 'string') return null;
        if (typeof parsed['integrityDigest'] !== 'string') return null;
        if (typeof parsed['generatedAt'] !== 'string') return null;
        if (typeof parsed['fusionVersion'] !== 'string') return null;
        if (!parsed['capabilities'] || typeof parsed['capabilities'] !== 'object') return null;
        const caps = parsed['capabilities'] as Record<string, unknown>;
        if (!caps['tools'] || typeof caps['tools'] !== 'object') return null;
        return parsed as unknown as CapabilityLockfile;
    } catch {
        return null;
    }
}

// ============================================================================
// Persistence (Side-effectful — clearly separated)
// ============================================================================

/**
 * Write a lockfile to disk.
 *
 * @param lockfile    - The lockfile to persist
 * @param projectRoot - Project root directory
 */
export async function writeLockfile(
    lockfile: CapabilityLockfile,
    projectRoot: string,
): Promise<void> {
    const filePath = resolve(projectRoot, LOCKFILE_NAME);
    await writeFile(filePath, serializeLockfile(lockfile), 'utf-8');
}

/**
 * Read a lockfile from disk.
 *
 * @param projectRoot - Project root directory
 * @returns Parsed lockfile, or null if not found / invalid
 */
export async function readLockfile(
    projectRoot: string,
): Promise<CapabilityLockfile | null> {
    const filePath = resolve(projectRoot, LOCKFILE_NAME);
    try {
        const content = await readFile(filePath, 'utf-8');
        return parseLockfile(content);
    } catch {
        return null;
    }
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Snapshot a single tool's contract into lockfile format.
 * @internal
 */
function snapshotTool(
    contract: ToolContract,
    digest: BehaviorDigestResult,
): LockfileTool {
    const actionKeys = Object.keys(contract.surface.actions).sort();

    const destructiveActions = actionKeys.filter(
        key => contract.surface.actions[key]!.destructive,
    );
    const readOnlyActions = actionKeys.filter(
        key => contract.surface.actions[key]!.readOnly,
    );

    return {
        integrityDigest: `sha256:${digest.digest}`,
        surface: {
            description: contract.surface.description ?? null,
            actions: actionKeys,
            inputSchemaDigest: `sha256:${contract.surface.inputSchemaDigest}`,
            tags: [...contract.surface.tags].sort(),
        },
        behavior: {
            egressSchemaDigest: contract.behavior.egressSchemaDigest
                ? `sha256:${contract.behavior.egressSchemaDigest}`
                : null,
            systemRulesFingerprint: contract.behavior.systemRulesFingerprint,
            destructiveActions,
            readOnlyActions,
            middlewareChain: [...contract.behavior.middlewareChain],
            affordanceTopology: [...contract.behavior.affordanceTopology],
            cognitiveGuardrails: {
                agentLimitMax: contract.behavior.cognitiveGuardrails.agentLimitMax,
                egressMaxBytes: contract.behavior.cognitiveGuardrails.egressMaxBytes,
            },
        },
        tokenEconomics: {
            inflationRisk: contract.tokenEconomics.inflationRisk,
            schemaFieldCount: contract.tokenEconomics.schemaFieldCount,
            unboundedCollection: contract.tokenEconomics.unboundedCollection,
        },
        entitlements: {
            filesystem: contract.entitlements.filesystem,
            network: contract.entitlements.network,
            subprocess: contract.entitlements.subprocess,
            crypto: contract.entitlements.crypto,
            codeEvaluation: contract.entitlements.codeEvaluation,
        },
    };
}

/**
 * Snapshot a single prompt builder into lockfile format.
 *
 * Extracts all declarative metadata and computes a SHA-256 digest
 * over the canonical representation.
 *
 * @internal
 */
function snapshotPrompt(builder: PromptBuilderLike): LockfilePrompt {
    const def = builder.buildPromptDefinition();
    const tags = [...builder.getTags()].sort();
    const hasMiddleware = builder.hasMiddleware();
    const hydrationTimeout = builder.getHydrationTimeout() ?? null;

    // Normalize arguments for deterministic serialization
    const args: LockfilePromptArgument[] = (def.arguments ?? [])
        .map(a => ({
            name: a.name,
            description: a.description ?? null,
            required: a.required ?? false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const argumentsDigest = `sha256:${sha256(canonicalize(args))}`;

    // Compute integrity digest over all declarative fields
    const surface = {
        name: def.name,
        description: def.description ?? null,
        title: def.title ?? null,
        tags,
        arguments: args,
        hasMiddleware,
        hydrationTimeout,
    };
    const integrityDigest = `sha256:${sha256(canonicalize(surface))}`;

    return {
        integrityDigest,
        description: def.description ?? null,
        title: def.title ?? null,
        tags,
        arguments: args,
        argumentsDigest,
        hasMiddleware,
        hydrationTimeout,
    };
}
