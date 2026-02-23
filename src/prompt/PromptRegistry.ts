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
import {
    type PromptBuilder,
    type PromptResult,
    type PromptInterceptorFn,
    type PromptMeta,
    type PromptMessagePayload,
} from './types.js';
import { runWithHydrationDeadline } from './HydrationSandbox.js';

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

// ── MX Helpers ───────────────────────────────────────────

/**
 * Format key-value data into an XML semantic block.
 *
 * @internal Used by the interceptor builder's `prependContext`/`appendContext`.
 */
function formatContext(tag: string, data: Record<string, string | number | boolean>): string {
    const entries = Object.entries(data)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join('\n');
    return `<${tag}_context>\n${entries}\n</${tag}_context>`;
}

// ── Registry ─────────────────────────────────────────────

export class PromptRegistry<TContext = void> {
    private readonly _builders = new Map<string, PromptBuilder<TContext>>();
    private readonly _interceptors: PromptInterceptorFn<TContext>[] = [];
    private _notificationSink?: PromptNotificationSink;
    private _notifyDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    private _defaultHydrationTimeout: number | undefined;

    /**
     * Set a global hydration timeout for ALL prompts in this registry.
     *
     * Individual prompts can override with their own `hydrationTimeout`.
     * If neither is set, no timeout is applied (backward compatible).
     *
     * **Enterprise use case**: The platform team sets a 5s global deadline.
     * Critical prompts like `morning_briefing` set their own 3s deadline.
     * Simple prompts (no external I/O) inherit the 5s safety net.
     *
     * @param ms - Maximum hydration time in milliseconds (must be > 0)
     *
     * @example
     * ```typescript
     * const promptRegistry = new PromptRegistry<AppContext>();
     * promptRegistry.setDefaultHydrationTimeout(5000); // 5s global safety net
     * ```
     */
    setDefaultHydrationTimeout(ms: number): void {
        this._defaultHydrationTimeout = ms;
    }

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
     * Register a global Prompt Interceptor.
     *
     * Interceptors run AFTER the handler produces its `PromptResult` and BEFORE
     * the result is returned to the MCP client. They can prepend/append messages
     * to inject compliance headers, tenant context, RBAC constraints, or any
     * global state that should wrap every prompt.
     *
     * **Enterprise use case**: The CISO requires every LLM interaction to include
     * tenant isolation rules. Register one interceptor — it applies to all 50 prompts.
     *
     * Multiple interceptors are supported. They execute in registration order.
     *
     * @param interceptor - Callback receiving (ctx, builder, promptMeta)
     *
     * @example
     * ```typescript
     * promptRegistry.useInterceptor(async (ctx, builder, meta) => {
     *     builder.prependSystem(
     *         `[ENTERPRISE COMPLIANCE LAYER]\n` +
     *         `User Role: ${ctx.user.role} (Tenant ID: ${ctx.tenant.id})\n` +
     *         `Server Time: ${new Date().toISOString()}`
     *     );
     * });
     * ```
     */
    useInterceptor(interceptor: PromptInterceptorFn<TContext>): void {
        this._interceptors.push(interceptor);
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
            if (requiredTags && !Array.from(requiredTags).every(t => builderTags.includes(t))) {
                continue;
            }

            // OR logic
            if (anyTags && !builderTags.some(t => anyTags.has(t))) {
                continue;
            }

            // Exclude
            if (excludeTags && builderTags.some(t => excludeTags.has(t))) {
                continue;
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

        // ── Hydration Deadline ───────────────────────────
        // Per-prompt timeout overrides registry default.
        // Zero overhead when no timeout configured.
        const effectiveTimeout = builder.getHydrationTimeout() ?? this._defaultHydrationTimeout;

        const result = effectiveTimeout && effectiveTimeout > 0
            ? await runWithHydrationDeadline(
                () => builder.execute(ctx, args),
                effectiveTimeout,
            )
            : await builder.execute(ctx, args);

        // ── Prompt Interceptors ──────────────────────────
        // Zero overhead when no interceptors registered.
        if (this._interceptors.length === 0) return result;

        // Build PromptMeta from the builder's compiled definition
        const def = builder.buildPromptDefinition();
        const meta: PromptMeta = {
            name: def.name,
            ...(def.description ? { description: def.description } : {}),
            tags: builder.getTags(),
        };

        // Create mutable builder facade
        const prepended: PromptMessagePayload[] = [];
        const appended: PromptMessagePayload[] = [];

        const interceptorBuilder = {
            prependSystem(text: string) {
                prepended.push({ role: 'user', content: { type: 'text', text } });
            },
            prependUser(text: string) {
                prepended.push({ role: 'user', content: { type: 'text', text } });
            },
            appendSystem(text: string) {
                appended.push({ role: 'user', content: { type: 'text', text } });
            },
            appendUser(text: string) {
                appended.push({ role: 'user', content: { type: 'text', text } });
            },
            appendAssistant(text: string) {
                appended.push({ role: 'assistant', content: { type: 'text', text } });
            },
            prependContext(tag: string, data: Record<string, string | number | boolean>) {
                prepended.push({ role: 'user', content: { type: 'text', text: formatContext(tag, data) } });
            },
            appendContext(tag: string, data: Record<string, string | number | boolean>) {
                appended.push({ role: 'user', content: { type: 'text', text: formatContext(tag, data) } });
            },
        };

        // Execute interceptors in registration order
        for (const interceptor of this._interceptors) {
            await interceptor(ctx, interceptorBuilder, meta);
        }

        // Short-circuit: no messages added → return original
        if (prepended.length === 0 && appended.length === 0) return result;

        // Merge: prepend + original + append
        return {
            ...result,
            messages: [...prepended, ...result.messages, ...appended],
        };
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
        if (this._notifyDebounceTimer !== undefined) {
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
