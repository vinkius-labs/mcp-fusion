import { describe, it, expect } from 'vitest';
import { Group } from '../src/Group.js';
import { Tool } from '../src/Tool.js';
import { Prompt } from '../src/Prompt.js';
import { Resource } from '../src/Resource.js';

describe('Group', () => {
    describe('basic properties', () => {
        it('should create with name', () => {
            const group = new Group('devops');
            expect(group.name).toBe('devops');
        });

        it('should be root when no parent', () => {
            const group = new Group('devops');
            expect(group.isRoot()).toBe(true);
            expect(group.parent).toBeNull();
        });

        it('should return itself as root when no parent', () => {
            const group = new Group('devops');
            expect(group.getRoot()).toBe(group);
        });

        it('should set title and description', () => {
            const group = new Group('devops');
            group.title = 'DevOps';
            group.description = 'DevOps tools';
            expect(group.title).toBe('DevOps');
            expect(group.description).toBe('DevOps tools');
        });
    });

    describe('fully qualified name', () => {
        it('should return name for root group', () => {
            const group = new Group('devops');
            expect(group.getFullyQualifiedName()).toBe('devops');
        });

        it('should return parent.child for nested group', () => {
            const root = new Group('devops');
            const child = new Group('ci');
            root.addChildGroup(child);
            expect(child.getFullyQualifiedName()).toBe('devops.ci');
        });

        it('should handle deep nesting', () => {
            const root = new Group('devops');
            const mid = new Group('ci');
            const leaf = new Group('build');
            root.addChildGroup(mid);
            mid.addChildGroup(leaf);
            expect(leaf.getFullyQualifiedName()).toBe('devops.ci.build');
        });

        it('should use custom separator', () => {
            const root = new Group('devops', '/');
            const child = new Group('ci', '/');
            root.addChildGroup(child);
            expect(child.getFullyQualifiedName()).toBe('devops/ci');
        });
    });

    describe('child groups', () => {
        it('should start with empty children', () => {
            const group = new Group('devops');
            expect(group.childGroups).toHaveLength(0);
        });

        it('should add child group', () => {
            const parent = new Group('devops');
            const child = new Group('ci');
            expect(parent.addChildGroup(child)).toBe(true);
            expect(parent.childGroups).toHaveLength(1);
            expect(child.parent).toBe(parent);
            expect(child.isRoot()).toBe(false);
        });

        it('should not add duplicate child group', () => {
            const parent = new Group('devops');
            const child = new Group('ci');
            parent.addChildGroup(child);
            expect(parent.addChildGroup(child)).toBe(false);
            expect(parent.childGroups).toHaveLength(1);
        });

        it('should remove child group', () => {
            const parent = new Group('devops');
            const child = new Group('ci');
            parent.addChildGroup(child);
            expect(parent.removeChildGroup(child)).toBe(true);
            expect(parent.childGroups).toHaveLength(0);
            expect(child.parent).toBeNull();
        });

        it('should return false when removing non-existing child group', () => {
            const parent = new Group('devops');
            const child = new Group('ci');
            expect(parent.removeChildGroup(child)).toBe(false);
        });

        it('should get root from deeply nested group', () => {
            const root = new Group('devops');
            const mid = new Group('ci');
            const leaf = new Group('build');
            root.addChildGroup(mid);
            mid.addChildGroup(leaf);
            expect(leaf.getRoot()).toBe(root);
            expect(mid.getRoot()).toBe(root);
        });
    });

    describe('child tools', () => {
        it('should start with empty tools', () => {
            const group = new Group('devops');
            expect(group.childTools).toHaveLength(0);
        });

        it('should add child tool and set bidirectional reference', () => {
            const group = new Group('ci');
            const tool = new Tool('run_pipeline');
            expect(group.addChildTool(tool)).toBe(true);
            expect(group.childTools).toHaveLength(1);
            expect(tool.parentGroups).toContain(group);
        });

        it('should not add duplicate tool', () => {
            const group = new Group('ci');
            const tool = new Tool('run_pipeline');
            group.addChildTool(tool);
            expect(group.addChildTool(tool)).toBe(false);
            expect(group.childTools).toHaveLength(1);
        });

        it('should remove child tool and clear bidirectional reference', () => {
            const group = new Group('ci');
            const tool = new Tool('run_pipeline');
            group.addChildTool(tool);
            expect(group.removeChildTool(tool)).toBe(true);
            expect(group.childTools).toHaveLength(0);
            expect(tool.parentGroups).not.toContain(group);
        });

        it('should return false when removing non-existing tool', () => {
            const group = new Group('ci');
            const tool = new Tool('run_pipeline');
            expect(group.removeChildTool(tool)).toBe(false);
        });
    });

    describe('child prompts', () => {
        it('should start with empty prompts', () => {
            const group = new Group('templates');
            expect(group.childPrompts).toHaveLength(0);
        });

        it('should add child prompt and set bidirectional reference', () => {
            const group = new Group('templates');
            const prompt = new Prompt('code_review');
            expect(group.addChildPrompt(prompt)).toBe(true);
            expect(group.childPrompts).toHaveLength(1);
            expect(prompt.parentGroups).toContain(group);
        });

        it('should not add duplicate prompt', () => {
            const group = new Group('templates');
            const prompt = new Prompt('code_review');
            group.addChildPrompt(prompt);
            expect(group.addChildPrompt(prompt)).toBe(false);
        });

        it('should remove child prompt', () => {
            const group = new Group('templates');
            const prompt = new Prompt('code_review');
            group.addChildPrompt(prompt);
            expect(group.removeChildPrompt(prompt)).toBe(true);
            expect(group.childPrompts).toHaveLength(0);
            expect(prompt.parentGroups).not.toContain(group);
        });
    });

    describe('child resources', () => {
        it('should start with empty resources', () => {
            const group = new Group('config');
            expect(group.childResources).toHaveLength(0);
        });

        it('should add child resource and set bidirectional reference', () => {
            const group = new Group('config');
            const resource = new Resource('settings.yaml');
            expect(group.addChildResource(resource)).toBe(true);
            expect(group.childResources).toHaveLength(1);
            expect(resource.parentGroups).toContain(group);
        });

        it('should not add duplicate resource', () => {
            const group = new Group('config');
            const resource = new Resource('settings.yaml');
            group.addChildResource(resource);
            expect(group.addChildResource(resource)).toBe(false);
        });

        it('should remove child resource', () => {
            const group = new Group('config');
            const resource = new Resource('settings.yaml');
            group.addChildResource(resource);
            expect(group.removeChildResource(resource)).toBe(true);
            expect(group.childResources).toHaveLength(0);
            expect(resource.parentGroups).not.toContain(group);
        });
    });

    describe('complex tree', () => {
        it('should build a full hierarchy', () => {
            const root = new Group('devops');
            const ci = new Group('ci');
            const deploy = new Group('deploy');
            root.addChildGroup(ci);
            root.addChildGroup(deploy);

            const runPipeline = new Tool('run_pipeline');
            const checkStatus = new Tool('check_status');
            ci.addChildTool(runPipeline);
            ci.addChildTool(checkStatus);

            const deployStaging = new Tool('deploy_staging');
            const deployProd = new Tool('deploy_production');
            deploy.addChildTool(deployStaging);
            deploy.addChildTool(deployProd);

            const reviewPrompt = new Prompt('review_deploy');
            deploy.addChildPrompt(reviewPrompt);

            const config = new Resource('config.yaml');
            root.addChildResource(config);

            expect(root.childGroups).toHaveLength(2);
            expect(ci.childTools).toHaveLength(2);
            expect(deploy.childTools).toHaveLength(2);
            expect(deploy.childPrompts).toHaveLength(1);
            expect(root.childResources).toHaveLength(1);

            expect(ci.getFullyQualifiedName()).toBe('devops.ci');
            expect(deploy.getFullyQualifiedName()).toBe('devops.deploy');
            expect(deployStaging.parentGroups[0].getFullyQualifiedName()).toBe('devops.deploy');
        });
    });

    describe('manual reparenting via direct assignment', () => {
        it('should reassign parent directly', () => {
            const deploy = new Group('deploy');
            const testing = new Group('testing');
            const staging = new Group('staging');
            deploy.addChildGroup(staging);
            expect(staging.parent).toBe(deploy);

            staging.parent = testing;
            expect(staging.parent).toBe(testing);
            expect(staging.isRoot()).toBe(false);
        });
    });

    describe('remove non-existing children', () => {
        it('should return false when removing a prompt that was never added', () => {
            const group = new Group('templates');
            const prompt = new Prompt('never_added');
            expect(group.removeChildPrompt(prompt)).toBe(false);
        });

        it('should return false when removing a resource that was never added', () => {
            const group = new Group('config');
            const resource = new Resource('ghost.yaml');
            expect(group.removeChildResource(resource)).toBe(false);
        });
    });
});
