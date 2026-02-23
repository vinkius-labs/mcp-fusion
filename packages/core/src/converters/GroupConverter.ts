import { type Group } from '../domain/Group.js';
import { ConverterBase } from './ConverterBase.js';

/**
 * Type-safe Group converter contract.
 *
 * @typeParam T - The target DTO type
 * @see {@link GroupConverterBase} for the base implementation class
 */
export type GroupConverter<T> = ConverterBase<Group, T>;

/**
 * Base class for Group converters.
 *
 * Extend this and implement `convertFrom(group)` and `convertTo(dto)`.
 *
 * @typeParam T - The target DTO type
 *
 * @example
 * ```typescript
 * class MyGroupConverter extends GroupConverterBase<GroupDto> {
 *     convertFrom(group: Group): GroupDto {
 *         return { name: group.name, children: group.childGroups.length };
 *     }
 *     convertTo(dto: GroupDto): Group {
 *         return new Group(dto.name);
 *     }
 * }
 * ```
 *
 * @see {@link ConverterBase} for batch conversion methods
 */
export abstract class GroupConverterBase<T> extends ConverterBase<Group, T> {}
