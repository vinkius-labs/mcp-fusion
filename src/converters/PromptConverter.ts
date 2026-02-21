import { type Prompt } from '../domain/Prompt.js';
import { ConverterBase } from './ConverterBase.js';

/**
 * Type-safe Prompt converter contract.
 *
 * @typeParam T - The target DTO type
 * @see {@link PromptConverterBase} for the base implementation class
 */
export type PromptConverter<T> = ConverterBase<Prompt, T>;

/**
 * Base class for Prompt converters.
 *
 * Extend this and implement `convertFrom(prompt)` and `convertTo(dto)`.
 *
 * @typeParam T - The target DTO type
 *
 * @example
 * ```typescript
 * class MyPromptConverter extends PromptConverterBase<PromptDto> {
 *     convertFrom(prompt: Prompt): PromptDto {
 *         return { name: prompt.name, args: prompt.promptArguments.length };
 *     }
 *     convertTo(dto: PromptDto): Prompt {
 *         return new Prompt(dto.name);
 *     }
 * }
 * ```
 *
 * @see {@link ConverterBase} for batch conversion methods
 */
export abstract class PromptConverterBase<T> extends ConverterBase<Prompt, T> {}
