import { type Resource } from '../Resource.js';
import { ConverterBase } from './ConverterBase.js';

/** Type-safe Resource converter contract. */
export type ResourceConverter<T> = ConverterBase<Resource, T>;

/**
 * Base class for Resource converters.
 * Extend and implement `convertFrom(resource)` and `convertTo(dto)`.
 */
export abstract class ResourceConverterBase<T> extends ConverterBase<Resource, T> {}
