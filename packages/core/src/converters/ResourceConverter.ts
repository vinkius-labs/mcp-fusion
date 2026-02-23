import { type Resource } from '../domain/Resource.js';
import { ConverterBase } from './ConverterBase.js';

/**
 * Type-safe Resource converter contract.
 *
 * @typeParam T - The target DTO type
 * @see {@link ResourceConverterBase} for the base implementation class
 */
export type ResourceConverter<T> = ConverterBase<Resource, T>;

/**
 * Base class for Resource converters.
 *
 * Extend this and implement `convertFrom(resource)` and `convertTo(dto)`.
 *
 * @typeParam T - The target DTO type
 *
 * @example
 * ```typescript
 * class MyResourceConverter extends ResourceConverterBase<ResourceDto> {
 *     convertFrom(resource: Resource): ResourceDto {
 *         return { name: resource.name, uri: resource.uri ?? '' };
 *     }
 *     convertTo(dto: ResourceDto): Resource {
 *         const r = new Resource(dto.name);
 *         r.uri = dto.uri;
 *         return r;
 *     }
 * }
 * ```
 *
 * @see {@link ConverterBase} for batch conversion methods
 */
export abstract class ResourceConverterBase<T> extends ConverterBase<Resource, T> {}
