import { describe, it, expect } from 'vitest';
import { type Annotations, createAnnotations } from '../src/domain/Annotations.js';
import { Role } from '../src/domain/Role.js';

describe('Annotations', () => {
    it('should create with all parameters', () => {
        const annotations = createAnnotations({
            audience: [Role.USER],
            priority: 1,
            lastModified: '2025-01-01T00:00:00Z',
        });
        expect(annotations.audience).toEqual([Role.USER]);
        expect(annotations.priority).toBe(1);
        expect(annotations.lastModified).toBe('2025-01-01T00:00:00Z');
    });

    it('should create with default undefined values', () => {
        const annotations = createAnnotations();
        expect(annotations.audience).toBeUndefined();
        expect(annotations.priority).toBeUndefined();
        expect(annotations.lastModified).toBeUndefined();
    });

    it('should create with audience', () => {
        const annotations = createAnnotations({ audience: [Role.USER, Role.ASSISTANT] });
        expect(annotations.audience).toEqual([Role.USER, Role.ASSISTANT]);
    });

    it('should create with priority', () => {
        const annotations = createAnnotations({ priority: 5 });
        expect(annotations.priority).toBe(5);
    });

    it('should create with lastModified', () => {
        const annotations = createAnnotations({ lastModified: '2025-06-15T12:00:00Z' });
        expect(annotations.lastModified).toBe('2025-06-15T12:00:00Z');
    });

    it('should satisfy Annotations interface', () => {
        const annotations: Annotations = createAnnotations({
            audience: [Role.USER],
            priority: 3,
        });
        expect(annotations.audience).toEqual([Role.USER]);
        expect(annotations.priority).toBe(3);
    });
});
