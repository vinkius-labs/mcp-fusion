import { describe, it, expect } from 'vitest';
import { toolError, error, type ErrorCode } from '../../src/core/response.js';

// ============================================================================
// toolError() — Enhanced Self-Healing XML
// ============================================================================

describe('toolError() — Enhanced features', () => {
    it('should include severity attribute (default: error)', () => {
        const result = toolError('NOT_FOUND', { message: 'Not found' });
        expect(result.content[0].text).toContain('severity="error"');
        expect(result.isError).toBe(true);
    });

    it('should render warning severity as non-error', () => {
        const result = toolError('DEPRECATED', {
            message: 'This tool is deprecated.',
            severity: 'warning',
        });
        expect(result.content[0].text).toContain('severity="warning"');
        expect(result.isError).toBe(false); // warnings are non-fatal
    });

    it('should render critical severity', () => {
        const result = toolError('INTERNAL_ERROR', {
            message: 'Database connection lost.',
            severity: 'critical',
        });
        expect(result.content[0].text).toContain('severity="critical"');
        expect(result.isError).toBe(true);
    });

    it('should render details as <detail key="..."> elements', () => {
        const result = toolError('NOT_FOUND', {
            message: 'Invoice not found.',
            details: {
                entity_id: 'inv_123',
                entity_type: 'invoice',
            },
        });
        const text = result.content[0].text;
        expect(text).toContain('<details>');
        expect(text).toContain('<detail key="entity_id">inv_123</detail>');
        expect(text).toContain('<detail key="entity_type">invoice</detail>');
        expect(text).toContain('</details>');
    });

    it('should safely handle XML-unsafe detail keys', () => {
        const result = toolError('VALIDATION_ERROR', {
            message: 'Bad input.',
            details: { '123': 'numeric key', 'a b': 'spaced key', 'x<y': 'special' },
        });
        const text = result.content[0].text;
        // Keys are now attributes, not element names — always safe
        expect(text).toContain('<detail key="123">numeric key</detail>');
        expect(text).toContain('<detail key="a b">spaced key</detail>');
        expect(text).toContain('key="x&lt;y"');
    });

    it('should omit details block when details is empty', () => {
        const result = toolError('NOT_FOUND', {
            message: 'Not found.',
            details: {},
        });
        expect(result.content[0].text).not.toContain('<details>');
    });

    it('should handle retryAfter of 0 seconds', () => {
        const result = toolError('RATE_LIMITED', {
            message: 'Retry immediately.',
            retryAfter: 0,
        });
        expect(result.content[0].text).toContain('<retry_after>0 seconds</retry_after>');
    });

    it('should handle empty availableActions array', () => {
        const result = toolError('NOT_FOUND', {
            message: 'Not found.',
            availableActions: [],
        });
        expect(result.content[0].text).not.toContain('<available_actions>');
    });

    it('should render retry_after for transient errors', () => {
        const result = toolError('RATE_LIMITED', {
            message: 'Too many requests.',
            retryAfter: 30,
        });
        expect(result.content[0].text).toContain('<retry_after>30 seconds</retry_after>');
    });

    it('should render available actions as individual <action> elements', () => {
        const result = toolError('NOT_FOUND', {
            message: 'Not found.',
            availableActions: ['projects.list', 'projects.search'],
        });
        const text = result.content[0].text;
        expect(text).toContain('<available_actions>');
        expect(text).toContain('<action>projects.list</action>');
        expect(text).toContain('<action>projects.search</action>');
        expect(text).toContain('</available_actions>');
    });

    it('should produce full HATEOAS XML envelope with all fields', () => {
        const result = toolError('CONFLICT', {
            message: 'Invoice already paid.',
            suggestion: 'Check the invoice status first.',
            availableActions: ['billing.get', 'billing.list'],
            severity: 'error',
            details: { invoice_id: 'inv_456', status: 'paid' },
            retryAfter: 5,
        });

        const text = result.content[0].text;
        expect(text).toContain('code="CONFLICT"');
        expect(text).toContain('severity="error"');
        expect(text).toContain('<message>Invoice already paid.</message>');
        expect(text).toContain('<recovery>Check the invoice status first.</recovery>');
        expect(text).toContain('<action>billing.get</action>');
        expect(text).toContain('<action>billing.list</action>');
        expect(text).toContain('<detail key="invoice_id">inv_456</detail>');
        expect(text).toContain('<retry_after>5 seconds</retry_after>');
        expect(result.isError).toBe(true);
    });

    it('should escape XML characters in details values', () => {
        const result = toolError('VALIDATION_ERROR', {
            message: 'Bad input.',
            details: { value: '<script>alert("xss")</script>' },
        });
        // escapeXml escapes & and < (> is preserved for LLM readability)
        expect(result.content[0].text).toContain('<detail key="value">&lt;script>alert("xss")&lt;/script></detail>');
    });

    it('should accept custom error codes with string literal type', () => {
        // This test validates the TypeScript union type allows custom codes
        const code: ErrorCode = 'MyCustomCode';
        const result = toolError(code, { message: 'Custom error' });
        expect(result.content[0].text).toContain('code="MyCustomCode"');
    });
});

// ============================================================================
// error() — Enhanced with optional code
// ============================================================================

describe('error() — Enhanced with optional code', () => {
    it('should produce minimal XML without code when omitted', () => {
        const result = error('Something went wrong');
        expect(result.content[0].text).toBe(
            '<tool_error>\n<message>Something went wrong</message>\n</tool_error>',
        );
        expect(result.isError).toBe(true);
    });

    it('should include code attribute when provided', () => {
        const result = error('User not found', 'NOT_FOUND');
        expect(result.content[0].text).toContain('code="NOT_FOUND"');
        expect(result.content[0].text).toContain('<message>User not found</message>');
        expect(result.isError).toBe(true);
    });
});
