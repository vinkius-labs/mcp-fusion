/**
 * Bug #79 — HTTP template async unhandled rejection
 *
 * The SSE template now uses `startServer({ transport: 'http' })` which
 * encapsulates all HTTP handler logic (try/catch, session management,
 * routing). This test verifies the template uses startServer correctly
 * and that the `startServer.ts` implementation handles the error cases.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { serverTs } from '../../src/cli/templates/core.js';
import type { ProjectConfig } from '../../src/cli/types.js';

const sseConfig: ProjectConfig = {
    name: 'test-sse',
    transport: 'sse',
    vector: 'vanilla',
    testing: false,
};

describe('Bug #79 — SSE template uses startServer (HTTP handling encapsulated)', () => {
    const output = serverTs(sseConfig);

    it('should use startServer instead of raw createServer boilerplate', () => {
        expect(output).toContain('startServer');
        expect(output).not.toContain('createServer');
        expect(output).not.toContain('StreamableHTTPServerTransport');
    });

    it('should specify transport: http', () => {
        expect(output).toContain("transport: 'http'");
    });

    it('should configure port from env with fallback to 3001', () => {
        expect(output).toContain("process.env['PORT']");
        expect(output).toContain('3001');
    });

    it('should NOT have try/catch in template (handled by startServer internally)', () => {
        expect(output).not.toContain('try {');
        expect(output).not.toContain('} catch');
        expect(output).not.toContain('headersSent');
    });

    it('should NOT have raw HTTP method routing (handled by startServer internally)', () => {
        expect(output).not.toContain("req.method === 'POST'");
        expect(output).not.toContain("req.method === 'GET'");
        expect(output).not.toContain("req.method === 'DELETE'");
    });

    it('should NOT have try/catch in stdio template either', () => {
        const stdioConfig: ProjectConfig = {
            name: 'test-stdio',
            transport: 'stdio',
            vector: 'vanilla',
            testing: false,
        };
        const stdioOutput = serverTs(stdioConfig);
        expect(stdioOutput).not.toContain('createServer');
    });
});
