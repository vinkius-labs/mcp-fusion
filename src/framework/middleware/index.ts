/** Middleware Bounded Context — Barrel Export */
export {
    defineMiddleware,
    resolveMiddleware,
    isMiddlewareDefinition,
} from './ContextDerivation.js';
export type {
    MiddlewareDefinition,
    MergeContext,
    InferContextOut,
} from './ContextDerivation.js';
