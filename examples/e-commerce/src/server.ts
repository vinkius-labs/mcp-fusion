/**
 * Server Bootstrap — MCP Fusion
 *
 * Tools are auto-discovered from src/tools/.
 * Drop a file, it becomes a tool.
 */
import { fileURLToPath } from 'node:url';
import { autoDiscover, PromptRegistry, startServer } from '@vinkius-core/mcp-fusion';
import { createContext } from './context.js';
import { f } from './fusion.js';
import { GreetPrompt } from './prompts/greet.js';

// ── Registry ─────────────────────────────────────────────
export const registry = f.registry();
export const prompts = new PromptRegistry();

// ── Auto-Discover & Register ─────────────────────────────
await autoDiscover(registry, fileURLToPath(new URL('./tools', import.meta.url)));
prompts.register(GreetPrompt);

// ── Start ────────────────────────────────────────────────
await startServer({
    name: 'e-commerce',
    registry,
    prompts,
    contextFactory: () => createContext(),
    // telemetry: false,
});
