/**
 * Ambient type declaration for the optional `xstate` dependency.
 *
 * `xstate` is an optional peer dependency of `@mcpfusion/core` — it is only
 * required when using the FSM State Gate feature with the XState backend.
 * When `xstate` is not installed, the framework falls back to a built-in
 * minimal FSM engine. This declaration allows TypeScript to compile without
 * `xstate` installed.
 */
declare module 'xstate' {
    export interface Snapshot {
        value: string | Record<string, string>;
        done?: boolean;
    }
    export interface Actor {
        subscribe(observer: (snapshot: Snapshot) => void): { unsubscribe(): void };
        start(): Actor;
        stop(): Actor;
        send(event: { type: string }): void;
    }
    export function createMachine(config: unknown, options?: unknown): unknown;
    export function createActor(machine: unknown, options?: unknown): Actor;
}

declare module 'fast-redact' {
    interface Redact {
        (obj: Record<string, unknown>): Record<string, unknown>;
    }
    const redact: (paths: string[], serialize?: (v: unknown) => string) => Redact;
    export default redact;
}