/**
 * @vinkius-core/openapi-gen — Root Barrel Export
 *
 * Public API for programmatic usage.
 *
 * @example
 * ```typescript
 * import { parseOpenAPI, mapEndpoints, emitFiles } from '@vinkius-core/openapi-gen';
 *
 * const spec = parseOpenAPI(yamlString);
 * const mapped = mapEndpoints(spec);
 * const files = emitFiles(mapped);
 * ```
 *
 * @module
 */

// ── Config ───────────────────────────────────────────────
export { mergeConfig, DEFAULT_CONFIG } from './config/GeneratorConfig.js';
export type {
    GeneratorConfig, FeatureFlags, NamingConfig,
    ContextConfig, ServerConfig,
} from './config/GeneratorConfig.js';
export { loadConfig, applyCliOverrides } from './config/ConfigLoader.js';
export type { CliOverrides } from './config/ConfigLoader.js';

// ── Parser ───────────────────────────────────────────────
export { parseOpenAPI } from './parser/OpenApiParser.js';
export type {
    ApiSpec, ApiGroup, ApiAction, ApiParam,
    ApiResponseSchema, ApiServer, SchemaNode,
} from './parser/types.js';
export { resolveRefs } from './parser/RefResolver.js';
export { isSwagger2, convertSwagger2ToV3 } from './parser/Swagger2Converter.js';

// ── Zod Compiler ─────────────────────────────────────────
export { compileZod, compileInputSchema, compileResponseSchema } from './schema/ZodCompiler.js';

// ── Endpoint Mapper ──────────────────────────────────────
export { mapEndpoints, inferAnnotations } from './mapper/EndpointMapper.js';

// ── Code Emitter ─────────────────────────────────────────
export { emitFiles } from './emitter/CodeEmitter.js';
export type { GeneratedFile } from './emitter/CodeEmitter.js';

// ── Template Helpers ─────────────────────────────────────
export { toSnakeCase, toPascalCase, toCamelCase } from './emitter/TemplateHelpers.js';

// ── Runtime Mode ─────────────────────────────────────────
export { loadOpenAPI } from './runtime/loadOpenAPI.js';
export type { LoadConfig, RuntimeTool, RuntimeAction } from './runtime/loadOpenAPI.js';
export { buildHandler } from './runtime/HttpHandlerFactory.js';
export type { HttpContext, HandlerFn } from './runtime/HttpHandlerFactory.js';
