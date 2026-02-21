import { describe, it, expect } from 'vitest';
import { type ToolAnnotations, createToolAnnotations } from '../src/ToolAnnotations.js';

describe('ToolAnnotations', () => {
    it('should create with default undefined values', () => {
        const ta = createToolAnnotations();
        expect(ta.title).toBeUndefined();
        expect(ta.readOnlyHint).toBeUndefined();
        expect(ta.destructiveHint).toBeUndefined();
        expect(ta.idempotentHint).toBeUndefined();
        expect(ta.openWorldHint).toBeUndefined();
        expect(ta.returnDirect).toBeUndefined();
    });

    it('should create with title', () => {
        const ta = createToolAnnotations({ title: 'My Tool' });
        expect(ta.title).toBe('My Tool');
    });

    it('should create with readOnlyHint', () => {
        const ta = createToolAnnotations({ readOnlyHint: true });
        expect(ta.readOnlyHint).toBe(true);
    });

    it('should create with destructiveHint', () => {
        const ta = createToolAnnotations({ destructiveHint: false });
        expect(ta.destructiveHint).toBe(false);
    });

    it('should create with idempotentHint', () => {
        const ta = createToolAnnotations({ idempotentHint: true });
        expect(ta.idempotentHint).toBe(true);
    });

    it('should create with openWorldHint', () => {
        const ta = createToolAnnotations({ openWorldHint: false });
        expect(ta.openWorldHint).toBe(false);
    });

    it('should create with returnDirect', () => {
        const ta = createToolAnnotations({ returnDirect: true });
        expect(ta.returnDirect).toBe(true);
    });

    it('should create with all properties', () => {
        const ta: ToolAnnotations = createToolAnnotations({
            title: 'Deploy',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
            returnDirect: false,
        });
        expect(ta.title).toBe('Deploy');
        expect(ta.readOnlyHint).toBe(false);
        expect(ta.destructiveHint).toBe(true);
        expect(ta.idempotentHint).toBe(false);
        expect(ta.openWorldHint).toBe(true);
        expect(ta.returnDirect).toBe(false);
    });
});
