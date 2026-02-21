import { type Prompt } from '../domain/Prompt.js';
import { ConverterBase } from './ConverterBase.js';

/** Type-safe Prompt converter contract. */
export type PromptConverter<T> = ConverterBase<Prompt, T>;

/**
 * Base class for Prompt converters.
 * Extend and implement `convertFrom(prompt)` and `convertTo(dto)`.
 */
export abstract class PromptConverterBase<T> extends ConverterBase<Prompt, T> {}
