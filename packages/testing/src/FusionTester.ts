/**
 * FusionTester — In-Memory MVA Lifecycle Emulator
 *
 * Runs the **real** MCP Fusion execution pipeline in RAM:
 * Zod Input Validation → Middleware Chain → Handler → PostProcessor → Egress Firewall
 *
 * Decomposes the `ToolResponse` into structured `MvaTestResult` objects
 * using the Symbol Backdoor (`MVA_META_SYMBOL`) — zero XML parsing, zero regex.
 *
 * **Zero coupling to test runners.** Returns plain JS objects. Use with
 * Vitest, Jest, Mocha, or Node's native `node:test`.
 *
 * @example
 * ```typescript
 * import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';
 * import { registry } from '../src/server/registry.js';
 *
 * const tester = createFusionTester(registry, {
 *     contextFactory: () => ({
 *         prisma: mockPrisma,
 *         tenantId: 't_777',
 *     }),
 * });
 *
 * const result = await tester.callAction('db_user', 'find_many', { take: 10 });
 *
 * expect(result.data[0]).not.toHaveProperty('passwordHash');
 * expect(result.systemRules).toContain('Data originates from the database via Prisma ORM.');
 * ```
 *
 * @module
 */
import type { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { MVA_META_SYMBOL } from '@vinkius-core/mcp-fusion';
import type { MvaMeta } from '@vinkius-core/mcp-fusion';
import type { TesterOptions, MvaTestResult } from './types.js';

// ── FusionTester Class ───────────────────────────────────

/**
 * In-memory MVA lifecycle emulator.
 *
 * Delegates to `ToolRegistry.routeCall()` for full pipeline fidelity,
 * then extracts structured MVA layers via the Symbol Backdoor.
 *
 * @typeParam TContext - Application context type (matches your ToolRegistry)
 */
export class FusionTester<TContext> {
    constructor(
        private readonly registry: ToolRegistry<TContext>,
        private readonly options: TesterOptions<TContext>,
    ) {}

    /**
     * Execute a tool action through the full MVA pipeline in-memory.
     *
     * @param toolName - The registered tool name (e.g. `'db_user'`)
     * @param actionName - The action discriminator (e.g. `'find_many'`)
     * @param args - Arguments for the action (excluding the discriminator)
     * @param overrideContext - Partial context overrides for this specific test
     *   (e.g. `{ role: 'GUEST' }` to simulate a different JWT)
     * @returns Decomposed MVA result with `data`, `systemRules`, `uiBlocks`, `isError`
     *
     * @throws {Error} If Zod input validation rejects the args (the ZodError propagates)
     *
     * @example
     * ```typescript
     * // Egress Firewall test
     * const result = await tester.callAction('db_user', 'find_many', { take: 10 });
     * expect(result.data[0]).not.toHaveProperty('passwordHash');
     *
     * // OOM Guard test — Zod rejects take > 50
     * await expect(
     *     tester.callAction('db_user', 'find_many', { take: 10000 })
     * ).rejects.toThrow();
     *
     * // Middleware test via overrideContext
     * const result = await tester.callAction('db_user', 'create',
     *     { email: 'test@co.com' },
     *     { role: 'GUEST' }
     * );
     * expect(result.isError).toBe(true);
     * ```
     */
    async callAction<TArgs = Record<string, unknown>>(
        toolName: string,
        actionName: string,
        args?: TArgs,
        overrideContext?: Partial<TContext>,
    ): Promise<MvaTestResult> {
        // 1. Context Hydration
        const baseContext = await this.options.contextFactory();
        const ctx = overrideContext
            ? { ...baseContext, ...overrideContext } as TContext
            : baseContext;

        // 2. Build args with discriminator
        const builtArgs: Record<string, unknown> = {
            action: actionName,
            ...(args || {}),
        };

        // 3. Run the REAL pipeline (validation → middleware → handler → presenter → egress)
        const rawResponse = await this.registry.routeCall(ctx, toolName, builtArgs);

        // 4. Error path — no MVA meta on error responses
        if (rawResponse.isError) {
            const errorText = rawResponse.content?.[0]?.text ?? 'Unknown error';
            return {
                data: errorText,
                systemRules: [],
                uiBlocks: [],
                isError: true,
                rawResponse,
            };
        }

        // 5. Extract MVA Meta via Symbol Backdoor
        const meta = (rawResponse as unknown as Record<symbol, unknown>)[MVA_META_SYMBOL] as MvaMeta | undefined;

        if (meta) {
            return {
                data: meta.data,
                systemRules: [...meta.systemRules],
                uiBlocks: [...meta.uiBlocks],
                isError: false,
                rawResponse,
            };
        }

        // 6. Fallback — tool without Presenter (raw data, no MVA layers)
        const rawText = rawResponse.content?.[0]?.text ?? '';
        let parsedData: unknown;
        try { parsedData = JSON.parse(rawText); } catch { parsedData = rawText; }

        return {
            data: parsedData,
            systemRules: [],
            uiBlocks: [],
            isError: false,
            rawResponse,
        };
    }
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a FusionTester for the given registry.
 *
 * @param registry - The application's ToolRegistry instance
 * @param options - Context factory and configuration
 * @returns A new FusionTester instance
 *
 * @example
 * ```typescript
 * const tester = createFusionTester(registry, {
 *     contextFactory: () => ({
 *         prisma: mockPrisma,
 *         tenantId: 't_enterprise_42',
 *     }),
 * });
 * ```
 */
export function createFusionTester<TContext>(
    registry: ToolRegistry<TContext>,
    options: TesterOptions<TContext>,
): FusionTester<TContext> {
    return new FusionTester(registry, options);
}
