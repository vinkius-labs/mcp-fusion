/**
 * Strategy modules — Pure-function strategies extracted from GroupedToolBuilder.
 * Each module handles a single responsibility.
 */
export { generateDescription } from './DescriptionGenerator.js';
export { generateToonDescription } from './ToonDescriptionGenerator.js';
export { generateInputSchema } from './SchemaGenerator.js';
export { aggregateAnnotations } from './AnnotationAggregator.js';
export { compileMiddlewareChains } from './MiddlewareCompiler.js';
export type { CompiledChain } from './MiddlewareCompiler.js';
export { getActionRequiredFields, assertFieldCompatibility } from './SchemaUtils.js';
export type { InternalAction, MiddlewareFn } from './Types.js';
