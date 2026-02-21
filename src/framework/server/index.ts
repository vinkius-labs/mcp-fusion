/** Server Integration Bounded Context — Barrel Export */
export { resolveServer } from './ServerResolver.js';
export {
    attachToServer,
    type AttachOptions, type DetachFn, type RegistryDelegate,
} from './ServerAttachment.js';
