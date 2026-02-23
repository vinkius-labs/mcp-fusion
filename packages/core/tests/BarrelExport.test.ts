import { describe, it, expect } from 'vitest';

// ============================================================================
// Barrel Export Verification
// Ensures all public API exports are accessible from the package entry point
// ============================================================================

describe('Barrel Export (src/index.ts)', () => {
    it('should export all domain model classes and factories', async () => {
        const mod = await import('../src/index.js');

        // Domain model
        expect(mod.Role).toBeDefined();
        expect(mod.createIcon).toBeTypeOf('function');
        expect(mod.BaseModel).toBeDefined();
        expect(mod.Group).toBeDefined();
        expect(mod.GroupItem).toBeDefined();
        expect(mod.createAnnotations).toBeTypeOf('function');
        expect(mod.createToolAnnotations).toBeTypeOf('function');
        expect(mod.Tool).toBeDefined();
        expect(mod.PromptArgument).toBeDefined();
        expect(mod.Prompt).toBeDefined();
        expect(mod.Resource).toBeDefined();
    });

    it('should export all converter base classes', async () => {
        const mod = await import('../src/index.js');

        expect(mod.ConverterBase).toBeDefined();
        expect(mod.GroupConverterBase).toBeDefined();
        expect(mod.ToolConverterBase).toBeDefined();
        expect(mod.PromptConverterBase).toBeDefined();
        expect(mod.ResourceConverterBase).toBeDefined();
        expect(mod.ToolAnnotationsConverterBase).toBeDefined();
    });

    it('should export all framework components', async () => {
        const mod = await import('../src/index.js');

        // Response helpers
        expect(mod.success).toBeTypeOf('function');
        expect(mod.error).toBeTypeOf('function');
        expect(mod.required).toBeTypeOf('function');
        expect(mod.toonSuccess).toBeTypeOf('function');

        // Factory function
        expect(mod.createTool).toBeTypeOf('function');

        // Framework builders
        expect(mod.GroupedToolBuilder).toBeDefined();
        expect(mod.ActionGroupBuilder).toBeDefined();
        expect(mod.ToolRegistry).toBeDefined();

        // Result monad
        expect(mod.succeed).toBeTypeOf('function');
        expect(mod.fail).toBeTypeOf('function');

        // Schema
        expect(mod.generateToonDescription).toBeTypeOf('function');
    });
});

// ============================================================================
// Client Sub-path Barrel Export
// ============================================================================

describe('Client Barrel Export (src/client/index.ts)', () => {
    it('should export all client symbols from the client sub-path', async () => {
        const mod = await import('../src/client/index.js');

        expect(mod.createFusionClient).toBeTypeOf('function');
    });
});
