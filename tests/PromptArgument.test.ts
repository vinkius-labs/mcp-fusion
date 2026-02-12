import { describe, it, expect } from 'vitest';
import { PromptArgument } from '../src/PromptArgument.js';

describe('PromptArgument', () => {
    it('should create with name', () => {
        const arg = new PromptArgument('username');
        expect(arg.getName()).toBe('username');
    });

    it('should default required to false', () => {
        const arg = new PromptArgument('username');
        expect(arg.isRequired()).toBe(false);
    });

    it('should set and get required', () => {
        const arg = new PromptArgument('username');
        arg.setRequired(true);
        expect(arg.isRequired()).toBe(true);
    });

    it('should return name as fully qualified name', () => {
        const arg = new PromptArgument('username');
        expect(arg.getFullyQualifiedName()).toBe('username');
    });

    it('should set title and description', () => {
        const arg = new PromptArgument('username');
        arg.setTitle('Username');
        arg.setDescription('The username to use');
        expect(arg.getTitle()).toBe('Username');
        expect(arg.getDescription()).toBe('The username to use');
    });

    it('should produce correct toString', () => {
        const arg = new PromptArgument('email');
        arg.setRequired(true);
        const str = arg.toString();
        expect(str).toContain('PromptArgument');
        expect(str).toContain('required=true');
        expect(str).toContain('name=email');
    });
});
