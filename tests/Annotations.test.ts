import { describe, it, expect } from 'vitest';
import { Annotations } from '../src/Annotations.js';
import { Role } from '../src/Role.js';

describe('Annotations', () => {
    it('should construct with all parameters', () => {
        const annotations = new Annotations([Role.USER], 1, '2025-01-01T00:00:00Z');
        expect(annotations.getAudience()).toEqual([Role.USER]);
        expect(annotations.getPriority()).toBe(1);
        expect(annotations.getLastModified()).toBe('2025-01-01T00:00:00Z');
    });

    it('should set and get audience', () => {
        const annotations = new Annotations([], 0, '');
        annotations.setAudience([Role.USER, Role.ASSISTANT]);
        expect(annotations.getAudience()).toEqual([Role.USER, Role.ASSISTANT]);
    });

    it('should set and get priority', () => {
        const annotations = new Annotations([], 0, '');
        annotations.setPriority(5);
        expect(annotations.getPriority()).toBe(5);
    });

    it('should set and get lastModified', () => {
        const annotations = new Annotations([], 0, '');
        annotations.setLastModified('2025-06-15T12:00:00Z');
        expect(annotations.getLastModified()).toBe('2025-06-15T12:00:00Z');
    });

    it('should produce correct toString', () => {
        const annotations = new Annotations([Role.USER], 3, '2025-01-01');
        const str = annotations.toString();
        expect(str).toContain('Annotations');
        expect(str).toContain('priority=3');
        expect(str).toContain('lastModified=2025-01-01');
    });
});
