export interface CursorPayload {
    after: string; // The name of the last item in the previous page
}

export type CursorMode = 'signed' | 'encrypted';

export interface CursorCodecOptions {
    /** 
     * 'signed' (default): HMAC signature appended to base64 payload. Payload is visible but tamper-proof.
     * 'encrypted': AES-GCM encryption. Payload is completely hidden and tamper-proof.
     */
    mode?: CursorMode;
    /**
     * Optional 32-byte secret key. 
     * If not provided, a random ephemeral key is generated per process.
     */
    secret?: string; 
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function base64UrlDecode(base64: string): Uint8Array {
    const s = base64.replace(/-/g, '+').replace(/_/g, '/');
    const b = atob(s);
    const bytes = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) {
        bytes[i] = b.charCodeAt(i);
    }
    return bytes;
}

/**
 * Stateless Cryptographic Cursor for pagination using Web Crypto API.
 * 
 * Works in Node >= 18, Deno, Bun, and Cloudflare Workers.
 */
export class CursorCodec {
    private readonly _mode: CursorMode;
    private readonly _secretBytes: Uint8Array;
    private _hmacKey?: CryptoKey;
    private _aesKey?: CryptoKey;

    constructor(options?: CursorCodecOptions) {
        this._mode = options?.mode ?? 'signed';
        
        if (options?.secret) {
            const encoder = new TextEncoder();
            const buf = encoder.encode(options.secret);
            if (buf.length !== 32) {
                throw new Error('CursorCodec secret must be exactly 32 bytes (256 bits)');
            }
            this._secretBytes = buf;
        } else {
            this._secretBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
        }
    }

    private async getHmacKey(): Promise<CryptoKey> {
        if (!this._hmacKey) {
            this._hmacKey = await globalThis.crypto.subtle.importKey(
                'raw',
                this._secretBytes as any,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign', 'verify']
            );
        }
        return this._hmacKey;
    }

    private async getAesKey(): Promise<CryptoKey> {
        if (!this._aesKey) {
            this._aesKey = await globalThis.crypto.subtle.importKey(
                'raw',
                this._secretBytes as any,
                'AES-GCM',
                false,
                ['encrypt', 'decrypt']
            );
        }
        return this._aesKey;
    }

    /**
     * Asynchronously encodes a payload into a URL-safe cursor string.
     */
    async encode(payload: CursorPayload): Promise<string> {
        const data = JSON.stringify(payload);
        const dataBuffer = new TextEncoder().encode(data);
        
        if (this._mode === 'encrypted') {
            const aesKey = await this.getAesKey();
            const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
            
            const encryptedBuf = await globalThis.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv as any },
                aesKey,
                dataBuffer as any
            );
            
            // Web Crypto AES-GCM appends the 16-byte auth tag at the end of the ciphertext
            return `${base64UrlEncode(iv)}.${base64UrlEncode(encryptedBuf)}`;
        } else {
            // Signed HMAC
            const hmacKey = await this.getHmacKey();
            const signatureBuf = await globalThis.crypto.subtle.sign(
                'HMAC',
                hmacKey,
                dataBuffer as any
            );
            
            return `${base64UrlEncode(dataBuffer)}.${base64UrlEncode(signatureBuf)}`;
        }
    }

    /**
     * Asynchronously decodes and verifies a cursor string back into its payload.
     * Returns undefined if the cursor is invalid, tampered with, or from a different process/key.
     */
    async decode(cursor: string): Promise<CursorPayload | undefined> {
        try {
            if (this._mode === 'encrypted') {
                const parts = cursor.split('.');
                if (parts.length !== 2) return undefined;
                
                const [ivStr, encryptedStr] = parts;
                if (!ivStr || !encryptedStr) return undefined;

                const iv = base64UrlDecode(ivStr);
                const encrypted = base64UrlDecode(encryptedStr);
                
                const aesKey = await this.getAesKey();
                const decryptedBuf = await globalThis.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv as any },
                    aesKey,
                    encrypted as any
                );
                
                const decrypted = new TextDecoder().decode(decryptedBuf);
                return JSON.parse(decrypted) as CursorPayload;
            } else {
                // Signed HMAC
                const parts = cursor.split('.');
                if (parts.length !== 2) return undefined;
                
                const [dataB64, signatureB64] = parts;
                if (!dataB64 || !signatureB64) return undefined;
                
                const dataBuffer = base64UrlDecode(dataB64);
                const signatureBuf = base64UrlDecode(signatureB64);
                
                const hmacKey = await this.getHmacKey();
                
                const isValid = await globalThis.crypto.subtle.verify(
                    'HMAC',
                    hmacKey,
                    signatureBuf as any,
                    dataBuffer as any
                );
                
                if (!isValid) return undefined;
                
                const decrypted = new TextDecoder().decode(dataBuffer);
                return JSON.parse(decrypted) as CursorPayload;
            }
        } catch {
            // Catches Crypto errors (tampering), JSON parsing errors, Base64 errors
            return undefined;
        }
    }
}
