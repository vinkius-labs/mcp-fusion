import { describe, it, expect } from 'vitest';
import { Prompt } from '../../src/domain/Prompt.js';
import { PromptArgument } from '../../src/domain/PromptArgument.js';
import { Group } from '../../src/domain/Group.js';

describe('Prompt', () => {
    it('should create with name', () => {
        const prompt = new Prompt('code_review');
        expect(prompt.name).toBe('code_review');
    });

    it('should start with empty arguments', () => {
        const prompt = new Prompt('code_review');
        expect(prompt.promptArguments).toHaveLength(0);
    });

    it('should add prompt argument', () => {
        const prompt = new Prompt('code_review');
        const arg = new PromptArgument('language');
        arg.required = true;
        prompt.addPromptArgument(arg);
        expect(prompt.promptArguments).toHaveLength(1);
        expect(prompt.promptArguments[0].name).toBe('language');
        expect(prompt.promptArguments[0].required).toBe(true);
    });

    it('should not add duplicate arguments', () => {
        const prompt = new Prompt('code_review');
        const arg = new PromptArgument('language');
        prompt.addPromptArgument(arg);
        prompt.addPromptArgument(arg);
        expect(prompt.promptArguments).toHaveLength(1);
    });



    it('should remove prompt argument', () => {
        const prompt = new Prompt('code_review');
        const arg = new PromptArgument('language');
        prompt.addPromptArgument(arg);
        expect(prompt.removePromptArgument(arg)).toBe(true);
        expect(prompt.promptArguments).toHaveLength(0);
    });

    it('should return false when removing non-existing argument', () => {
        const prompt = new Prompt('code_review');
        const arg = new PromptArgument('language');
        expect(prompt.removePromptArgument(arg)).toBe(false);
    });

    it('should manage parent groups', () => {
        const prompt = new Prompt('code_review');
        const group = new Group('templates');
        prompt.addParentGroup(group);
        expect(prompt.parentGroups).toHaveLength(1);
    });

    it('should return name as fully qualified name', () => {
        const prompt = new Prompt('code_review');
        expect(prompt.getFullyQualifiedName()).toBe('code_review');
    });
});
