/**
 * Adversarial Test Suite: HTTP Body Size Limit (startServer)
 *
 * Goal: Break the dual-layer body size guard (Content-Length pre-flight
 * + streaming byte counter) with every trick an attacker would use
 * to bypass payload limits and trigger OOM.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';

// ── Extract the body-reading logic to test in isolation ──

async function readBodyWithLimit(
    req: { headers: Record<string, string | undefined> } & AsyncIterable<Buffer>,
    maxBytes: number,
): Promise<{ status: number; body?: unknown; error?: string }> {
    const declaredLength = parseInt(req.headers['content-length'] ?? '', 10);
    if (declaredLength > maxBytes) {
        return { status: 413, error: 'pre-flight' };
    }

    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    for await (const chunk of req) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > maxBytes) {
            return { status: 413, error: 'streaming' };
        }
        chunks.push(chunk);
    }

    try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        return { status: 200, body };
    } catch {
        return { status: 400, error: 'invalid json' };
    }
}

// Helper to create a mock request
function mockReq(
    chunks: Buffer[],
    headers: Record<string, string | undefined> = {},
) {
    const stream = Readable.from(chunks);
    return Object.assign(stream, { headers });
}

// ── Content-Length header manipulation ────────────────────

describe('HTTP Body Limit — Content-Length attacks', () => {
    it('rejects Content-Length exactly 1 byte over limit', async () => {
        const limit = 1000;
        const req = mockReq([Buffer.from('{}')], {
            'content-length': String(limit + 1),
        });
        const r = await readBodyWithLimit(req, limit);
        expect(r.status).toBe(413);
        expect(r.error).toBe('pre-flight');
    });

    it('allows Content-Length exactly at limit', async () => {
        const limit = 2;
        const req = mockReq([Buffer.from('{}')], {
            'content-length': '2',
        });
        const r = await readBodyWithLimit(req, limit);
        expect(r.status).toBe(200);
    });

    it('handles Content-Length = 0', async () => {
        const req = mockReq([Buffer.from('')], {
            'content-length': '0',
        });
        const r = await readBodyWithLimit(req, 1000);
        // Empty body → JSON parse error
        expect(r.status).toBe(400);
    });

    it('handles negative Content-Length', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': '-1',
        });
        // parseInt('-1') = -1, which is < maxBytes → passes pre-flight
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
    });

    it('handles Content-Length = NaN (non-numeric)', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': 'not-a-number',
        });
        // parseInt returns NaN → NaN > maxBytes is false → passes pre-flight
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
    });

    it('handles Content-Length as float', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': '999.999',
        });
        // parseInt('999.999') = 999 → passes pre-flight
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
    });

    it('handles Content-Length with leading zeros', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': '0000000002',
        });
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
    });

    it('handles Content-Length with whitespace', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': ' 999 ',
        });
        // parseInt(' 999 ') = NaN → passes pre-flight
        // But actual body is 2 bytes → streaming allows it
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
    });

    it('handles very large Content-Length (Number.MAX_SAFE_INTEGER)', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': String(Number.MAX_SAFE_INTEGER),
        });
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(413);
        expect(r.error).toBe('pre-flight');
    });

    it('handles Content-Length = Infinity (string)', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': 'Infinity',
        });
        // parseInt('Infinity') = NaN → passes (NaN > N is false)
        // Streaming guard catches if body is over limit
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
    });

    it('MISSING Content-Length header → streaming guard is the only defense', async () => {
        const overLimit = Buffer.alloc(2000, 0x41);
        const req = mockReq([overLimit], {});
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(413);
        expect(r.error).toBe('streaming');
    });

    it('Content-Length LIES: declares small but sends big', async () => {
        const bigBody = Buffer.alloc(5000, 0x41);
        const req = mockReq([bigBody], {
            'content-length': '100', // lies
        });
        const r = await readBodyWithLimit(req, 1000);
        // Pre-flight passes (100 < 1000), but streaming catches it
        expect(r.status).toBe(413);
        expect(r.error).toBe('streaming');
    });

    it('Content-Length LIES: declares big but sends small', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': '999999', // lies high
        });
        const r = await readBodyWithLimit(req, 1000);
        // Pre-flight catches it
        expect(r.status).toBe(413);
        expect(r.error).toBe('pre-flight');
    });
});

// ── Streaming guard attacks ──────────────────────────────

describe('HTTP Body Limit — streaming guard attacks', () => {
    it('many tiny chunks that sum exceeds limit', async () => {
        // 200 chunks of 10 bytes = 2000 bytes > 1000 limit
        const chunks = Array.from({ length: 200 }, () => Buffer.alloc(10, 0x41));
        const req = mockReq(chunks, {});
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(413);
    });

    it('single-byte chunks exceeding limit', async () => {
        const chunks = Array.from({ length: 1001 }, () => Buffer.from('A'));
        const req = mockReq(chunks, {});
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(413);
    });

    it('one huge chunk exceeding limit', async () => {
        const chunk = Buffer.alloc(10_000_000, 0x41); // 10MB
        const req = mockReq([chunk], {});
        const r = await readBodyWithLimit(req, 4_194_304);
        expect(r.status).toBe(413);
    });

    it('exact limit bytes passes', async () => {
        const payload = JSON.stringify({ x: 'A'.repeat(100) });
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {
            'content-length': String(buf.byteLength),
        });
        const r = await readBodyWithLimit(req, buf.byteLength);
        expect(r.status).toBe(200);
    });

    it('exact limit + 1 byte fails', async () => {
        const payload = Buffer.alloc(1001, 0x41);
        const req = mockReq([payload], {});
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(413);
    });

    it('stops consuming after limit is exceeded (does not OOM)', async () => {
        let chunksConsumed = 0;
        async function* gen() {
            for (let i = 0; i < 1000; i++) {
                chunksConsumed++;
                yield Buffer.alloc(1024, 0x41); // 1KB each → 1MB total
            }
        }
        const req = {
            headers: {} as Record<string, string | undefined>,
            [Symbol.asyncIterator]: gen,
        };

        const r = await readBodyWithLimit(req, 5000);
        expect(r.status).toBe(413);
        // Should have stopped well before consuming all 1000 chunks
        expect(chunksConsumed).toBeLessThan(10);
    });
});

// ── Boundary conditions ──────────────────────────────────

describe('HTTP Body Limit — boundary conditions', () => {
    it('maxBytes = 0 rejects everything', async () => {
        const req = mockReq([Buffer.from('{}')], {});
        const r = await readBodyWithLimit(req, 0);
        expect(r.status).toBe(413);
    });

    it('maxBytes = 1 rejects 2-byte body', async () => {
        const req = mockReq([Buffer.from('{}')], {});
        const r = await readBodyWithLimit(req, 1);
        expect(r.status).toBe(413);
    });

    it('maxBytes = 2 allows 2-byte body', async () => {
        const req = mockReq([Buffer.from('{}')], {
            'content-length': '2',
        });
        const r = await readBodyWithLimit(req, 2);
        expect(r.status).toBe(200);
    });

    it('empty body (no chunks) with high limit', async () => {
        const req = mockReq([], {});
        const r = await readBodyWithLimit(req, 4_194_304);
        // Empty body → JSON parse error
        expect(r.status).toBe(400);
    });

    it('body with only whitespace', async () => {
        const req = mockReq([Buffer.from('   ')], {
            'content-length': '3',
        });
        const r = await readBodyWithLimit(req, 1000);
        // Whitespace → JSON parse error
        expect(r.status).toBe(400);
    });
});

// ── Multi-byte character attacks ─────────────────────────

describe('HTTP Body Limit — multi-byte character attacks', () => {
    it('UTF-8 multi-byte chars: byteLength > string length', async () => {
        // '🔥' is 4 bytes in UTF-8
        const payload = JSON.stringify({ emoji: '🔥'.repeat(250) }); // ~1000+ bytes
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {
            'content-length': String(buf.byteLength),
        });
        // Limit is on byte length, not string length
        const r = await readBodyWithLimit(req, buf.byteLength);
        expect(r.status).toBe(200);
    });

    it('4-byte emoji just over limit (byte counting)', async () => {
        const payload = JSON.stringify({ e: '🔥' }); // {"e":"🔥"} = 12 bytes
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {});
        // Set limit to just under the byte length
        const r = await readBodyWithLimit(req, buf.byteLength - 1);
        expect(r.status).toBe(413);
    });

    it('CJK characters: 3 bytes each in UTF-8', async () => {
        const payload = JSON.stringify({ text: '你好世界'.repeat(100) });
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {});
        const r = await readBodyWithLimit(req, buf.byteLength);
        expect(r.status).toBe(200);
    });
});

// ── Realistic MCP payloads ───────────────────────────────

describe('HTTP Body Limit — realistic MCP payloads', () => {
    it('normal tools/list request passes', async () => {
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 1,
        });
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {
            'content-length': String(buf.byteLength),
        });
        const r = await readBodyWithLimit(req, 4_194_304);
        expect(r.status).toBe(200);
    });

    it('normal tools/call with medium args passes', async () => {
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: 2,
            params: {
                name: 'search',
                arguments: { query: 'SELECT * FROM users', limit: 10 },
            },
        });
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {
            'content-length': String(buf.byteLength),
        });
        const r = await readBodyWithLimit(req, 4_194_304);
        expect(r.status).toBe(200);
    });

    it('abusively large args in tools/call is rejected', async () => {
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: 3,
            params: {
                name: 'upload',
                arguments: { data: 'X'.repeat(5_000_000) }, // 5MB
            },
        });
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {
            'content-length': String(buf.byteLength),
        });
        const r = await readBodyWithLimit(req, 4_194_304);
        expect(r.status).toBe(413);
    });

    it('nested JSON-RPC batch (multiple calls)', async () => {
        const calls = Array.from({ length: 100 }, (_, i) => ({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: i,
            params: { name: 'ping', arguments: {} },
        }));
        const payload = JSON.stringify(calls);
        const buf = Buffer.from(payload);
        const req = mockReq([buf], {
            'content-length': String(buf.byteLength),
        });
        const r = await readBodyWithLimit(req, 4_194_304);
        expect(r.status).toBe(200);
    });
});

// ── Slowloris / trickle attacks ──────────────────────────

describe('HTTP Body Limit — trickle & chunked attacks', () => {
    it('trickle: 1 byte at a time exceeding limit', async () => {
        // Send 1001 single-byte chunks
        const chunks = Array.from({ length: 1001 }, () => Buffer.from('A'));
        const req = mockReq(chunks, {});
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(413);
    });

    it('split valid JSON across chunks', async () => {
        const payload = '{"valid": true}';
        const chunks = payload.split('').map((c) => Buffer.from(c));
        const req = mockReq(chunks, {});
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ valid: true });
    });

    it('alternating empty and non-empty chunks', async () => {
        const chunks = [
            Buffer.from(''),
            Buffer.from('{'),
            Buffer.from(''),
            Buffer.from('"a"'),
            Buffer.from(''),
            Buffer.from(':1'),
            Buffer.from(''),
            Buffer.from('}'),
            Buffer.from(''),
        ];
        const req = mockReq(chunks, {});
        const r = await readBodyWithLimit(req, 1000);
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ a: 1 });
    });
});
