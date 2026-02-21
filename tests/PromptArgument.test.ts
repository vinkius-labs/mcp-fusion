import { describe, it, expect } from 'vitest';
import { PromptArgument } from '../src/domain/PromptArgument.js';

describe('PromptArgument', () => {
    it('should create with name', () => {
        const arg = new PromptArgument('username');
        expect(arg.name).toBe('username');
    });

    it('should default required to false', () => {
        const arg = new PromptArgument('username');
        expect(arg.required).toBe(false);
    });

    it('should set and get required', () => {
        const arg = new PromptArgument('username');
        arg.required = true;
        expect(arg.required).toBe(true);
    });

    it('should return name as fully qualified name', () => {
        const arg = new PromptArgument('username');
        expect(arg.getFullyQualifiedName()).toBe('username');
    });

    it('should set title and description', () => {
        const arg = new PromptArgument('username');
        arg.title = 'Username';
        arg.description = 'The username to use';
        expect(arg.title).toBe('Username');
        expect(arg.description).toBe('The username to use');
    });
});
