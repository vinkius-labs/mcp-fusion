import { describe, it, expect } from 'vitest';
import { Tool } from '../../src/domain/Tool.js';
import { createToolAnnotations } from '../../src/domain/ToolAnnotations.js';
import { Group } from '../../src/domain/Group.js';

describe('Tool', () => {
    it('should create with name', () => {
        const tool = new Tool('run_pipeline');
        expect(tool.name).toBe('run_pipeline');
    });

    it('should set and get inputSchema', () => {
        const tool = new Tool('deploy');
        tool.inputSchema = '{"type":"object","properties":{"env":{"type":"string"}}}';
        expect(tool.inputSchema).toContain('env');
    });

    it('should set and get outputSchema', () => {
        const tool = new Tool('deploy');
        tool.outputSchema = '{"type":"object","properties":{"status":{"type":"string"}}}';
        expect(tool.outputSchema).toContain('status');
    });

    it('should set and get toolAnnotations', () => {
        const tool = new Tool('deploy');
        const annotations = createToolAnnotations({
            destructiveHint: true,
            readOnlyHint: false,
        });
        tool.toolAnnotations = annotations;
        expect(tool.toolAnnotations?.destructiveHint).toBe(true);
        expect(tool.toolAnnotations?.readOnlyHint).toBe(false);
    });

    it('should set title and description', () => {
        const tool = new Tool('check_status');
        tool.title = 'Check Status';
        tool.description = 'Checks the pipeline status';
        expect(tool.title).toBe('Check Status');
        expect(tool.description).toBe('Checks the pipeline status');
    });

    it('should return name as fully qualified name', () => {
        const tool = new Tool('build');
        expect(tool.getFullyQualifiedName()).toBe('build');
    });

    it('should manage parent groups', () => {
        const tool = new Tool('build');
        const group = new Group('ci');
        tool.addParentGroup(group);
        expect(tool.parentGroups).toHaveLength(1);
        expect(tool.parentGroups[0]?.name).toBe('ci');
    });

    it('should not add duplicate parent groups', () => {
        const tool = new Tool('build');
        const group = new Group('ci');
        tool.addParentGroup(group);
        tool.addParentGroup(group);
        expect(tool.parentGroups).toHaveLength(1);
    });
});
