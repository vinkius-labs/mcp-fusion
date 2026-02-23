/** Server Integration — Barrel Export */
export { resolveServer } from './ServerResolver.js';
export {
    attachToServer,
    type AttachOptions, type DetachFn, type RegistryDelegate,
} from './ServerAttachment.js';

// Re-export exposition for backward compatibility
export type { ToolExposition, ExpositionConfig } from '../exposition/index.js';
export { compileExposition, type FlatRoute, type ExpositionResult } from '../exposition/index.js';
