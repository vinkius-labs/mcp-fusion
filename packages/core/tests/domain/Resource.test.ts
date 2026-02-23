import { describe, it, expect } from 'vitest';
import { Resource } from '../../src/domain/Resource.js';
import { createAnnotations } from '../../src/domain/Annotations.js';
import { Role } from '../../src/domain/Role.js';
import { Group } from '../../src/domain/Group.js';

describe('Resource', () => {
    it('should create with name', () => {
        const resource = new Resource('config');
        expect(resource.name).toBe('config');
    });

    it('should initialize with undefined values', () => {
        const resource = new Resource('config');
        expect(resource.uri).toBeUndefined();
        expect(resource.size).toBeUndefined();
        expect(resource.mimeType).toBeUndefined();
        expect(resource.annotations).toBeUndefined();
    });

    it('should set and get uri', () => {
        const resource = new Resource('config');
        resource.uri = 'file:///etc/config.yaml';
        expect(resource.uri).toBe('file:///etc/config.yaml');
    });

    it('should set and get size', () => {
        const resource = new Resource('config');
        resource.size = 1024;
        expect(resource.size).toBe(1024);
    });

    it('should set and get mimeType', () => {
        const resource = new Resource('config');
        resource.mimeType = 'application/yaml';
        expect(resource.mimeType).toBe('application/yaml');
    });

    it('should set and get annotations', () => {
        const resource = new Resource('config');
        const annotations = createAnnotations({
            audience: [Role.USER],
            priority: 1,
            lastModified: '2025-01-01',
        });
        resource.annotations = annotations;
        expect(resource.annotations?.priority).toBe(1);
        expect(resource.annotations?.audience).toEqual([Role.USER]);
    });

    it('should manage parent groups', () => {
        const resource = new Resource('config');
        const group = new Group('settings');
        resource.addParentGroup(group);
        expect(resource.parentGroups).toHaveLength(1);
        expect(resource.parentGroups[0]?.name).toBe('settings');
    });

    it('should return name as fully qualified name', () => {
        const resource = new Resource('config');
        expect(resource.getFullyQualifiedName()).toBe('config');
    });
});
