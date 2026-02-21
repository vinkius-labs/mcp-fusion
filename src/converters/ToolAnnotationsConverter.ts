import { type ToolAnnotations } from '../domain/ToolAnnotations.js';
import { ConverterBase } from './ConverterBase.js';

/** Type-safe ToolAnnotations converter contract. */
export type ToolAnnotationsConverter<T> = ConverterBase<ToolAnnotations, T>;

/**
 * Base class for ToolAnnotations converters.
 * Extend and implement `convertFrom(toolAnnotation)` and `convertTo(dto)`.
 */
export abstract class ToolAnnotationsConverterBase<T> extends ConverterBase<ToolAnnotations, T> {}
