import { describe, it, expect } from 'vitest';
import { resolveRefs } from '../../src/parser/RefResolver.js';

describe('RefResolver — $ref deep clone isolation', () => {
    it('should return independent copies for multiple refs to the same definition', () => {
        const doc = {
            components: {
                schemas: {
                    Address: {
                        type: 'object',
                        properties: {
                            street: { type: 'string' },
                            city: { type: 'string' },
                        },
                    },
                },
            },
            paths: {
                '/users': {
                    get: {
                        responses: {
                            '200': { schema: { $ref: '#/components/schemas/Address' } },
                        },
                    },
                },
                '/orders': {
                    get: {
                        responses: {
                            '200': { schema: { $ref: '#/components/schemas/Address' } },
                        },
                    },
                },
            },
        };

        resolveRefs(doc);

        const userSchema = (doc.paths['/users'].get.responses['200'] as any).schema;
        const orderSchema = (doc.paths['/orders'].get.responses['200'] as any).schema;

        // Both should have the same shape
        expect(userSchema.type).toBe('object');
        expect(orderSchema.type).toBe('object');
        expect(userSchema.properties.street.type).toBe('string');
        expect(orderSchema.properties.street.type).toBe('string');

        // But they must be DIFFERENT object references
        expect(userSchema).not.toBe(orderSchema);

        // Mutating one should NOT affect the other
        userSchema.properties.extra = { type: 'number' };
        expect(orderSchema.properties).not.toHaveProperty('extra');
    });

    it('should still resolve nested refs correctly', () => {
        const doc = {
            components: {
                schemas: {
                    Name: { type: 'string' },
                    Person: {
                        type: 'object',
                        properties: {
                            name: { $ref: '#/components/schemas/Name' },
                        },
                    },
                },
            },
            root: { $ref: '#/components/schemas/Person' },
        };

        resolveRefs(doc);

        const person = doc.root as any;
        expect(person.type).toBe('object');
        expect(person.properties.name.type).toBe('string');
    });

    it('should handle circular refs without infinite recursion', () => {
        const doc = {
            components: {
                schemas: {
                    Node: {
                        type: 'object',
                        properties: {
                            child: { $ref: '#/components/schemas/Node' },
                        },
                    },
                },
            },
            root: { $ref: '#/components/schemas/Node' },
        };

        // Should not hang or throw
        resolveRefs(doc);

        const root = doc.root as any;
        expect(root.type).toBe('object');
        // After one level of expansion, the nested child carries the placeholder
        expect(root.properties.child.type).toBe('object');
        expect(root.properties.child.properties.child.description).toContain('[Circular');
    });

    it('should handle unresolvable refs gracefully', () => {
        const doc = {
            root: { $ref: '#/components/schemas/Missing' },
        };

        resolveRefs(doc);

        const root = doc.root as any;
        expect(root.description).toContain('[Unresolved');
    });
});
