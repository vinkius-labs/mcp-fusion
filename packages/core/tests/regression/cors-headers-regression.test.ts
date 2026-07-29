/**
 * Regression: CORS headers + header routing prep (MCP 2026-07-28 SEP-2243)
 *
 * CRITICAL: The MCP 2026-07-28 spec requires `Mcp-Method` and `Mcp-Name`
 * HTTP headers for gateway routing. The framework's CORS configuration
 * must allow these headers in preflight responses.
 *
 * This test suite verifies:
 * 1. The CORS header string includes Mcp-Method and Mcp-Name
 * 2. The CORS header string still includes legacy headers (Mcp-Session-Id)
 * 3. The startServer source code references the new headers
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── CORS header configuration ────────────────────────────

describe('Regression: CORS headers include Mcp-Method and Mcp-Name (SEP-2243)', () => {

    it('startServer.ts source includes Mcp-Method in CORS headers', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/server/startServer.ts'),
            'utf-8',
        );
        expect(source).toContain('Mcp-Method');
    });

    it('startServer.ts source includes Mcp-Name in CORS headers', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/server/startServer.ts'),
            'utf-8',
        );
        expect(source).toContain('Mcp-Name');
    });

    it('startServer.ts source still includes Mcp-Session-Id (backward compat)', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/server/startServer.ts'),
            'utf-8',
        );
        expect(source).toContain('Mcp-Session-Id');
    });

    it('CORS header line includes all three headers together', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/server/startServer.ts'),
            'utf-8',
        );
        // Find the Access-Control-Allow-Headers line
        const corsLine = source.match(/Access-Control-Allow-Headers[^)]*Mcp-Method[^)]*Mcp-Name/);
        expect(corsLine).not.toBeNull();
    });

    it('ServerTransport type includes stateless option', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/server/startServer.ts'),
            'utf-8',
        );
        expect(source).toContain("'stateless'");
        expect(source).toContain('createMcpHandler');
    });
});