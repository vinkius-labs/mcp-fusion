/**
 * @vinkius-core/prisma-gen — Root Barrel Export
 *
 * Public API for programmatic usage.
 *
 * @example
 * ```typescript
 * import { parseAnnotations, emitPresenter, emitTool } from '@vinkius-core/mcp-fusion-prisma-gen';
 * ```
 *
 * @module
 */

// ── Parser ───────────────────────────────────────────────
export { parseAnnotations } from './parser/AnnotationParser.js';
export type {
    FieldAnnotation, ModelAnnotations,
    DMMFField, DMMFModel,
} from './parser/AnnotationParser.js';

// ── Emitters ─────────────────────────────────────────────
export { emitPresenter } from './emitter/PresenterEmitter.js';
export { emitTool } from './emitter/ToolEmitter.js';
export type { GeneratedFile } from './types.js';

// ── Helpers ──────────────────────────────────────────────
export { toSnakeCase, toPascalCase, pluralize } from './helpers/NamingHelpers.js';
