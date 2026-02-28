/** Server Integration — Barrel Export */
export { resolveServer } from './ServerResolver.js';
export {
    attachToServer,
    type AttachOptions, type DetachFn, type RegistryDelegate,
} from './ServerAttachment.js';

// Re-export exposition for backward compatibility
export type { ToolExposition, ExpositionConfig } from '../exposition/index.js';
export { compileExposition, type FlatRoute, type ExpositionResult } from '../exposition/index.js';

// ── File-Based Routing ───────────────────────────────────
export { autoDiscover } from './autoDiscover.js';
export type { AutoDiscoverOptions } from './autoDiscover.js';

// ── Dev Server (HMR) ────────────────────────────────────
export { createDevServer } from './DevServer.js';
export type { DevServerConfig, DevServer } from './DevServer.js';

// ── Quick Start (One-Liner Bootstrap) ────────────────────
export { startServer } from './startServer.js';
export type { StartServerOptions, StartServerResult } from './startServer.js';
