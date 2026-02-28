/**
 * Sandbox — Barrel Export
 *
 * Zero-Trust Computation Delegation via isolated-vm.
 * Allows LLMs to send JavaScript functions to be executed
 * in a sealed V8 isolate on the client's machine.
 *
 * The `isolated-vm` package is an optional peerDependency.
 * The framework works fully without it — sandbox is a power add-on.
 */
export { SandboxEngine } from './SandboxEngine.js';
export type { SandboxConfig, SandboxResult, SandboxErrorCode } from './SandboxEngine.js';
export { validateSandboxCode } from './SandboxGuard.js';
export type { GuardResult } from './SandboxGuard.js';

// ── HATEOAS Auto-Prompting Instruction ───────────────────

/**
 * System instruction auto-injected into the tool description
 * when `.sandboxed()` is used. Teaches the LLM how to send
 * JavaScript functions for server-side computation delegation.
 *
 * @internal
 */
export const SANDBOX_SYSTEM_INSTRUCTION =
    '\n\n[SYSTEM: This tool supports Zero-Trust Compute. ' +
    'You MUST pass a valid, pure, synchronous JavaScript arrow function as a string ' +
    'to filter/map the data on the server before receiving it. ' +
    'E.g.: (data) => data.filter(d => d.value > 10). ' +
    'Do not use markdown formatting, async/await, or external imports.]';
