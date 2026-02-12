import { describe, it, expect } from 'vitest';

// ============================================================================
// Barrel Export Verification
// Ensures all public API exports are accessible from the package entry point
// ============================================================================

describe('Barrel Export (src/index.ts)', () => {
    it('should export all domain model classes', async () => {
        const mod = await import('../src/index.js');

        // Domain model
        expect(mod.Role).toBeDefined();
        expect(mod.Icon).toBeDefined();
        expect(mod.AbstractBase).toBeDefined();
        expect(mod.Group).toBeDefined();
        expect(mod.AbstractLeaf).toBeDefined();
        expect(mod.Annotations).toBeDefined();
        expect(mod.ToolAnnotations).toBeDefined();
        expect(mod.Tool).toBeDefined();
        expect(mod.PromptArgument).toBeDefined();
        expect(mod.Prompt).toBeDefined();
        expect(mod.Resource).toBeDefined();
    });

    it('should export all converter abstract classes', async () => {
        const mod = await import('../src/index.js');

        expect(mod.AbstractGroupConverter).toBeDefined();
        expect(mod.AbstractToolConverter).toBeDefined();
        expect(mod.AbstractPromptConverter).toBeDefined();
        expect(mod.AbstractResourceConverter).toBeDefined();
        expect(mod.AbstractToolAnnotationsConverter).toBeDefined();
    });

    it('should export all framework components', async () => {
        const mod = await import('../src/index.js');

        // Framework helpers
        expect(mod.success).toBeTypeOf('function');
        expect(mod.error).toBeTypeOf('function');
        expect(mod.required).toBeTypeOf('function');

        // Framework builders
        expect(mod.GroupedToolBuilder).toBeDefined();
        expect(mod.ActionGroupBuilder).toBeDefined();
        expect(mod.ToolRegistry).toBeDefined();
    });
});
