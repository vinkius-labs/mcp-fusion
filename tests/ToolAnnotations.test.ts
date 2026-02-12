import { describe, it, expect } from 'vitest';
import { ToolAnnotations } from '../src/ToolAnnotations.js';

describe('ToolAnnotations', () => {
    it('should initialize with undefined values', () => {
        const ta = new ToolAnnotations();
        expect(ta.getTitle()).toBeUndefined();
        expect(ta.getReadOnlyHint()).toBeUndefined();
        expect(ta.getDestructiveHint()).toBeUndefined();
        expect(ta.getIdempotentHint()).toBeUndefined();
        expect(ta.getOpenWorldHint()).toBeUndefined();
        expect(ta.getReturnDirect()).toBeUndefined();
    });

    it('should set and get title', () => {
        const ta = new ToolAnnotations();
        ta.setTitle('My Tool');
        expect(ta.getTitle()).toBe('My Tool');
    });

    it('should set and get readOnlyHint', () => {
        const ta = new ToolAnnotations();
        ta.setReadOnlyHint(true);
        expect(ta.getReadOnlyHint()).toBe(true);
    });

    it('should set and get destructiveHint', () => {
        const ta = new ToolAnnotations();
        ta.setDestructiveHint(false);
        expect(ta.getDestructiveHint()).toBe(false);
    });

    it('should set and get idempotentHint', () => {
        const ta = new ToolAnnotations();
        ta.setIdempotentHint(true);
        expect(ta.getIdempotentHint()).toBe(true);
    });

    it('should set and get openWorldHint', () => {
        const ta = new ToolAnnotations();
        ta.setOpenWorldHint(false);
        expect(ta.getOpenWorldHint()).toBe(false);
    });

    it('should set and get returnDirect', () => {
        const ta = new ToolAnnotations();
        ta.setReturnDirect(true);
        expect(ta.getReturnDirect()).toBe(true);
    });

    it('should produce correct toString', () => {
        const ta = new ToolAnnotations();
        ta.setTitle('Deploy');
        ta.setDestructiveHint(true);
        ta.setReadOnlyHint(false);
        const str = ta.toString();
        expect(str).toContain('ToolAnnotation');
        expect(str).toContain('title=Deploy');
        expect(str).toContain('destructiveHint=true');
        expect(str).toContain('readOnlyHint=false');
    });
});
