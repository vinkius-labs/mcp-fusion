import { describe, it, expect } from 'vitest';
import { Resource } from '../src/Resource.js';
import { Annotations } from '../src/Annotations.js';
import { Role } from '../src/Role.js';
import { Group } from '../src/Group.js';

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
        const annotations = new Annotations([Role.USER], 1, '2025-01-01');
        resource.annotations = annotations;
        expect(resource.annotations!.priority).toBe(1);
        expect(resource.annotations!.audience).toEqual([Role.USER]);
    });

    it('should manage parent groups', () => {
        const resource = new Resource('config');
        const group = new Group('settings');
        resource.addParentGroup(group);
        expect(resource.parentGroups).toHaveLength(1);
        expect(resource.parentGroups[0].name).toBe('settings');
    });

    it('should return name as fully qualified name', () => {
        const resource = new Resource('config');
        expect(resource.getFullyQualifiedName()).toBe('config');
    });

    it('should produce correct toString', () => {
        const resource = new Resource('readme');
        resource.uri = 'file:///README.md';
        resource.mimeType = 'text/markdown';
        const str = resource.toString();
        expect(str).toContain('Resource');
        expect(str).toContain('name=readme');
        expect(str).toContain('text/markdown');
    });
});
