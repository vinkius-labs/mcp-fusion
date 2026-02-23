import { describe, it, expect } from 'vitest';
import { Role } from '../../src/domain/Role.js';

describe('Role', () => {
    it('should have USER value', () => {
        expect(Role.USER).toBe('USER');
    });

    it('should have ASSISTANT value', () => {
        expect(Role.ASSISTANT).toBe('ASSISTANT');
    });

    it('should only contain two values', () => {
        const values = Object.values(Role);
        expect(values).toHaveLength(2);
        expect(values).toContain('USER');
        expect(values).toContain('ASSISTANT');
    });
});
