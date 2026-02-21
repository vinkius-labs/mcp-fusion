import { Prompt } from '../Prompt.js';
import { ConverterBase } from './ConverterBase.js';

export interface PromptConverter<PromptType> {
    convertFromPrompts(prompts: Prompt[]): PromptType[];
    convertFromPrompt(prompt: Prompt): PromptType;
    convertToPrompts(prompts: PromptType[]): Prompt[];
    convertToPrompt(prompt: PromptType): Prompt;
}

export abstract class PromptConverterBase<PromptType>
    extends ConverterBase<Prompt, PromptType>
    implements PromptConverter<PromptType>
{
    public convertFromPrompts(prompts: Prompt[]): PromptType[] {
        return this.convertFromBatch(prompts);
    }

    public abstract convertFromPrompt(prompt: Prompt): PromptType;

    public convertToPrompts(prompts: PromptType[]): Prompt[] {
        return this.convertToBatch(prompts);
    }

    public abstract convertToPrompt(prompt: PromptType): Prompt;

    // ── Bridge to ConverterBase ──
    protected convertFromSingle(source: Prompt): PromptType {
        return this.convertFromPrompt(source);
    }

    protected convertToSingle(target: PromptType): Prompt {
        return this.convertToPrompt(target);
    }
}
