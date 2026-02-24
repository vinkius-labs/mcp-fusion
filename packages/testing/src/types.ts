/**
 * MVA Test Result Types — Structured Response Decomposition
 *
 * Zero coupling to any test runner. Returns plain JS/TS objects
 * that any framework (Vitest, Jest, Mocha, node:test) can assert against.
 *
 * @module
 */

/**
 * Configuration for the FusionTester.
 *
 * @typeParam TContext - Application context type (same as your ToolRegistry)
 */
export interface TesterOptions<TContext> {
    /**
     * Factory that produces the mock context for each test invocation.
     * Inject fake Prisma, fake JWT, fake tenantId here.
     *
     * @example
     * ```typescript
     * contextFactory: () => ({
     *     prisma: mockPrisma,
     *     tenantId: 't_777',
     *     auth: { role: 'ADMIN' },
     * })
     * ```
     */
    contextFactory: () => TContext | Promise<TContext>;
}

/**
 * Decomposed MVA response from the FusionTester.
 *
 * Each field maps to a specific MVA layer, allowing QA to assert
 * each pillar independently without parsing XML or JSON strings.
 *
 * @typeParam TData - The validated data type (post-Egress Firewall)
 */
export interface MvaTestResult<TData = unknown> {
    /**
     * Validated data AFTER the Egress Firewall (Presenter Zod schema).
     * Hidden fields (`@fusion.hide`) are physically absent here.
     */
    data: TData;

    /**
     * JIT system rules from the Presenter's `.systemRules()`.
     * The LLM reads these as domain-level directives.
     */
    systemRules: readonly string[];

    /**
     * SSR UI blocks from the Presenter's `.uiBlocks()` / `.collectionUiBlocks()`.
     * Contains echarts configs, markdown blocks, summary strings, etc.
     */
    uiBlocks: readonly unknown[];

    /**
     * `true` if the pipeline returned an error response (`isError: true`).
     * Useful for asserting OOM guard rejections, middleware blocks, and handler errors.
     */
    isError: boolean;

    /**
     * The raw MCP `ToolResponse` from the pipeline.
     * For protocol-level inspection (content blocks, XML formatting, etc.)
     */
    rawResponse: unknown;
}
