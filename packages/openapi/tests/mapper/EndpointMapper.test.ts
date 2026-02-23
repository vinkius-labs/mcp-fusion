import { describe, it, expect } from 'vitest';
import { mapEndpoints, inferAnnotations } from '../../src/mapper/EndpointMapper.js';
import type { ApiSpec, ApiAction, ApiGroup } from '../../src/parser/types.js';

// ── Helpers ──

function makeSpec(groups: ApiGroup[]): ApiSpec {
    return { title: 'Test', version: '1.0.0', servers: [], groups };
}

function makeAction(overrides: Partial<ApiAction>): ApiAction {
    return {
        name: '',
        method: 'GET',
        path: '/test',
        params: [],
        responses: [],
        tags: [],
        ...overrides,
    };
}

// ============================================================================
// EndpointMapper Tests
// ============================================================================

describe('EndpointMapper', () => {
    // ── Naming Cascade ──

    describe('Naming Cascade', () => {
        it('should use operationId → snake_case as priority 1', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [makeAction({ operationId: 'getPetById', path: '/pet/{petId}' })],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('get_pet_by_id');
        });

        it('should convert camelCase operationId correctly', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [makeAction({ operationId: 'findPetsByTags', path: '/pet/findByTags' })],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('find_pets_by_tags');
        });

        it('should convert simple operationId', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [makeAction({ operationId: 'addPet', method: 'POST', path: '/pet' })],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('add_pet');
        });

        it('should fallback to method_segment when no operationId', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [makeAction({ method: 'GET', path: '/pets' })],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('list_pets');
        });

        it('should use POST → create fallback', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [makeAction({ method: 'POST', path: '/pets' })],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('create_pets');
        });

        it('should use DELETE → delete fallback', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [makeAction({ method: 'DELETE', path: '/pets/{petId}' })],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('delete_pets');
        });

        it('should use PUT → update fallback', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [makeAction({ method: 'PUT', path: '/pets/{petId}' })],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('update_pets');
        });
    });

    // ── Deduplication ──

    describe('Deduplication', () => {
        it('should append _2 for duplicate names', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [
                    makeAction({ operationId: 'listPets', method: 'GET', path: '/pets' }),
                    makeAction({ operationId: 'listPets', method: 'GET', path: '/v2/pets' }),
                ],
            }]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('list_pets');
            expect(result.groups[0]!.actions[1]!.name).toBe('list_pets_2');
        });

        it('should handle triple duplicates', () => {
            const spec = makeSpec([{
                tag: 'pet',
                actions: [
                    makeAction({ operationId: 'listPets' }),
                    makeAction({ operationId: 'listPets' }),
                    makeAction({ operationId: 'listPets' }),
                ],
            }]);
            const result = mapEndpoints(spec);
            const names = result.groups[0]!.actions.map(a => a.name);
            expect(names).toEqual(['list_pets', 'list_pets_2', 'list_pets_3']);
        });
    });

    // ── Annotation Inference ──

    describe('Annotation Inference', () => {
        it('GET → readOnly: true', () => {
            expect(inferAnnotations('GET')).toEqual({ readOnly: true });
        });

        it('HEAD → readOnly: true', () => {
            expect(inferAnnotations('HEAD')).toEqual({ readOnly: true });
        });

        it('OPTIONS → readOnly: true', () => {
            expect(inferAnnotations('OPTIONS')).toEqual({ readOnly: true });
        });

        it('DELETE → destructive: true', () => {
            expect(inferAnnotations('DELETE')).toEqual({ destructive: true });
        });

        it('PUT → idempotent: true', () => {
            expect(inferAnnotations('PUT')).toEqual({ idempotent: true });
        });

        it('POST → no annotations', () => {
            expect(inferAnnotations('POST')).toEqual({});
        });

        it('PATCH → no annotations', () => {
            expect(inferAnnotations('PATCH')).toEqual({});
        });

        it('should be case-insensitive', () => {
            expect(inferAnnotations('get')).toEqual({ readOnly: true });
            expect(inferAnnotations('delete')).toEqual({ destructive: true });
        });
    });

    // ── Cross-Group Deduplication ──

    describe('Cross-Group Naming', () => {
        it('should deduplicate across groups', () => {
            const spec = makeSpec([
                { tag: 'pet', actions: [makeAction({ operationId: 'list' })] },
                { tag: 'store', actions: [makeAction({ operationId: 'list' })] },
            ]);
            const result = mapEndpoints(spec);
            expect(result.groups[0]!.actions[0]!.name).toBe('list');
            expect(result.groups[1]!.actions[0]!.name).toBe('list_2');
        });
    });
});
