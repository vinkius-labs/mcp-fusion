import { type Group } from '../Group.js';
import { ConverterBase } from './ConverterBase.js';

/** Type-safe Group converter contract. */
export type GroupConverter<T> = ConverterBase<Group, T>;

/**
 * Base class for Group converters.
 * Extend and implement `convertFrom(group)` and `convertTo(dto)`.
 */
export abstract class GroupConverterBase<T> extends ConverterBase<Group, T> {}
