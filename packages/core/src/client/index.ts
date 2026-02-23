/** Client Bounded Context — Barrel Export */
export { createFusionClient } from './FusionClient.js';
export type {
    FusionClient,
    FusionTransport,
    RouterMap,
} from './FusionClient.js';
export { createTypedRegistry } from './createTypedRegistry.js';
export type { InferRouter, TypedToolRegistry } from './InferRouter.js';
