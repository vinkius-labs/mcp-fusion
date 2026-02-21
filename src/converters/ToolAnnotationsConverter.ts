import { type ToolAnnotations } from '../domain/ToolAnnotations.js';
import { ConverterBase } from './ConverterBase.js';

/**
 * Type-safe ToolAnnotations converter contract.
 *
 * @typeParam T - The target DTO type
 * @see {@link ToolAnnotationsConverterBase} for the base implementation class
 */
export type ToolAnnotationsConverter<T> = ConverterBase<ToolAnnotations, T>;

/**
 * Base class for ToolAnnotations converters.
 *
 * Extend this and implement `convertFrom(annotations)` and `convertTo(dto)`.
 *
 * @typeParam T - The target DTO type
 *
 * @example
 * ```typescript
 * class MyAnnotationsConverter extends ToolAnnotationsConverterBase<McpAnnotations> {
 *     convertFrom(ta: ToolAnnotations): McpAnnotations {
 *         return { readOnly: ta.readOnlyHint ?? false, destructive: ta.destructiveHint ?? false };
 *     }
 *     convertTo(mcp: McpAnnotations): ToolAnnotations {
 *         return createToolAnnotations({ readOnlyHint: mcp.readOnly, destructiveHint: mcp.destructive });
 *     }
 * }
 * ```
 *
 * @see {@link ConverterBase} for batch conversion methods
 */
export abstract class ToolAnnotationsConverterBase<T> extends ConverterBase<ToolAnnotations, T> {}
