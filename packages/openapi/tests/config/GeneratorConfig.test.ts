import { describe, it, expect } from 'vitest';
import { mergeConfig, DEFAULT_CONFIG } from '../../src/config/GeneratorConfig.js';
import type { GeneratorConfig, PartialConfig } from '../../src/config/GeneratorConfig.js';

// ============================================================================
// GeneratorConfig Tests
// ============================================================================

describe('GeneratorConfig', () => {
    // ── Default Config ──

    describe('DEFAULT_CONFIG', () => {
        it('should have all features enabled by default', () => {
            expect(DEFAULT_CONFIG.features.tags).toBe(true);
            expect(DEFAULT_CONFIG.features.annotations).toBe(true);
            expect(DEFAULT_CONFIG.features.presenters).toBe(true);
            expect(DEFAULT_CONFIG.features.descriptions).toBe(true);
            expect(DEFAULT_CONFIG.features.serverFile).toBe(true);
        });

        it('should have toonDescription disabled by default', () => {
            expect(DEFAULT_CONFIG.features.toonDescription).toBe(false);
        });

        it('should default to snake_case naming', () => {
            expect(DEFAULT_CONFIG.naming.style).toBe('snake_case');
        });

        it('should default to stdio transport', () => {
            expect(DEFAULT_CONFIG.server.transport).toBe('stdio');
        });

        it('should default to flat toolExposition', () => {
            expect(DEFAULT_CONFIG.server.toolExposition).toBe('flat');
        });

        it('should default to underscore actionSeparator', () => {
            expect(DEFAULT_CONFIG.server.actionSeparator).toBe('_');
        });

        it('should default deprecated to comment', () => {
            expect(DEFAULT_CONFIG.features.deprecated).toBe('comment');
        });

        it('should have empty tag filters', () => {
            expect(DEFAULT_CONFIG.includeTags).toEqual([]);
            expect(DEFAULT_CONFIG.excludeTags).toEqual([]);
        });
    });

    // ── mergeConfig ──

    describe('mergeConfig()', () => {
        it('should return defaults for empty partial', () => {
            const config = mergeConfig({});
            expect(config.features).toEqual(DEFAULT_CONFIG.features);
            expect(config.naming).toEqual(DEFAULT_CONFIG.naming);
        });

        it('should override individual features', () => {
            const config = mergeConfig({ features: { tags: false } });
            expect(config.features.tags).toBe(false);
            expect(config.features.annotations).toBe(true); // unchanged
        });

        it('should override naming style', () => {
            const config = mergeConfig({ naming: { style: 'camelCase' } });
            expect(config.naming.style).toBe('camelCase');
            expect(config.naming.deduplication).toBe(true); // unchanged
        });

        it('should override server config', () => {
            const config = mergeConfig({ server: { name: 'my-server', version: '3.0.0' } });
            expect(config.server.name).toBe('my-server');
            expect(config.server.version).toBe('3.0.0');
            expect(config.server.transport).toBe('stdio'); // unchanged
        });

        it('should override toolExposition', () => {
            const config = mergeConfig({ server: { toolExposition: 'grouped' } });
            expect(config.server.toolExposition).toBe('grouped');
            expect(config.server.actionSeparator).toBe('_'); // unchanged
        });

        it('should override actionSeparator', () => {
            const config = mergeConfig({ server: { actionSeparator: '.' } });
            expect(config.server.actionSeparator).toBe('.');
            expect(config.server.toolExposition).toBe('flat'); // unchanged
        });

        it('should override both toolExposition and actionSeparator', () => {
            const config = mergeConfig({ server: { toolExposition: 'grouped', actionSeparator: '-' } });
            expect(config.server.toolExposition).toBe('grouped');
            expect(config.server.actionSeparator).toBe('-');
        });

        it('should set context import', () => {
            const config = mergeConfig({ context: { import: '../types.js#Ctx' } });
            expect(config.context.import).toBe('../types.js#Ctx');
        });

        it('should set tag filters', () => {
            const config = mergeConfig({ includeTags: ['pet', 'store'] });
            expect(config.includeTags).toEqual(['pet', 'store']);
        });

        it('should set input and output', () => {
            const config = mergeConfig({ input: './spec.yaml', output: './out' });
            expect(config.input).toBe('./spec.yaml');
            expect(config.output).toBe('./out');
        });

        it('should set deprecated handling', () => {
            const config = mergeConfig({ features: { deprecated: 'skip' } });
            expect(config.features.deprecated).toBe('skip');
        });

        it('should preserve defaults for unset fields when setting baseUrl', () => {
            const config = mergeConfig({ baseUrl: 'ctx.apiUrl' });
            expect(config.baseUrl).toBe('ctx.apiUrl');
            expect(config.features.tags).toBe(true);
            expect(config.server.name).toBe('openapi-mcp-server');
        });
    });
});
