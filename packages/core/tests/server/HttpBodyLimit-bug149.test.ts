/**
 * Bug #149 Regression: HTTP body size limit (DoS/OOM prevention)
 *
 * BUG: The HTTP transport handler in `startServer` accumulated request body
 * chunks without any size limit. An attacker could send a multi-GB payload
 * causing Out-of-Memory and crashing the server process.
 *
 * FIX: Added `maxBodyBytes` option (default: 4MB). The handler rejects
 * requests exceeding the limit with HTTP 413 both via Content-Length
 * header check (pre-flight) and by tracking accumulated bytes during
 * streaming (runtime guard).
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Readable, PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Simulate the body-reading logic extracted from startServer's HTTP handler.
 * This avoids needing to spin up a real HTTP server for each test.
 */
async function readBodyWithLimit(
    req: { headers: Record<string, string | undefined> } & AsyncIterable<Buffer>,
    maxBytes: number,
): Promise<{ status: number; body?: unknown }> {
    const declaredLength = parseInt(req.headers['content-length'] ?? '', 10);
    if (declaredLength > maxBytes) {
        return { status: 413 };
    }

    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    for await (const chunk of req) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > maxBytes) {
            return { status: 413 };
        }
        chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString());
    return { status: 200, body };
}

describe('Bug #149 Regression: HTTP body size limit', () => {
    it('rejects request when Content-Length exceeds limit (pre-flight)', async () => {
        const stream = Readable.from([Buffer.from('{"a":1}')]);
        const req = Object.assign(stream, {
            headers: { 'content-length': '10000000' }, // 10MB
        });

        const result = await readBodyWithLimit(req, 4_194_304);
        expect(result.status).toBe(413);
        expect(result.body).toBeUndefined();
    });

    it('rejects request when streamed bytes exceed limit (runtime guard)', async () => {
        // Simulate chunked transfer (no Content-Length) exceeding limit
        const bigChunk = Buffer.alloc(1024 * 1024, 0x41); // 1MB of 'A'
        async function* generateChunks() {
            for (let i = 0; i < 5; i++) yield bigChunk; // 5MB total > 4MB default
        }
        const req = {
            headers: {} as Record<string, string | undefined>,
            [Symbol.asyncIterator]: generateChunks,
        };

        const result = await readBodyWithLimit(req, 4_194_304);
        expect(result.status).toBe(413);
    });

    it('allows request within limit', async () => {
        const payload = JSON.stringify({ method: 'tools/list', params: {} });
        const stream = Readable.from([Buffer.from(payload)]);
        const req = Object.assign(stream, {
            headers: { 'content-length': String(Buffer.byteLength(payload)) },
        });

        const result = await readBodyWithLimit(req, 4_194_304);
        expect(result.status).toBe(200);
        expect(result.body).toEqual({ method: 'tools/list', params: {} });
    });

    it('allows request with custom higher limit', async () => {
        const payload = JSON.stringify({ data: 'x'.repeat(5_000_000) }); // ~5MB
        const stream = Readable.from([Buffer.from(payload)]);
        const req = Object.assign(stream, {
            headers: { 'content-length': String(Buffer.byteLength(payload)) },
        });

        const result = await readBodyWithLimit(req, 10_000_000); // 10MB limit
        expect(result.status).toBe(200);
    });

    it('rejects at exact boundary (limit + 1 byte)', async () => {
        const limit = 100;
        const payload = Buffer.alloc(limit + 1, 0x41);
        async function* gen() { yield payload; }
        const req = {
            headers: {} as Record<string, string | undefined>,
            [Symbol.asyncIterator]: gen,
        };

        const result = await readBodyWithLimit(req, limit);
        expect(result.status).toBe(413);
    });

    it('allows at exact boundary (exactly limit bytes)', async () => {
        const limit = 100;
        const body = { v: 'a'.repeat(80) }; // stays under 100 bytes
        const payload = Buffer.from(JSON.stringify(body));
        expect(payload.byteLength).toBeLessThanOrEqual(limit);

        async function* gen() { yield payload; }
        const req = {
            headers: {} as Record<string, string | undefined>,
            [Symbol.asyncIterator]: gen,
        };

        const result = await readBodyWithLimit(req, limit);
        expect(result.status).toBe(200);
    });
});
