import { describe, it, expect } from 'vitest';
import { CursorCodec } from '../../src/prompt/CursorCodec';

describe('CursorCodec', () => {
    describe('HMAC Signed Mode (Default)', () => {
        it('should encode and decode correctly', async () => {
            const codec = new CursorCodec();
            const payload = { after: 'prompt_xy_123' };
            
            const cursor = await codec.encode(payload);
            expect(cursor).toBeDefined();
            expect(typeof cursor).toBe('string');
            expect(cursor).toContain('.'); // data.hmac format
            
            const decoded = await codec.decode(cursor);
            expect(decoded).toEqual(payload);
        });

        it('should fail on tampering', async () => {
            const codec = new CursorCodec();
            const cursor = await codec.encode({ after: 'safe_data' });
            
            const [data, sig] = cursor.split('.');
            // Malicious user tried to change "safe" to something else
            const maliciousData = btoa(JSON.stringify({ after: 'evil_data' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            
            const tamperedCursor = `${maliciousData}.${sig}`;
            expect(await codec.decode(tamperedCursor)).toBeUndefined();
        });

        it('should fail on signature truncation', async () => {
            const codec = new CursorCodec();
            const cursor = await codec.encode({ after: 'test' });
            expect(await codec.decode(cursor.slice(0, -1))).toBeUndefined();
        });

        it('should fail if opened by another codec with a different key', async () => {
            const codec1 = new CursorCodec();
            const codec2 = new CursorCodec(); // Ephemeral random key

            const cursor = await codec1.encode({ after: 'test' });
            expect(await codec2.decode(cursor)).toBeUndefined();
        });
    });

    describe('AES-256-GCM Encrypted Mode', () => {
        it('should encode and decode correctly', async () => {
            const codec = new CursorCodec({ mode: 'encrypted' });
            const payload = { after: 'prompt_secret_abc' };
            
            const cursor = await codec.encode(payload);
            expect(cursor).toBeDefined();
            
            const parts = cursor.split('.');
            expect(parts).toHaveLength(2); // iv.encryptedAndAuthTag
            
            // Just double checking it doesn't contain plaintext
            expect(cursor).not.toContain('prompt_secret_abc');
            
            const decoded = await codec.decode(cursor);
            expect(decoded).toEqual(payload);
        });

        it('should fail on tampering with payload', async () => {
            const codec = new CursorCodec({ mode: 'encrypted' });
            const cursor = await codec.encode({ after: 'data' });
            
            const parts = cursor.split('.');
            // Decode the encrypted payload to raw bytes, flip a byte in the middle, re-encode
            const raw = parts[1]!;
            const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
            const binary = atob(padded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            // Flip a byte near the middle of the ciphertext (not in padding territory)
            bytes[Math.floor(bytes.length / 2)] ^= 0xFF;
            let flipped = '';
            for (let i = 0; i < bytes.length; i++) flipped += String.fromCharCode(bytes[i]!);
            parts[1] = btoa(flipped).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            
            expect(await codec.decode(parts.join('.'))).toBeUndefined();
        });
    });

    it('should throw if explicitly given secret is not 32 bytes', () => {
        expect(() => {
            new CursorCodec({ secret: 'too-short' });
        }).toThrowError('32 bytes');
    });

    it('should allow explicitly passing the same secret and cross-decrypt', async () => {
        const secret = '12345678901234567890123456789012'; // 32 bytes
        const codec1 = new CursorCodec({ secret, mode: 'signed' });
        const codec2 = new CursorCodec({ secret, mode: 'signed' });
        
        const cursor = await codec1.encode({ after: 'persist_me' });
        expect(await codec2.decode(cursor)).toEqual({ after: 'persist_me' });
    });
});
