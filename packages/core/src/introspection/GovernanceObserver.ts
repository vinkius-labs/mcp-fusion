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
import type { FusionTracer, FusionAttributeValue } from '../observability/Tracing.js';
import { SpanStatusCode } from '../observability/Tracing.js';
import type { ToolContract } from './ToolContract.js';
import type { CapabilityLockfile, LockfileCheckResult, GenerateLockfileOptions } from './CapabilityLockfile.js';
import type { ServerDigest } from './BehaviorDigest.js';
import type { AttestationResult } from './CryptoAttestation.js';
import type { EntitlementReport } from './EntitlementScanner.js';
import type { StaticTokenProfile } from './TokenEconomics.js';
import type { ContractDiffResult } from './ContractDiff.js';

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
    readonly tracer?: FusionTracer;
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
 * import { createGovernanceObserver } from '@vinkius-core/mcp-fusion/introspection';
 * import { createDebugObserver } from '@vinkius-core/mcp-fusion';
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

    function observe<T>(
        operation: GovernanceOperation,
        label: string,
        fn: () => T,
    ): T {
        const start = Date.now();
        const span = tracer?.startSpan(`mcp.governance.${operation}`, {
            attributes: {
                'mcp.governance.operation': operation,
                'mcp.governance.label': label,
            },
        });

        try {
            const result = fn();
            const durationMs = Date.now() - start;

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

            return result;
        } catch (err) {
            const durationMs = Date.now() - start;
            const message = err instanceof Error ? err.message : String(err);

            span?.setAttribute('mcp.governance.outcome', 'failure');
            span?.setAttribute('mcp.durationMs', durationMs);
            span?.setStatus({ code: SpanStatusCode.ERROR, message });
            span?.recordException(err instanceof Error ? err : new Error(message));

            debug?.({
                type: 'governance',
                operation,
                label,
                outcome: 'failure',
                detail: message,
                durationMs,
                timestamp: Date.now(),
            });

            throw err;
        } finally {
            span?.end();
        }
    }

    async function observeAsync<T>(
        operation: GovernanceOperation,
        label: string,
        fn: () => Promise<T>,
    ): Promise<T> {
        const start = Date.now();
        const span = tracer?.startSpan(`mcp.governance.${operation}`, {
            attributes: {
                'mcp.governance.operation': operation,
                'mcp.governance.label': label,
            },
        });

        try {
            const result = await fn();
            const durationMs = Date.now() - start;

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

            return result;
        } catch (err) {
            const durationMs = Date.now() - start;
            const message = err instanceof Error ? err.message : String(err);

            span?.setAttribute('mcp.governance.outcome', 'failure');
            span?.setAttribute('mcp.durationMs', durationMs);
            span?.setStatus({ code: SpanStatusCode.ERROR, message });
            span?.recordException(err instanceof Error ? err : new Error(message));

            debug?.({
                type: 'governance',
                operation,
                label,
                outcome: 'failure',
                detail: message,
                durationMs,
                timestamp: Date.now(),
            });

            throw err;
        } finally {
            span?.end();
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
