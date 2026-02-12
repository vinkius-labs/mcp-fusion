import { describe, it, expect } from 'vitest';
import { Resource } from '../src/Resource.js';
import { Annotations } from '../src/Annotations.js';
import { Role } from '../src/Role.js';
import { Group } from '../src/Group.js';

describe('Resource', () => {
    it('should create with name', () => {
        const resource = new Resource('config');
        expect(resource.getName()).toBe('config');
    });

    it('should initialize with undefined values', () => {
        const resource = new Resource('config');
        expect(resource.getUri()).toBeUndefined();
        expect(resource.getSize()).toBeUndefined();
        expect(resource.getMimeType()).toBeUndefined();
        expect(resource.getAnnotations()).toBeUndefined();
    });

    it('should set and get uri', () => {
        const resource = new Resource('config');
        resource.setUri('file:///etc/config.yaml');
        expect(resource.getUri()).toBe('file:///etc/config.yaml');
    });

    it('should set and get size', () => {
        const resource = new Resource('config');
        resource.setSize(1024);
        expect(resource.getSize()).toBe(1024);
    });

    it('should set and get mimeType', () => {
        const resource = new Resource('config');
        resource.setMimeType('application/yaml');
        expect(resource.getMimeType()).toBe('application/yaml');
    });

    it('should set and get annotations', () => {
        const resource = new Resource('config');
        const annotations = new Annotations([Role.USER], 1, '2025-01-01');
        resource.setAnnotations(annotations);
        expect(resource.getAnnotations()!.getPriority()).toBe(1);
        expect(resource.getAnnotations()!.getAudience()).toEqual([Role.USER]);
    });

    it('should manage parent groups', () => {
        const resource = new Resource('config');
        const group = new Group('settings');
        resource.addParentGroup(group);
        expect(resource.getParentGroups()).toHaveLength(1);
        expect(resource.getParentGroups()[0].getName()).toBe('settings');
    });

    it('should return name as fully qualified name', () => {
        const resource = new Resource('config');
        expect(resource.getFullyQualifiedName()).toBe('config');
    });

    it('should produce correct toString', () => {
        const resource = new Resource('readme');
        resource.setUri('file:///README.md');
        resource.setMimeType('text/markdown');
        const str = resource.toString();
        expect(str).toContain('Resource');
        expect(str).toContain('name=readme');
        expect(str).toContain('text/markdown');
    });
});
