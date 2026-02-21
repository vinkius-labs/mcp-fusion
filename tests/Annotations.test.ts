import { describe, it, expect } from 'vitest';
import { Annotations } from '../src/Annotations.js';
import { Role } from '../src/Role.js';

describe('Annotations', () => {
    it('should construct with all parameters', () => {
        const annotations = new Annotations([Role.USER], 1, '2025-01-01T00:00:00Z');
        expect(annotations.audience).toEqual([Role.USER]);
        expect(annotations.priority).toBe(1);
        expect(annotations.lastModified).toBe('2025-01-01T00:00:00Z');
    });

    it('should set and get audience', () => {
        const annotations = new Annotations();
        annotations.audience = [Role.USER, Role.ASSISTANT];
        expect(annotations.audience).toEqual([Role.USER, Role.ASSISTANT]);
    });

    it('should set and get priority', () => {
        const annotations = new Annotations();
        annotations.priority = 5;
        expect(annotations.priority).toBe(5);
    });

    it('should set and get lastModified', () => {
        const annotations = new Annotations();
        annotations.lastModified = '2025-06-15T12:00:00Z';
        expect(annotations.lastModified).toBe('2025-06-15T12:00:00Z');
    });

    it('should produce correct toString', () => {
        const annotations = new Annotations([Role.USER], 3, '2025-01-01');
        const str = annotations.toString();
        expect(str).toContain('Annotations');
        expect(str).toContain('priority=3');
        expect(str).toContain('lastModified=2025-01-01');
    });
});
