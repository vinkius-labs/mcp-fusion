import { describe, it, expect } from 'vitest';
import { ToolAnnotations } from '../src/ToolAnnotations.js';

describe('ToolAnnotations', () => {
    it('should initialize with undefined values', () => {
        const ta = new ToolAnnotations();
        expect(ta.title).toBeUndefined();
        expect(ta.readOnlyHint).toBeUndefined();
        expect(ta.destructiveHint).toBeUndefined();
        expect(ta.idempotentHint).toBeUndefined();
        expect(ta.openWorldHint).toBeUndefined();
        expect(ta.returnDirect).toBeUndefined();
    });

    it('should set and get title', () => {
        const ta = new ToolAnnotations();
        ta.title = 'My Tool';
        expect(ta.title).toBe('My Tool');
    });

    it('should set and get readOnlyHint', () => {
        const ta = new ToolAnnotations();
        ta.readOnlyHint = true;
        expect(ta.readOnlyHint).toBe(true);
    });

    it('should set and get destructiveHint', () => {
        const ta = new ToolAnnotations();
        ta.destructiveHint = false;
        expect(ta.destructiveHint).toBe(false);
    });

    it('should set and get idempotentHint', () => {
        const ta = new ToolAnnotations();
        ta.idempotentHint = true;
        expect(ta.idempotentHint).toBe(true);
    });

    it('should set and get openWorldHint', () => {
        const ta = new ToolAnnotations();
        ta.openWorldHint = false;
        expect(ta.openWorldHint).toBe(false);
    });

    it('should set and get returnDirect', () => {
        const ta = new ToolAnnotations();
        ta.returnDirect = true;
        expect(ta.returnDirect).toBe(true);
    });
});
