/** Client Bounded Context — Barrel Export */
export { createFusionClient, FusionClientError } from './FusionClient.js';
export type {
    FusionClient,
    FusionTransport,
    RouterMap,
    ClientMiddleware,
    FusionClientOptions,
} from './FusionClient.js';
export { createTypedRegistry } from './createTypedRegistry.js';
export type { InferRouter, TypedToolRegistry } from './InferRouter.js';
