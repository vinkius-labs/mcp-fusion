/**
 * DeviceAuthenticator Tests
 *
 * Validates RFC 8628 Device Authorization Grant implementation:
 * - Phase 1: requestDeviceCode
 * - Phase 2: pollForToken (with slow_down, expiration, abort)
 * - Single attempt: attemptTokenExchange
 *
 * Uses injected mock fetch for deterministic testing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeviceAuthenticator } from '../src/DeviceAuthenticator.js';
import type {
    DeviceCodeResponse,
    TokenResponse,
    DeviceFlowError,
} from '../src/DeviceAuthenticator.js';

// ── Mock Fetch Helper ────────────────────────────────────

function mockFetch(responses: Array<{ status: number; body: unknown }>): typeof globalThis.fetch {
    const queue = [...responses];
    return vi.fn(async () => {
        const next = queue.shift();
        if (!next) throw new Error('Mock fetch: no more responses');
        return {
            ok: next.status >= 200 && next.status < 300,
            status: next.status,
            statusText: next.status === 200 ? 'OK' : 'Error',
            json: async () => next.body,
        } as Response;
    });
}

function createAuthenticator(fetch: typeof globalThis.fetch): DeviceAuthenticator {
    return new DeviceAuthenticator({
        authorizationEndpoint: 'https://auth.example.com/device/code',
        tokenEndpoint: 'https://auth.example.com/device/token',
        fetch,
    });
}

// ── Fixtures ─────────────────────────────────────────────

const DEVICE_CODE_RESPONSE: DeviceCodeResponse = {
    device_code: 'dev-code-abc',
    user_code: 'ABCD-1234',
    verification_uri: 'https://example.com/activate',
    verification_uri_complete: 'https://example.com/activate?user_code=ABCD-1234',
    expires_in: 900,
    interval: 5,
};

const TOKEN_RESPONSE: TokenResponse = {
    access_token: 'eyJ-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'read write',
};

// ============================================================================
// requestDeviceCode
// ============================================================================

describe('DeviceAuthenticator', () => {
    describe('requestDeviceCode', () => {
        it('returns device code response on success', async () => {
            const fetch = mockFetch([{ status: 200, body: DEVICE_CODE_RESPONSE }]);
            const auth = createAuthenticator(fetch);

            const result = await auth.requestDeviceCode({ clientId: 'my-client' });

            expect(result).toEqual(DEVICE_CODE_RESPONSE);
            expect(fetch).toHaveBeenCalledOnce();
        });

        it('sends correct request body', async () => {
            const fetch = mockFetch([{ status: 200, body: DEVICE_CODE_RESPONSE }]);
            const auth = createAuthenticator(fetch);

            await auth.requestDeviceCode({ clientId: 'client-123', scope: 'read write' });

            const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(call[1].body as string);
            expect(body).toEqual({ client_id: 'client-123', scope: 'read write' });
        });

        it('omits scope when not provided', async () => {
            const fetch = mockFetch([{ status: 200, body: DEVICE_CODE_RESPONSE }]);
            const auth = createAuthenticator(fetch);

            await auth.requestDeviceCode({ clientId: 'client-123' });

            const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(call[1].body as string);
            expect(body).toEqual({ client_id: 'client-123' });
            expect(body).not.toHaveProperty('scope');
        });

        it('sends custom headers', async () => {
            const fetch = mockFetch([{ status: 200, body: DEVICE_CODE_RESPONSE }]);
            const auth = new DeviceAuthenticator({
                authorizationEndpoint: 'https://auth.example.com/device/code',
                tokenEndpoint: 'https://auth.example.com/device/token',
                headers: { 'X-Custom': 'value' },
                fetch,
            });

            await auth.requestDeviceCode({ clientId: 'c' });

            const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call[1].headers).toHaveProperty('X-Custom', 'value');
        });

        it('throws on server error with error_description', async () => {
            const fetch = mockFetch([{
                status: 400,
                body: { error: 'invalid_client', error_description: 'Unknown client_id' },
            }]);
            const auth = createAuthenticator(fetch);

            await expect(auth.requestDeviceCode({ clientId: 'bad' }))
                .rejects.toThrow('Unknown client_id');
        });

        it('throws with status info when no error_description', async () => {
            const fetch = mockFetch([{ status: 500, body: {} }]);
            const auth = createAuthenticator(fetch);

            await expect(auth.requestDeviceCode({ clientId: 'c' }))
                .rejects.toThrow(/500/);
        });
    });

    // ========================================================================
    // attemptTokenExchange
    // ========================================================================

    describe('attemptTokenExchange', () => {
        it('returns token response on success', async () => {
            const fetch = mockFetch([{ status: 200, body: TOKEN_RESPONSE }]);
            const auth = createAuthenticator(fetch);

            const result = await auth.attemptTokenExchange({ deviceCode: 'dc-1' });

            expect(result).toEqual(TOKEN_RESPONSE);
            expect((result as TokenResponse).access_token).toBe('eyJ-access-token');
        });

        it('sends correct grant_type', async () => {
            const fetch = mockFetch([{ status: 200, body: TOKEN_RESPONSE }]);
            const auth = createAuthenticator(fetch);

            await auth.attemptTokenExchange({ deviceCode: 'dc-1' });

            const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(call[1].body as string);
            expect(body.grant_type).toBe('urn:ietf:params:oauth:grant-type:device_code');
            expect(body.device_code).toBe('dc-1');
        });

        it('accepts custom grant_type', async () => {
            const fetch = mockFetch([{ status: 200, body: TOKEN_RESPONSE }]);
            const auth = createAuthenticator(fetch);

            await auth.attemptTokenExchange({
                deviceCode: 'dc-1',
                grantType: 'custom_grant',
            });

            const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(call[1].body as string);
            expect(body.grant_type).toBe('custom_grant');
        });

        it('returns authorization_pending as non-throwing response', async () => {
            const fetch = mockFetch([{
                status: 400,
                body: { error: 'authorization_pending', error_description: 'User not yet authorized' },
            }]);
            const auth = createAuthenticator(fetch);

            const result = await auth.attemptTokenExchange({ deviceCode: 'dc-1' });
            expect((result as DeviceFlowError).error).toBe('authorization_pending');
        });

        it('returns slow_down as non-throwing response', async () => {
            const fetch = mockFetch([{
                status: 400,
                body: { error: 'slow_down' },
            }]);
            const auth = createAuthenticator(fetch);

            const result = await auth.attemptTokenExchange({ deviceCode: 'dc-1' });
            expect((result as DeviceFlowError).error).toBe('slow_down');
        });

        it('returns terminal errors as non-throwing response', async () => {
            const fetch = mockFetch([{
                status: 400,
                body: { error: 'access_denied', error_description: 'User denied' },
            }]);
            const auth = createAuthenticator(fetch);

            const result = await auth.attemptTokenExchange({ deviceCode: 'dc-1' });
            expect((result as DeviceFlowError).error).toBe('access_denied');
        });

        it('handles non-JSON error response gracefully', async () => {
            const fetch = vi.fn(async () => ({
                ok: false,
                status: 502,
                statusText: 'Bad Gateway',
                json: async () => { throw new Error('not json'); },
            })) as unknown as typeof globalThis.fetch;
            const auth = createAuthenticator(fetch);

            const result = await auth.attemptTokenExchange({ deviceCode: 'dc-1' });
            expect((result as DeviceFlowError).error).toBe('unknown_error');
        });
    });

    // ========================================================================
    // pollForToken
    // ========================================================================

    describe('pollForToken', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it('returns token after authorization_pending then success', async () => {
            const fetch = mockFetch([
                { status: 400, body: { error: 'authorization_pending' } },
                { status: 200, body: TOKEN_RESPONSE },
            ]);
            const auth = createAuthenticator(fetch);

            const codeResponse: DeviceCodeResponse = {
                ...DEVICE_CODE_RESPONSE,
                interval: 1, // (1 || 5) * 1000 = 1000ms
                expires_in: 60,
            };

            const promise = auth.pollForToken(codeResponse);
            // Advance past first sleep (1000ms) + microtask flush
            await vi.advanceTimersByTimeAsync(1100);
            // Advance past second sleep (1000ms)
            await vi.advanceTimersByTimeAsync(1100);

            const result = await promise;
            expect(result.access_token).toBe('eyJ-access-token');
            expect(fetch).toHaveBeenCalledTimes(2);
        });

        it('increases interval on slow_down (RFC 8628 §3.5)', async () => {
            const fetchFn = vi.fn()
                .mockResolvedValueOnce({
                    ok: false, status: 400, json: async () => ({ error: 'slow_down' }),
                })
                .mockResolvedValueOnce({
                    ok: true, status: 200, json: async () => TOKEN_RESPONSE,
                }) as unknown as typeof globalThis.fetch;

            const auth = createAuthenticator(fetchFn);

            const codeResponse: DeviceCodeResponse = {
                ...DEVICE_CODE_RESPONSE,
                interval: 1, // starts at 1000ms, slow_down adds 5000ms → 6000ms
                expires_in: 120,
            };

            const promise = auth.pollForToken(codeResponse);
            // First sleep: 1000ms → fetch returns slow_down → interval becomes 6000ms
            await vi.advanceTimersByTimeAsync(1100);
            // Second sleep: 6000ms → fetch returns success
            await vi.advanceTimersByTimeAsync(6100);

            const result = await promise;
            expect(result.access_token).toBe('eyJ-access-token');
        });

        it('throws on terminal error (access_denied)', async () => {
            const fetch = mockFetch([
                { status: 400, body: { error: 'access_denied', error_description: 'User denied access' } },
            ]);
            const auth = createAuthenticator(fetch);

            const codeResponse: DeviceCodeResponse = {
                ...DEVICE_CODE_RESPONSE,
                interval: 1,
                expires_in: 60,
            };

            const promise = auth.pollForToken(codeResponse);
            // Prevent Node from reporting unhandled rejection before we assert
            promise.catch(() => {});
            await vi.advanceTimersByTimeAsync(1100);

            await expect(promise).rejects.toThrow('User denied access');
        });

        it('throws on expiration', async () => {
            const fetch = mockFetch([
                { status: 400, body: { error: 'authorization_pending' } },
            ]);
            const auth = createAuthenticator(fetch);

            const codeResponse: DeviceCodeResponse = {
                ...DEVICE_CODE_RESPONSE,
                interval: 1,
                expires_in: 0, // Already expired
            };

            await expect(auth.pollForToken(codeResponse))
                .rejects.toThrow(/expired/i);
        });

        it('respects AbortSignal', async () => {
            const controller = new AbortController();
            const fetch = vi.fn(async () => {
                return { ok: false, status: 400, json: async () => ({ error: 'authorization_pending' }) } as Response;
            });
            const auth = createAuthenticator(fetch);

            const codeResponse: DeviceCodeResponse = {
                ...DEVICE_CODE_RESPONSE,
                interval: 1,
                expires_in: 300,
            };

            // Abort before first poll completes
            controller.abort(new DOMException('Cancelled', 'AbortError'));

            await expect(auth.pollForToken(codeResponse, controller.signal))
                .rejects.toThrow();
        });

        afterEach(() => {
            vi.useRealTimers();
        });
    });
});
