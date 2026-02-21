import { type Tool } from '../domain/Tool.js';
import { ConverterBase } from './ConverterBase.js';

/** Type-safe Tool converter contract. */
export type ToolConverter<T> = ConverterBase<Tool, T>;

/**
 * Base class for Tool converters.
 * Extend and implement `convertFrom(tool)` and `convertTo(dto)`.
 */
export abstract class ToolConverterBase<T> extends ConverterBase<Tool, T> {}
