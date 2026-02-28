/**
 * @vinkius-core/mcp-fusion-inspector
 *
 * Optional TUI (Terminal User Interface) for real-time MCP Fusion
 * server observability. Connects via Shadow Socket IPC for zero
 * stdio interference.
 *
 * ## Quick Start
 *
 * ```bash
 * # Interactive TUI (auto-discover server)
 * fusion inspect
 * fusion dv
 *
 * # Built-in simulator for demo/testing
 * fusion dv --demo
 *
 * # Headless stderr output (ECS/K8s/CI)
 * fusion dv --out stderr
 * fusion dv --out stderr --demo
 * ```
 *
 * ## Programmatic API
 *
 * ```typescript
 * import { commandTop, startSimulator, streamToStderr } from '@vinkius-core/mcp-fusion-inspector';
 *
 * // Launch TUI
 * await commandTop({ pid: 12345 });
 *
 * // Start simulator
 * const bus = await startSimulator({ rps: 5 });
 *
 * // Stream to stderr (headless)
 * await streamToStderr({ pid: 12345 });
 * ```
 *
 * @module
 */

// ── TUI Engine ──────────────────────────────────────────────
export { commandTop, type TopOptions } from './CommandTop.js';

// ── Headless Output ─────────────────────────────────────────
export { streamToStderr, formatEvent, formatEventJson, type StreamLoggerOptions } from './StreamLogger.js';

// ── Simulator ───────────────────────────────────────────────
export { startSimulator, type SimulatorOptions } from './Simulator.js';

// ── CLI ─────────────────────────────────────────────────────
export { runDavinci, parseDavinciArgs, DAVINCI_HELP, type DavinciArgs, type OutputMode } from './cli/davinci.js';

// ── Rendering Utilities ─────────────────────────────────────
export {
    ansi, ScreenManager, box,
    hline, pad, truncate, progressBar, stringWidth,
} from './AnsiRenderer.js';

// ── Data Structures ─────────────────────────────────────────
export { RingBuffer } from './RingBuffer.js';
