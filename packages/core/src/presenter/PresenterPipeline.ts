/**
 * PresenterPipeline — Decomposed Make Pipeline
 *
 * Extracted from `Presenter.make()` to uphold SRP and enable isolated testing.
 * Each step is a pure function that receives a `PresenterSnapshot` (read-only
 * config) and produces side-effects on a `ResponseBuilder`.
 *
 * The `executePipeline()` orchestrator replaces the inline logic previously
 * in `Presenter.make()`, maintaining the exact same behavior and output.
 *
 * @internal
 * @module
 */
import { type ZodTypeAny, ZodError } from 'zod';
import { ResponseBuilder } from './ResponseBuilder.js';
import { type UiBlock } from './ui.js';
import { type ActionSuggestion } from './Presenter.js';
import { PresenterValidationError } from './PresenterValidationError.js';
import { applySelectFilter } from './SelectUtils.js';
import { compileRedactor, type RedactConfig, type RedactFn } from './RedactEngine.js';
import { type StringifyFn } from '../core/serialization/JsonSerializer.js';
import { type Presenter } from './Presenter.js';

// ── Snapshot Interface ──────────────────────────────────

/** Static rules (string array) OR dynamic rules with context (function) */
export type RulesConfig<T> = readonly string[] | ((data: T, ctx?: unknown) => (string | null)[]);

/** Collection-level rules — static or dynamic */
export type CollectionRulesFn<T> = readonly string[] | ((items: T[], ctx?: unknown) => (string | null)[]);

/** UI blocks callback — with optional context */
export type ItemUiBlocksFn<T> = (item: T, ctx?: unknown) => (UiBlock | null)[];

/** Collection UI blocks callback — with optional context */
export type CollectionUiBlocksFn<T> = (items: T[], ctx?: unknown) => (UiBlock | null)[];

/** Suggest actions callback — with optional context */
export type SuggestActionsFn<T> = (data: T, ctx?: unknown) => ActionSuggestion[];

/** Collection-level suggest actions callback */
export type CollectionSuggestActionsFn<T> = (items: T[], ctx?: unknown) => (ActionSuggestion | null)[];

/** Agent limit configuration */
export interface AgentLimitConfig {
    readonly max: number;
    readonly onTruncate: (omittedCount: number) => UiBlock;
}

/** An embedded child Presenter for relational composition */
export interface EmbedEntry {
    readonly key: string;
    readonly presenter: Presenter<unknown>;
}

/**
 * Read-only snapshot of Presenter configuration for the pipeline.
 *
 * Created by `Presenter._toSnapshot()` on each `make()` call.
 * Avoids exposing private state while enabling standalone step functions.
 *
 * @typeParam T - The validated output type
 * @internal
 */
export interface PresenterSnapshot<T> {
    readonly name: string;
    readonly schema?: ZodTypeAny | undefined;
    readonly rules: RulesConfig<T>;
    readonly collectionRules: CollectionRulesFn<T>;
    readonly itemUiBlocks?: ItemUiBlocksFn<T> | undefined;
    readonly collectionUiBlocks?: CollectionUiBlocksFn<T> | undefined;
    readonly suggestActions?: SuggestActionsFn<T> | undefined;
    readonly collectionSuggestActions?: CollectionSuggestActionsFn<T> | undefined;
    readonly agentLimit?: AgentLimitConfig | undefined;
    readonly embeds: readonly EmbedEntry[];
    readonly redactConfig?: RedactConfig | undefined;
    readonly compiledStringify?: StringifyFn | undefined;
    /** Mutable: may be lazily compiled */
    compiledRedactor?: RedactFn | undefined;
    /** Write-back callback to persist lazy-compiled redactor to the Presenter instance */
    readonly writeBackRedactor?: (fn: RedactFn) => void;
}

// ── Step Functions ──────────────────────────────────────

/**
 * Step 0: Cognitive Guardrails — truncate array by agentLimit.
 *
 * If the data is an array larger than the configured limit, it is sliced
 * and a truncation UiBlock is returned for insertion.
 *
 * @returns Potentially truncated data + optional truncation UiBlock
 * @internal
 */
export function stepTruncate<T>(
    data: T | T[],
    isArray: boolean,
    snapshot: PresenterSnapshot<T>,
): { data: T | T[]; truncationBlock?: UiBlock | undefined } {
    if (isArray && snapshot.agentLimit && (data as T[]).length > snapshot.agentLimit.max) {
        const fullLength = (data as T[]).length;
        const omitted = fullLength - snapshot.agentLimit.max;
        return {
            data: (data as T[]).slice(0, snapshot.agentLimit.max) as T[],
            truncationBlock: snapshot.agentLimit.onTruncate(omitted),
        };
    }
    return { data };
}

/**
 * Step 1: Validate data through the Zod schema (if configured).
 * For arrays, each item is validated independently.
 *
 * @throws {PresenterValidationError} on schema mismatch
 * @internal
 */
export function stepValidate<T>(
    data: T | T[],
    isArray: boolean,
    snapshot: PresenterSnapshot<T>,
): T | T[] {
    if (!snapshot.schema) return data;

    try {
        if (isArray) {
            // zod v4: parse() returns `unknown` — cast back to T to satisfy the return type
            return (data as T[]).map(item => snapshot.schema!.parse(item) as T);
        }
        return snapshot.schema.parse(data) as T;
    } catch (err) {
        if (err instanceof ZodError) {
            throw new PresenterValidationError(snapshot.name, err);
        }
        throw err;
    }
}

/**
 * Step 2: Apply PII redaction to wire-facing data.
 * Creates a deep clone to preserve original data for UI/rules.
 *
 * @internal
 */
export function stepRedact<T>(
    data: T | T[],
    isArray: boolean,
    snapshot: PresenterSnapshot<T>,
): T | T[] {
    // Lazy recompilation: if redactPII was called before fast-redact loaded
    if (!snapshot.compiledRedactor && snapshot.redactConfig) {
        snapshot.compiledRedactor = compileRedactor(snapshot.redactConfig);
        // Propagate back to Presenter so subsequent make() calls reuse it
        if (snapshot.compiledRedactor && snapshot.writeBackRedactor) {
            snapshot.writeBackRedactor(snapshot.compiledRedactor);
        }
        if (!snapshot.compiledRedactor) {
            console.warn(
                `[mcpfusion] Presenter "${snapshot.name}": PII redaction configured but fast-redact is not available. ` +
                `Data will pass through WITHOUT redaction. Ensure initMCPFusion() completes before .make() is called, ` +
                `or install fast-redact as a dependency.`,
            );
        }
    }
    if (!snapshot.compiledRedactor) return data;

    if (isArray) {
        return (data as T[]).map(item => snapshot.compiledRedactor!(item) as T);
    }

    return snapshot.compiledRedactor(data) as T;
}

/**
 * Step 3: Generate and attach UI blocks to the response builder.
 * Auto-detects single vs collection. Filters `null` blocks.
 *
 * @internal
 */
export function stepUiBlocks<T>(
    builder: ResponseBuilder,
    data: T | T[],
    isArray: boolean,
    snapshot: PresenterSnapshot<T>,
    ctx?: unknown,
): void {
    if (isArray && snapshot.collectionUiBlocks) {
        const blocks = snapshot.collectionUiBlocks(data as T[], ctx).filter(Boolean) as UiBlock[];
        if (blocks.length > 0) builder.uiBlocks(blocks);
    } else if (!isArray && snapshot.itemUiBlocks) {
        const blocks = snapshot.itemUiBlocks(data as T, ctx).filter(Boolean) as UiBlock[];
        if (blocks.length > 0) builder.uiBlocks(blocks);
    }
}

/**
 * Step 4: Resolve and attach domain rules to the response builder.
 * Supports both static arrays and dynamic context-aware functions.
 *
 * For collections: also evaluates `collectionRules` (if defined) and
 * merges them after per-item rules.
 *
 * @internal
 */
export function stepRules<T>(
    builder: ResponseBuilder,
    data: T | T[],
    isArray: boolean,
    snapshot: PresenterSnapshot<T>,
    ctx?: unknown,
): void {
    // Per-item rules
    if (typeof snapshot.rules === 'function') {
        const singleData = isArray ? (data as T[])[0] : data as T;
        if (singleData !== undefined) {
            const resolved = snapshot.rules(singleData, ctx)
                .filter((r): r is string => r !== null);
            if (resolved.length > 0) builder.systemRules(resolved);
        }
    } else if (snapshot.rules.length > 0) {
        builder.systemRules(snapshot.rules);
    }

    // Collection-level rules (additive — appended after per-item rules)
    const hasCollectionRules = typeof snapshot.collectionRules === 'function'
        || snapshot.collectionRules.length > 0;

    if (isArray && hasCollectionRules) {
        const items = data as T[];
        if (typeof snapshot.collectionRules === 'function') {
            const resolved = snapshot.collectionRules(items, ctx)
                .filter((r): r is string => r !== null);
            if (resolved.length > 0) builder.systemRules(resolved);
        } else if (snapshot.collectionRules.length > 0) {
            builder.systemRules(snapshot.collectionRules);
        }
    }
}

/**
 * Step 5: Evaluate and attach action suggestions to the response.
 *
 * For collections: uses `collectionSuggestActions` if defined,
 * otherwise falls back to per-item evaluation on the first item.
 *
 * @internal
 */
export function stepSuggestions<T>(
    builder: ResponseBuilder,
    data: T | T[],
    isArray: boolean,
    snapshot: PresenterSnapshot<T>,
    ctx?: unknown,
): void {
    // Collection-level suggestions (preferred for arrays)
    if (isArray && snapshot.collectionSuggestActions) {
        const items = data as T[];
        if (items.length === 0) return;
        const suggestions = snapshot.collectionSuggestActions(items, ctx)
            .filter((s): s is ActionSuggestion => s !== null);
        if (suggestions.length > 0) {
            builder.systemHint(suggestions);
        }
        return;
    }

    // Per-item fallback (single item or first item of array)
    if (!snapshot.suggestActions) return;
    const singleData = isArray ? (data as T[])[0] : data as T;
    if (singleData === undefined) return;

    const suggestions = snapshot.suggestActions(singleData, ctx);
    if (suggestions.length > 0) {
        builder.systemHint(suggestions);
    }
}

/**
 * Step 6: Process embedded child Presenters for nested relational data.
 * Merges child UI blocks and rules into the parent builder.
 *
 * For collections: iterates all array items. Rules are deduplicated
 * via a Set to avoid repetition. UI blocks are emitted only for the
 * first item to prevent context window explosion.
 *
 * @internal
 */
export function stepEmbeds<T>(
    builder: ResponseBuilder,
    data: T | T[],
    isArray: boolean,
    snapshot: PresenterSnapshot<T>,
    ctx?: unknown,
): void {
    if (snapshot.embeds.length === 0) return;

    const items = isArray
        ? (data as T[]).filter((item): item is T => item !== undefined && typeof item === 'object')
        : [data as T].filter((item): item is T => item !== undefined && typeof item === 'object');

    if (items.length === 0) return;

    // Track which rule blocks we've already emitted (dedup for arrays)
    const emittedRules = new Set<string>();

    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx]!;

        for (const embed of snapshot.embeds) {
            const nestedData = (item as Record<string, unknown>)[embed.key];
            if (nestedData === undefined || nestedData === null) continue;

            const childBuilder = embed.presenter.make(nestedData, ctx);
            const childResponse = childBuilder.build();

            // Skip the first block (data) — parent already has it
            for (let i = 1; i < childResponse.content.length; i++) {
                const blockText = childResponse.content[i]!.text;

                // For arrays: deduplicate rule/hint blocks, emit UI only for first item
                if (isArray && itemIdx > 0) {
                    if (emittedRules.has(blockText)) continue;
                    if (blockText.includes('<ui_passthrough')) continue;
                }

                emittedRules.add(blockText);
                builder.rawBlock(blockText);
            }
        }
    }
}

// ── Pipeline Orchestrator ───────────────────────────────

/**
 * Result of the extended pipeline that returns validated data alongside
 * the builder. Used by `Presenter.makeAsync()` to avoid double
 * truncation/validation.
 *
 * @internal
 */
export interface PipelineResult<T> {
    readonly builder: ResponseBuilder;
    /** The truncated + validated data (FULL, before _select filter). */
    readonly validated: T | T[];
    /** Whether the original input was an array. */
    readonly isArray: boolean;
}

/**
 * Execute the full Presenter pipeline.
 *
 * Orchestrates: truncate → validate → embed → render UI → attach rules
 * → suggest actions → **Late Guillotine** (`_select` filter).
 *
 * @param data - Raw data from handler
 * @param snapshot - Read-only configuration snapshot
 * @param ctx - Optional request context
 * @param selectFields - Optional field names for context window optimization
 * @returns A fully-composed ResponseBuilder
 * @internal
 */
export function executePipeline<T>(
    data: T | T[],
    snapshot: PresenterSnapshot<T>,
    ctx?: unknown,
    selectFields?: string[],
): ResponseBuilder {
    return executePipelineWithData(data, snapshot, ctx, selectFields).builder;
}

/**
 * Execute the full Presenter pipeline and return the validated data.
 *
 * Extended version of `executePipeline()` that also returns the
 * truncated+validated data for reuse by `makeAsync()`, ensuring
 * each Zod schema runs exactly once per call — critical for
 * `.transform()` schemas with non-idempotent logic.
 *
 * @param data - Raw data from handler
 * @param snapshot - Read-only configuration snapshot
 * @param ctx - Optional request context
 * @param selectFields - Optional field names for context window optimization
 * @returns A {@link PipelineResult} with both builder and validated data
 * @internal
 */
export function executePipelineWithData<T>(
    data: T | T[],
    snapshot: PresenterSnapshot<T>,
    ctx?: unknown,
    selectFields?: string[],
): PipelineResult<T> {
    const isArray = Array.isArray(data);

    // Step 0: Cognitive Guardrails — truncate if needed
    const truncated = stepTruncate(data, isArray, snapshot);
    data = truncated.data;

    // Step 1: Process embedded child Presenters (on RAW data, before validation)
    const rawForEmbeds = data;

    // Step 2: Validate — produces the FULL validated data
    const validated = stepValidate(data, isArray, snapshot);

    // ── Late Guillotine ──────────────────────────────────
    // Steps 3-6 use the FULL validated data so that UI blocks,
    // system rules, and action suggestions never see undefined
    // for pruned fields.

    // Step 3: Determine wire-facing data (filtered or full)
    const wireData = (selectFields && selectFields.length > 0)
        ? applySelectFilter(validated, selectFields, isArray)
        : validated;

    // Step 3.1: DLP Redaction — mask PII on the wire-facing data
    const safeWireData = stepRedact(wireData, isArray, snapshot);

    const builder = new ResponseBuilder(safeWireData as string | object, snapshot.compiledStringify);

    // Step 3.5: Truncation warning (first UI block, before all others)
    if (truncated.truncationBlock) {
        builder.uiBlock(truncated.truncationBlock);
    }

    // Step 4: Merge embedded child Presenter blocks (using FULL data)
    stepEmbeds(builder, rawForEmbeds, isArray, snapshot, ctx);

    // Step 5: Attach UI blocks (using FULL validated data)
    stepUiBlocks(builder, validated, isArray, snapshot, ctx);

    // Step 6: Attach rules (using FULL validated data)
    stepRules(builder, validated, isArray, snapshot, ctx);

    // Step 7: Attach action suggestions (using FULL validated data)
    stepSuggestions(builder, validated, isArray, snapshot, ctx);

    return { builder, validated, isArray };
}

