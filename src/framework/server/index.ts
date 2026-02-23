/** Server Integration Bounded Context — Barrel Export */
export { resolveServer } from './ServerResolver.js';
export {
    attachToServer,
    type AttachOptions, type DetachFn, type RegistryDelegate,
} from './ServerAttachment.js';
export type { ToolExposition, ExpositionConfig } from './ExpositionTypes.js';
export { compileExposition, type FlatRoute, type ExpositionResult } from './ExpositionCompiler.js';
