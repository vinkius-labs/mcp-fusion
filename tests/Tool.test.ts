import { describe, it, expect } from 'vitest';
import { Tool } from '../src/Tool.js';
import { ToolAnnotations } from '../src/ToolAnnotations.js';
import { Group } from '../src/Group.js';

describe('Tool', () => {
    it('should create with name', () => {
        const tool = new Tool('run_pipeline');
        expect(tool.getName()).toBe('run_pipeline');
    });

    it('should set and get inputSchema', () => {
        const tool = new Tool('deploy');
        tool.setInputSchema('{"type":"object","properties":{"env":{"type":"string"}}}');
        expect(tool.getInputSchema()).toContain('env');
    });

    it('should set and get outputSchema', () => {
        const tool = new Tool('deploy');
        tool.setOutputSchema('{"type":"object","properties":{"status":{"type":"string"}}}');
        expect(tool.getOutputSchema()).toContain('status');
    });

    it('should set and get toolAnnotations', () => {
        const tool = new Tool('deploy');
        const annotations = new ToolAnnotations();
        annotations.setDestructiveHint(true);
        annotations.setReadOnlyHint(false);
        tool.setToolAnnotations(annotations);
        expect(tool.getToolAnnotations()!.getDestructiveHint()).toBe(true);
        expect(tool.getToolAnnotations()!.getReadOnlyHint()).toBe(false);
    });

    it('should set title and description', () => {
        const tool = new Tool('check_status');
        tool.setTitle('Check Status');
        tool.setDescription('Checks the pipeline status');
        expect(tool.getTitle()).toBe('Check Status');
        expect(tool.getDescription()).toBe('Checks the pipeline status');
    });

    it('should return name as fully qualified name', () => {
        const tool = new Tool('build');
        expect(tool.getFullyQualifiedName()).toBe('build');
    });

    it('should manage parent groups', () => {
        const tool = new Tool('build');
        const group = new Group('ci');
        tool.addParentGroup(group);
        expect(tool.getParentGroups()).toHaveLength(1);
        expect(tool.getParentGroups()[0].getName()).toBe('ci');
    });

    it('should not add duplicate parent groups', () => {
        const tool = new Tool('build');
        const group = new Group('ci');
        tool.addParentGroup(group);
        tool.addParentGroup(group);
        expect(tool.getParentGroups()).toHaveLength(1);
    });

    it('should produce correct toString', () => {
        const tool = new Tool('deploy');
        tool.setTitle('Deploy');
        const str = tool.toString();
        expect(str).toContain('Tool');
        expect(str).toContain('name=deploy');
    });
});
