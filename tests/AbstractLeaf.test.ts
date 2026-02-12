import { describe, it, expect } from 'vitest';
import { Tool } from '../src/Tool.js';
import { Group } from '../src/Group.js';

describe('AbstractLeaf (via Tool)', () => {
    it('should start with no parent groups', () => {
        const tool = new Tool('test');
        expect(tool.getParentGroups()).toHaveLength(0);
    });

    it('should add parent group', () => {
        const tool = new Tool('test');
        const group = new Group('parent');
        expect(tool.addParentGroup(group)).toBe(true);
        expect(tool.getParentGroups()).toHaveLength(1);
    });

    it('should not add duplicate parent group', () => {
        const tool = new Tool('test');
        const group = new Group('parent');
        tool.addParentGroup(group);
        expect(tool.addParentGroup(group)).toBe(false);
        expect(tool.getParentGroups()).toHaveLength(1);
    });

    it('should throw when adding null parent group', () => {
        const tool = new Tool('test');
        expect(() => tool.addParentGroup(null as any)).toThrow('parentGroup must not be null');
    });

    it('should remove parent group', () => {
        const tool = new Tool('test');
        const group = new Group('parent');
        tool.addParentGroup(group);
        expect(tool.removeParentGroup(group)).toBe(true);
        expect(tool.getParentGroups()).toHaveLength(0);
    });

    it('should return false when removing non-existing parent group', () => {
        const tool = new Tool('test');
        const group = new Group('parent');
        expect(tool.removeParentGroup(group)).toBe(false);
    });

    it('should get parent group roots', () => {
        const root = new Group('root');
        const child = new Group('child');
        root.addChildGroup(child);

        const tool = new Tool('test');
        tool.addParentGroup(child);

        const roots = tool.getParentGroupRoots();
        expect(roots).toHaveLength(1);
        expect(roots[0].getName()).toBe('root');
    });

    it('should get root when parent is already root', () => {
        const root = new Group('root');
        const tool = new Tool('test');
        tool.addParentGroup(root);

        const roots = tool.getParentGroupRoots();
        expect(roots).toHaveLength(1);
        expect(roots[0].getName()).toBe('root');
    });

    it('should handle multiple parent groups', () => {
        const tool = new Tool('shared_tool');
        const group1 = new Group('group1');
        const group2 = new Group('group2');
        tool.addParentGroup(group1);
        tool.addParentGroup(group2);
        expect(tool.getParentGroups()).toHaveLength(2);
    });
});
