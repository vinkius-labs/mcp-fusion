/**
 * Ambient type declaration for the `xstate` optional peer dependency.
 *
 * XState v5 is the industry standard for typed finite state machines.
 * This declaration provides minimal types needed by `StateMachineGate`
 * so that `import('xstate')` doesn't error when the package is installed.
 *
 * Install: `npm install xstate` (only needed when using `.bindState()`)
 */
declare module 'xstate' {
    export interface MachineConfig {
        id?: string;
        initial: string;
        states: Record<string, {
            on?: Record<string, string>;
            type?: 'final';
        }>;
    }

    export interface MachineSnapshot {
        value: string | Record<string, unknown>;
        status: string;
    }

    export interface Actor {
        getSnapshot(): MachineSnapshot;
        send(event: { type: string }): void;
        subscribe(listener: (snapshot: MachineSnapshot) => void): { unsubscribe(): void };
        start(): Actor;
        stop(): void;
    }

    export function createMachine(config: MachineConfig): unknown;
    export function createActor(machine: unknown): Actor;
}
