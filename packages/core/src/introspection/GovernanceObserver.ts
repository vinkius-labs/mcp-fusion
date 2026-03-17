/**
 * GovernanceObserver — Observability Bridge for Governance Operations
 *
 * Wraps governance operations (contract compilation, lockfile generation,
 * integrity verification, attestation) with structured debug events and
 * OpenTelemetry-compatible tracing spans.
 *
 * This module is the bridge between the governance/introspection layer
 * and the observability layer. It is opt-in — governance operations
 * work identically without it. When enabled, every governance operation
 * emits a `GovernanceEvent` and/or a tracing span.
 *
 * **Zero overhead when disabled**: When no observer or tracer is
 * configured, the wrapper functions are no-ops that delegate directly.
 *
 * @module
 */
import type { DebugObserverFn, GovernanceOperation } from '../observability/DebugObserver.js';
import type { VurbTracer } from '../observability/Tracing.js';
import { SpanStatusCode } from '../observability/Tracing.js';
import { toErrorMessage } from '../core/ErrorUtils.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for governance observability.
 *
 * Pass to `createGovernanceObserver()` to enable debug events
 * and/or tracing spans for governance operations.
 */
export interface GovernanceObserverConfig {
    /** Debug event handler — receives GovernanceEvent */
    readonly debug?: DebugObserverFn;
    /** OpenTelemetry-compatible tracer */
    readonly tracer?: VurbTracer;
}

// ============================================================================
// Observer Factory
// ============================================================================

/**
 * A governance observer that emits debug events and tracing spans.
 *
 * All methods accept a callback that performs the actual work.
 * The observer wraps the callback with timing and event emission.
 */
export interface GovernanceObserver {
    /**
     * Wrap a governance operation with observability.
     *
     * @param operation - Named governance operation
     * @param label     - Human-readable label
     * @param fn        - The actual work to perform
     * @returns The result of `fn`
     */
    observe<T>(
        operation: GovernanceOperation,
        label: string,
        fn: () => T,
    ): T;

    /**
     * Wrap an async governance operation with observability.
     *
     * @param operation - Named governance operation
     * @param label     - Human-readable label
     * @param fn        - The actual async work to perform
     * @returns The result of `fn`
     */
    observeAsync<T>(
        operation: GovernanceOperation,
        label: string,
        fn: () => Promise<T>,
    ): Promise<T>;
}

/**
 * Create a governance observer that emits debug events and/or tracing
 * spans for governance operations.
 *
 * @param config - Observer configuration (debug handler and/or tracer)
 * @returns A `GovernanceObserver` instance
 *
 * @example
 * ```typescript
 * import { createGovernanceObserver } from 'vurb/introspection';
 * import { createDebugObserver } from '@vurb/core';
 *
 * const observer = createGovernanceObserver({
 *     debug: createDebugObserver(),
 * });
 *
 * const contracts = observer.observe(
 *     'contract.compile',
 *     'Compiling 5 tool contracts',
 *     () => compileContracts(builders),
 * );
 * ```
 */
export function createGovernanceObserver(config: GovernanceObserverConfig): GovernanceObserver {
    const { debug, tracer } = config;

    /**
     * Shared span + event logic for both sync and async paths.
     * Eliminates duplication between observe() and observeAsync().
     * @internal
     */
    function finalize<T>(
        operation: GovernanceOperation,
        label: string,
        start: number,
        span: ReturnType<NonNullable<typeof tracer>['startSpan']> | undefined,
        resultOrError: { ok: true; value: T } | { ok: false; error: unknown },
    ): T {
        const durationMs = Date.now() - start;

        if (resultOrError.ok) {
            span?.setAttribute('mcp.governance.outcome', 'success');
            span?.setAttribute('mcp.durationMs', durationMs);
            span?.setStatus({ code: SpanStatusCode.OK });

            debug?.({
                type: 'governance',
                operation,
                label,
                outcome: 'success',
                durationMs,
                timestamp: Date.now(),
            });

            span?.end();
            return resultOrError.value;
        }

        const message = toErrorMessage(resultOrError.error);

        span?.setAttribute('mcp.governance.outcome', 'failure');
        span?.setAttribute('mcp.durationMs', durationMs);
        span?.setStatus({ code: SpanStatusCode.ERROR, message });
        span?.recordException(
            resultOrError.error instanceof Error ? resultOrError.error : new Error(message),
        );

        debug?.({
            type: 'governance',
            operation,
            label,
            outcome: 'failure',
            detail: message,
            durationMs,
            timestamp: Date.now(),
        });

        span?.end();
        throw resultOrError.error;
    }

    function startSpan(operation: GovernanceOperation, label: string) {
        return tracer?.startSpan(`mcp.governance.${operation}`, {
            attributes: {
                'mcp.governance.operation': operation,
                'mcp.governance.label': label,
            },
        });
    }

    function observe<T>(
        operation: GovernanceOperation,
        label: string,
        fn: () => T,
    ): T {
        const start = Date.now();
        const span = startSpan(operation, label);

        try {
            const result = fn();

            // Bug #50: Runtime guard — reject async callbacks passed to sync observe()
            if (result != null && typeof (result as Record<string, unknown>)['then'] === 'function') {
                throw new Error(
                    '[Vurb] observe() received an async callback. Use observeAsync() for async operations.',
                );
            }

            return finalize(operation, label, start, span, { ok: true, value: result });
        } catch (err) {
            return finalize(operation, label, start, span, { ok: false, error: err });
        }
    }

    async function observeAsync<T>(
        operation: GovernanceOperation,
        label: string,
        fn: () => Promise<T>,
    ): Promise<T> {
        const start = Date.now();
        const span = startSpan(operation, label);

        try {
            const result = await fn();
            return finalize(operation, label, start, span, { ok: true, value: result });
        } catch (err) {
            return finalize(operation, label, start, span, { ok: false, error: err });
        }
    }

    return { observe, observeAsync };
}

/**
 * Create a no-op governance observer.
 *
 * Used when observability is not configured. Zero overhead.
 */
export function createNoopObserver(): GovernanceObserver {
    return {
        observe: <T>(_op: GovernanceOperation, _label: string, fn: () => T): T => fn(),
        observeAsync: <T>(_op: GovernanceOperation, _label: string, fn: () => Promise<T>): Promise<T> => fn(),
    };
}
