import { Prompt } from '../Prompt.js';

export interface PromptConverter<PromptType> {
    convertFromPrompts(prompts: Prompt[]): PromptType[];
    convertFromPrompt(prompt: Prompt): PromptType;
    convertToPrompts(prompts: PromptType[]): Prompt[];
    convertToPrompt(prompt: PromptType): Prompt;
}

export abstract class AbstractPromptConverter<PromptType> implements PromptConverter<PromptType> {
    public convertFromPrompts(prompts: Prompt[]): PromptType[] {
        return prompts
            .map(pn => this.convertFromPrompt(pn))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertFromPrompt(prompt: Prompt): PromptType;

    public convertToPrompts(prompts: PromptType[]): Prompt[] {
        return prompts
            .map(p => this.convertToPrompt(p))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertToPrompt(prompt: PromptType): Prompt;
}
