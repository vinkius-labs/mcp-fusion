/**
 * PromptRegistry — Centralized Prompt Registration & Routing
 *
 * The single place where all prompt builders are registered and where
 * incoming `prompts/list` and `prompts/get` requests are routed.
 *
 * Mirrors the design of {@link ToolRegistry} with prompt-specific features:
 * - O(1) routing via Map lookup
 * - Tag-based filtering for RBAC exposure
 * - Lifecycle sync via `notifyChanged()` (→ `notifications/prompts/list_changed`)
 *
 * @example
 * ```typescript
 * import { PromptRegistry, definePrompt } from '@vinkius-core/mcp-fusion';
 *
 * const promptRegistry = new PromptRegistry<AppContext>();
 * promptRegistry.register(AuditPrompt);
 * promptRegistry.register(OnboardingPrompt);
 *
 * // Attach alongside tools:
 * attachToServer(server, {
 *     tools: toolRegistry,
 *     prompts: promptRegistry,
 *     contextFactory: createContext,
 * });
 *
 * // Lifecycle sync (e.g., after RBAC change):
 * promptRegistry.notifyChanged();
 * ```
 *
 * @see {@link definePrompt} for creating prompt builders
 * @see {@link PromptBuilder} for the builder contract
 *
 * @module
 */
import { type PromptBuilder, type PromptResult } from '../prompt/PromptTypes.js';

// ── Types ────────────────────────────────────────────────

/** MCP Prompt definition (for `prompts/list`) */
export interface McpPromptDef {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}

/** Filter options for selective prompt exposure */
export interface PromptFilter {
    /** Only include prompts that have ALL these tags (AND logic) */
    tags?: string[];
    /** Only include prompts that have at least ONE of these tags (OR logic) */
    anyTag?: string[];
    /** Exclude prompts that have ANY of these tags */
    exclude?: string[];
}

// ── Notification Sink ────────────────────────────────────

/**
 * Callback type for sending `notifications/prompts/list_changed`.
 * Set by ServerAttachment when the registry is attached to a server.
 */
export type PromptNotificationSink = () => void;

// ── Registry ─────────────────────────────────────────────

export class PromptRegistry<TContext = void> {
    private readonly _builders = new Map<string, PromptBuilder<TContext>>();
    private _notificationSink?: PromptNotificationSink;
    private _notifyDebounceTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Register a single prompt builder.
     *
     * Validates that the prompt name is unique and triggers
     * `buildPromptDefinition()` to compile at registration time.
     *
     * @param builder - A prompt builder (from `definePrompt()`)
     * @throws If a prompt with the same name is already registered
     */
    register(builder: PromptBuilder<TContext>): void {
        const name = builder.getName();
        if (this._builders.has(name)) {
            throw new Error(`Prompt "${name}" is already registered.`);
        }
        builder.buildPromptDefinition();
        this._builders.set(name, builder);
    }

    /**
     * Register multiple prompt builders at once.
     */
    registerAll(...builders: PromptBuilder<TContext>[]): void {
        for (const builder of builders) {
            this.register(builder);
        }
    }

    /**
     * Get all registered MCP Prompt definitions.
     *
     * Returns the compiled prompt metadata for `prompts/list`.
     */
    getAllPrompts(): McpPromptDef[] {
        const prompts: McpPromptDef[] = [];
        for (const builder of this._builders.values()) {
            prompts.push(builder.buildPromptDefinition());
        }
        return prompts;
    }

    /**
     * Get prompt definitions filtered by tags.
     *
     * Uses Set-based lookups for O(1) tag matching.
     */
    getPrompts(filter: PromptFilter): McpPromptDef[] {
        const requiredTags = filter.tags && filter.tags.length > 0
            ? new Set(filter.tags) : undefined;
        const anyTags = filter.anyTag && filter.anyTag.length > 0
            ? new Set(filter.anyTag) : undefined;
        const excludeTags = filter.exclude && filter.exclude.length > 0
            ? new Set(filter.exclude) : undefined;

        const prompts: McpPromptDef[] = [];

        for (const builder of this._builders.values()) {
            const builderTags = builder.getTags();

            // AND logic
            if (requiredTags) {
                let hasAll = true;
                for (const t of requiredTags) {
                    if (!builderTags.includes(t)) { hasAll = false; break; }
                }
                if (!hasAll) continue;
            }

            // OR logic
            if (anyTags) {
                let hasAny = false;
                for (const t of builderTags) {
                    if (anyTags.has(t)) { hasAny = true; break; }
                }
                if (!hasAny) continue;
            }

            // Exclude
            if (excludeTags) {
                let excluded = false;
                for (const t of builderTags) {
                    if (excludeTags.has(t)) { excluded = true; break; }
                }
                if (excluded) continue;
            }

            prompts.push(builder.buildPromptDefinition());
        }

        return prompts;
    }

    /**
     * Route an incoming `prompts/get` request to the correct builder.
     *
     * Looks up the builder by name and delegates to its `execute()` method.
     * Returns an error prompt result if the prompt is not found.
     *
     * @param ctx - Application context (from contextFactory)
     * @param name - Prompt name from the incoming MCP request
     * @param args - Raw string arguments from the MCP client
     * @returns The hydrated prompt result
     */
    async routeGet(
        ctx: TContext,
        name: string,
        args: Record<string, string>,
    ): Promise<PromptResult> {
        const builder = this._builders.get(name);
        if (!builder) {
            const available = Array.from(this._builders.keys()).join(', ');
            return {
                messages: [{
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Unknown prompt: "${name}". Available prompts: ${available}`,
                    },
                }],
            };
        }
        return builder.execute(ctx, args);
    }

    // ── Lifecycle Sync ───────────────────────────────────

    /**
     * Set the notification sink for `notifications/prompts/list_changed`.
     *
     * Called by `ServerAttachment` when attaching the registry to a server.
     * The sink invokes the MCP SDK's `sendPromptListChanged()` method.
     *
     * @internal — not part of the public API
     */
    setNotificationSink(sink: PromptNotificationSink): void {
        this._notificationSink = sink;
    }

    /**
     * Notify all connected clients that the prompt catalog has changed.
     *
     * Sends `notifications/prompts/list_changed` to all connected clients,
     * causing them to re-fetch `prompts/list` and update their UI.
     *
     * **Debounced:** Multiple calls within 100ms are coalesced into a single
     * notification to prevent storms during bulk registration or RBAC updates.
     *
     * Use cases:
     * - RBAC change: user promoted/demoted → visible prompts change
     * - SOP update: compliance rules changed → prompt logic updated
     * - Feature flag: new prompt enabled for beta users
     *
     * @example
     * ```typescript
     * // In your RBAC webhook handler:
     * app.post('/webhooks/role-changed', async (req) => {
     *     await db.users.updateRole(req.userId, req.newRole);
     *     promptRegistry.notifyChanged(); // All clients refresh instantly
     * });
     * ```
     */
    notifyChanged(): void {
        if (!this._notificationSink) return;

        // Debounce: coalesce rapid calls into a single notification
        if (this._notifyDebounceTimer) {
            clearTimeout(this._notifyDebounceTimer);
        }

        const sink = this._notificationSink;
        this._notifyDebounceTimer = setTimeout(() => {
            sink();
            this._notifyDebounceTimer = undefined;
        }, 100);
    }

    /** Check if a prompt with the given name is registered. */
    has(name: string): boolean { return this._builders.has(name); }

    /** Remove all registered prompts. */
    clear(): void { this._builders.clear(); }

    /** Number of registered prompts. */
    get size(): number { return this._builders.size; }
}
