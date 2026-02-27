import { toolError } from '../response.js';
import type { ErrorCode, ErrorSeverity, ToolResponse } from '../response.js';

/**
 * ErrorBuilder — Fluent API for Self-Healing Errors
 *
 * Provides a chaining interface to construct structured tool errors
 * with recovery suggestions, available actions, and metadata.
 *
 * Designed to be used via `f.error()` in a tool handler.
 *
 * @example
 * ```typescript
 * return f.error('NOT_FOUND', `Project "${id}" missing`)
 *     .suggest('Check the ID and try again')
 *     .actions('projects.list')
 *     .critical();
 * ```
 */
export class ErrorBuilder {
    private _message: string;
    private _code: ErrorCode;
    private _suggestion?: string;
    private _actions: string[] = [];
    private _severity: ErrorSeverity = 'error';
    private _details: Record<string, string> = {};
    private _retryAfter?: number;
    /** @internal Cached build result — invalidated by any setter */
    private _cached: ToolResponse | undefined = undefined;

    constructor(code: ErrorCode, message: string) {
        this._code = code;
        this._message = message;
    }

    /** Add a recovery suggestion for the LLM agent */
    suggest(suggestion: string): this {
        this._suggestion = suggestion;
        this._cached = undefined;
        return this;
    }

    /** List tool names the agent should try instead */
    actions(...names: string[]): this {
        this._actions.push(...names);
        this._cached = undefined;
        return this;
    }

    /** Set error severity (default: 'error') */
    severity(level: ErrorSeverity): this {
        this._severity = level;
        this._cached = undefined;
        return this;
    }

    /** Set severity to 'critical' (stops agent execution) */
    critical(): this { return this.severity('critical'); }

    /** Set severity to 'warning' (non-fatal guidance) */
    warning(): this { return this.severity('warning'); }

    /** Add structured metadata details about the error */
    details(data: Record<string, string | number | boolean>): this {
        for (const [key, value] of Object.entries(data)) {
            this._details[key] = String(value);
        }
        this._cached = undefined;
        return this;
    }

    /** Suggest a retry delay in seconds for transient errors */
    retryAfter(seconds: number): this {
        this._retryAfter = seconds;
        this._cached = undefined;
        return this;
    }

    /**
     * Build the final {@link ToolResponse}.
     *
     * Note: The execution pipeline also accepts the builder instance
     * directly and calls this method automatically.
     */
    build(): ToolResponse {
        const opts: {
            message: string;
            severity: ErrorSeverity;
            suggestion?: string;
            availableActions?: string[];
            details?: Record<string, string>;
            retryAfter?: number;
        } = {
            message: this._message,
            severity: this._severity,
        };
        if (this._suggestion) opts.suggestion = this._suggestion;
        if (this._actions.length > 0) opts.availableActions = this._actions;
        if (Object.keys(this._details).length > 0) opts.details = this._details;
        if (this._retryAfter !== undefined) opts.retryAfter = this._retryAfter;
        return toolError(this._code, opts);
    }

    /** @internal Ensure the response is built and cached */
    private _ensureBuilt(): ToolResponse {
        if (!this._cached) this._cached = this.build();
        return this._cached;
    }

    /** Implementation of ToolResponse for direct return in handlers */
    get content() { return this._ensureBuilt().content; }
    get isError() { return this._ensureBuilt().isError; }
}
