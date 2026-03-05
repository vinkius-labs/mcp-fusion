/**
 * Bugs #52 & #53 — Group cycle detection + GroupItem.addParentGroup consistency
 *
 * Bug #52: Group.addChildGroup() had no cycle detection. Adding a group
 * as a child of itself or creating an indirect cycle caused infinite
 * recursion in getRoot() and getFullyQualifiedNameRecursive().
 *
 * Bug #53: GroupItem.addParentGroup() is public and adds the group to
 * parentGroups but does NOT add the item to the group's children. This
 * creates inconsistent bidirectional links. Fix: mark as @internal and
 * document that callers should use Group.addChildTool/addChildPrompt/addChildResource.
 *
 * WHY EXISTING TESTS MISSED IT:
 * - Bug #52: Tests for Bug #7 (reparenting) test re-hosting between
 *   different parents but never self-cycles or indirect cycles.
 * - Bug #53: GroupItem.test.ts calls addParentGroup directly but never
 *   checks that the group's childTools also contains the item.
 *
 * THE FIXES:
 * - #52: Walk parent chain before adding; throw if child is an ancestor.
 * - #53: Mark addParentGroup as @internal (not protected, to keep backward compat).
 */
import { describe, it, expect } from 'vitest';
import { Group } from '../../src/domain/Group.js';
import { Tool } from '../../src/domain/Tool.js';

// ============================================================================
// Bug #52: Cycle Detection
// ============================================================================

describe('Bug #52: Group.addChildGroup() cycle detection', () => {
    it('throws on direct self-cycle (A → A)', () => {
        const a = new Group('a');
        expect(() => a.addChildGroup(a)).toThrow('Cycle detected');
    });

    it('throws on indirect cycle (A → B → A)', () => {
        const a = new Group('a');
        const b = new Group('b');
        a.addChildGroup(b);

        expect(() => b.addChildGroup(a)).toThrow('Cycle detected');
    });

    it('throws on deep indirect cycle (A → B → C → A)', () => {
        const a = new Group('a');
        const b = new Group('b');
        const c = new Group('c');
        a.addChildGroup(b);
        b.addChildGroup(c);

        expect(() => c.addChildGroup(a)).toThrow('Cycle detected');
    });

    it('error message includes group names', () => {
        const root = new Group('root');
        const child = new Group('child');
        root.addChildGroup(child);

        expect(() => child.addChildGroup(root)).toThrow("'root'");
        expect(() => child.addChildGroup(root)).toThrow("'child'");
    });

    it('allows valid tree structures without falsely detecting cycles', () => {
        const root = new Group('root');
        const a = new Group('a');
        const b = new Group('b');
        const c = new Group('c');

        root.addChildGroup(a);
        root.addChildGroup(b);
        a.addChildGroup(c);

        // Reparent c from a to b — should work fine
        b.addChildGroup(c);
        expect(c.parent).toBe(b);
        expect(a.childGroups).not.toContain(c);
        expect(b.childGroups).toContain(c);
    });

    it('getRoot() works after valid tree building', () => {
        const root = new Group('root');
        const mid = new Group('mid');
        const leaf = new Group('leaf');
        root.addChildGroup(mid);
        mid.addChildGroup(leaf);

        expect(leaf.getRoot()).toBe(root);
        expect(leaf.getFullyQualifiedName()).toBe('root.mid.leaf');
    });

    it('duplicate add returns false (no throw)', () => {
        const a = new Group('a');
        const b = new Group('b');
        expect(a.addChildGroup(b)).toBe(true);
        expect(a.addChildGroup(b)).toBe(false);  // already there, no cycle
    });
});

// ============================================================================
// Bug #53: GroupItem.addParentGroup bidirectional consistency
// ============================================================================

describe('Bug #53: GroupItem.addParentGroup consistency', () => {
    it('Group.addChildTool creates bidirectional links', () => {
        const group = new Group('api');
        const tool = new Tool('readFile');

        group.addChildTool(tool);

        // Bidirectional: group→tool AND tool→group
        expect(group.childTools).toContain(tool);
        expect(tool.parentGroups).toContain(group);
    });

    it('addParentGroup alone does NOT add item to group children (bug demo)', () => {
        const group = new Group('api');
        const tool = new Tool('readFile');

        // Calling addParentGroup directly creates a one-sided link
        tool.addParentGroup(group);

        // tool thinks it belongs to group...
        expect(tool.parentGroups).toContain(group);
        // ...but group doesn't know about tool
        expect(group.childTools).not.toContain(tool);
    });

    it('Group.addChildTool is the correct API for consistent links', () => {
        const group = new Group('fs');
        const tool = new Tool('write');

        // This is the correct way — addChildTool calls addParentGroup internally
        group.addChildTool(tool);
        expect(group.childTools).toContain(tool);
        expect(tool.parentGroups).toContain(group);

        // And removal is also bidirectional
        group.removeChildTool(tool);
        expect(group.childTools).not.toContain(tool);
        expect(tool.parentGroups).not.toContain(group);
    });
});
