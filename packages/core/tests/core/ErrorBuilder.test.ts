import { describe, it, expect } from 'vitest';
import { ErrorBuilder } from '../../src/core/builder/ErrorBuilder.js';
import { initFusion } from '../../src/core/initFusion.js';

describe('ErrorBuilder', () => {
    it('should construct a basic error response', () => {
        const error = new ErrorBuilder('NOT_FOUND', 'Project missing').build();
        
        expect(error.isError).toBe(true);
        expect(error.content[0].text).toContain('<tool_error code="NOT_FOUND" severity="error">');
        expect(error.content[0].text).toContain('<message>Project missing</message>');
    });

    it('should support fluent suggestions and actions', () => {
        const error = new ErrorBuilder('VALIDATION_ERROR', 'Invalid ID')
            .suggest('Use a UUID v4')
            .actions('projects.list', 'projects.create')
            .build();

        const xml = error.content[0].text;
        expect(xml).toContain('<recovery>Use a UUID v4</recovery>');
        expect(xml).toContain('<available_actions>');
        expect(xml).toContain('<action>projects.list</action>');
        expect(xml).toContain('<action>projects.create</action>');
    });

    it('should support different severities', () => {
        const critical = new ErrorBuilder('INTERNAL_ERROR', 'Panic').critical().build();
        expect(critical.isError).toBe(true);
        expect(critical.content[0].text).toContain('severity="critical"');

        const warning = new ErrorBuilder('DEPRECATED', 'Use v2').warning().build();
        expect(warning.isError).toBe(false); // Warnings are non-fatal
        expect(warning.content[0].text).toContain('severity="warning"');
    });

    it('should support structured details and retryAfter', () => {
        const error = new ErrorBuilder('RATE_LIMITED', 'Too many requests')
            .details({ limit: 100, current: 101 })
            .retryAfter(30)
            .build();

        const xml = error.content[0].text;
        expect(xml).toContain('<detail key="limit">100</detail>');
        expect(xml).toContain('<detail key="current">101</detail>');
        expect(xml).toContain('<retry_after>30 seconds</retry_after>');
    });

    it('should work as a direct return value (getters)', () => {
        const builder = new ErrorBuilder('CONFLICT', 'Already exists');
        
        // Simulating the framework reading the response
        expect(builder.isError).toBe(true);
        expect(builder.content).toBeDefined();
        expect(builder.content[0].text).toContain('code="CONFLICT"');
    });
});

describe('initFusion — f.error()', () => {
    it('should expose f.error() which returns an ErrorBuilder', () => {
        const f = initFusion();
        const builder = f.error('UNAUTHORIZED', 'Login required');
        
        expect(builder).toBeInstanceOf(ErrorBuilder);
        const res = builder.build();
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('code="UNAUTHORIZED"');
    });
});
