/**
 * FluentSandbox.test.ts
 *
 * Integration tests for Fluent API + Sandbox.
 *
 * Validates:
 *   - .sandboxed() propagates config to GroupedToolBuilder
 *   - HATEOAS auto-prompting: description includes system instruction
 *   - Zero overhead when .sandboxed() is NOT used
 *   - initFusion().sandbox() creates a SandboxEngine
 */
import { describe, it, expect } from 'vitest';
import { initFusion, success, type ToolResponse } from '../../src/core/index.js';
import { SANDBOX_SYSTEM_INSTRUCTION } from '../../src/sandbox/index.js';

// ============================================================================
// FluentToolBuilder: .sandboxed() Integration
// ============================================================================

describe('FluentToolBuilder: .sandboxed()', () => {
    it('should include HATEOAS system instruction in description', () => {
        const f = initFusion();

        const tool = f.query('data.compute')
            .describe('Analyze records')
            .sandboxed({ timeout: 3000, memoryLimit: 64 })
            .withString('expression', 'JS function to apply')
            .handle(async (_input) => success('ok'));

        const definition = tool.buildToolDefinition();
        expect(definition.description).toContain('Zero-Trust Compute');
        expect(definition.description).toContain('arrow function');
        expect(definition.description).toContain('Analyze records');
    });

    it('should propagate sandbox config to GroupedToolBuilder', () => {
        const f = initFusion();

        // handle() returns a GroupedToolBuilder
        const builder = f.query('data.compute')
            .sandboxed({ timeout: 5000, memoryLimit: 128 })
            .withString('expr', 'Expression')
            .handle(async (_input) => success('ok'));

        // GroupedToolBuilder has getSandboxConfig()
        expect(builder.getSandboxConfig()).toEqual({
            timeout: 5000,
            memoryLimit: 128,
        });
    });

    it('should NOT include system instruction when not sandboxed', () => {
        const f = initFusion();

        const tool = f.query('users.list')
            .describe('List all users')
            .handle(async () => success('users'));

        const definition = tool.buildToolDefinition();
        expect(definition.description).not.toContain('Zero-Trust');
        expect(definition.description).not.toContain('arrow function');
    });

    it('should use default config when called with no args', () => {
        const f = initFusion();

        // handle() returns a GroupedToolBuilder
        const builder = f.query('data.filter')
            .sandboxed() // no config → defaults
            .withString('fn', 'Filter function')
            .handle(async () => success('ok'));

        expect(builder.getSandboxConfig()).toEqual({});
    });
});

// ============================================================================
// HATEOAS System Instruction Constant
// ============================================================================

describe('SANDBOX_SYSTEM_INSTRUCTION', () => {
    it('should contain required keywords for LLM guidance', () => {
        expect(SANDBOX_SYSTEM_INSTRUCTION).toContain('Zero-Trust Compute');
        expect(SANDBOX_SYSTEM_INSTRUCTION).toContain('arrow function');
        expect(SANDBOX_SYSTEM_INSTRUCTION).toContain('MUST');
        expect(SANDBOX_SYSTEM_INSTRUCTION).toContain('filter');
    });

    it('should warn against markdown formatting', () => {
        expect(SANDBOX_SYSTEM_INSTRUCTION).toContain('markdown');
    });
});

// ============================================================================
// initFusion().sandbox() Factory
// ============================================================================

describe('initFusion: f.sandbox()', () => {
    // Note: These tests check the factory capability.
    // SandboxEngine construction will throw if isolated-vm is not installed.
    // We test the interface presence without requiring the native module.

    it('should expose sandbox() method on FusionInstance', () => {
        const f = initFusion();
        expect(typeof f.sandbox).toBe('function');
    });
});

// ============================================================================
// GroupedToolBuilder: .sandbox() Direct API
// ============================================================================

describe('GroupedToolBuilder: .sandbox()', () => {
    it('should accept sandbox config via createTool API', async () => {
        const { createTool, success: s } = await import('../../src/core/index.js');

        const tool = createTool<void>('analytics')
            .sandbox({ timeout: 3000, memoryLimit: 64 })
            .action({
                name: 'compute',
                handler: async () => s('computed'),
            });

        // Should build without errors
        const definition = tool.buildToolDefinition();
        expect(definition.name).toBe('analytics');

        // Config should be stored
        expect(tool.getSandboxConfig()).toEqual({
            timeout: 3000,
            memoryLimit: 64,
        });
    });

    it('should return undefined config when not configured', async () => {
        const { createTool, success: s } = await import('../../src/core/index.js');

        const tool = createTool<void>('plain')
            .action({
                name: 'run',
                handler: async () => s('ok'),
            });

        expect(tool.getSandboxConfig()).toBeUndefined();
    });
});
