/**
 * ConnectionResolver — Named Connections → Fetch Configuration
 *
 * Resolves named YAML connections into executable fetch configurations
 * with interpolated base URLs and auth headers.
 *
 * **Open-source behavior**: Plain resolution, no retry/timeout/SSRF
 * **Vinkius Engine**: Adds retry, timeout, circuit breaker, safeFetch
 *
 * @module
 */
import type { YamlConnectionDef } from '../schema/VurbYamlSpec.js';
import { interpolateSecrets } from '../schema/SecretInterpolator.js';

/** Resolved connection ready for HTTP calls. */
export interface ResolvedConnection {
    /** Fully interpolated base URL. */
    readonly baseUrl: string;
    /** Merged headers (auth + custom). */
    readonly headers: Readonly<Record<string, string>>;
    /** Request timeout in milliseconds. */
    readonly timeout_ms?: number;
}

/**
 * Resolve a single connection definition into a fetch-ready config.
 *
 * @param def - Connection definition from the YAML spec
 * @param secrets - Resolved secret values
 * @returns Connection with interpolated URLs and auth headers
 */
export function resolveConnection(
    def: YamlConnectionDef,
    secrets: Readonly<Record<string, string>>,
): ResolvedConnection {
    const baseUrl = interpolateSecrets(def.base_url, secrets);
    const headers: Record<string, string> = {};
    const timeout_ms = def.timeout_ms;

    // ── Merge custom headers ─────────────────────────────
    if (def.headers) {
        for (const [key, value] of Object.entries(def.headers)) {
            headers[key] = interpolateSecrets(value, secrets);
        }
    }

    // ── Apply auth ───────────────────────────────────────
    if (def.auth) {
        switch (def.auth.type) {
            case 'bearer': {
                const token = def.auth.token
                    ? interpolateSecrets(def.auth.token, secrets)
                    : '';
                headers['Authorization'] = `Bearer ${token}`;
                break;
            }
            case 'basic': {
                const username = def.auth.username
                    ? interpolateSecrets(def.auth.username, secrets)
                    : '';
                const password = def.auth.password
                    ? interpolateSecrets(def.auth.password, secrets)
                    : '';
                const encoded = Buffer.from(`${username}:${password}`).toString('base64');
                headers['Authorization'] = `Basic ${encoded}`;
                break;
            }
            case 'custom_header': {
                const headerName = def.auth.header_name ?? 'X-API-Key';
                const headerValue = def.auth.header_value
                    ? interpolateSecrets(def.auth.header_value, secrets)
                    : '';
                headers[headerName] = headerValue;
                break;
            }
            // 'none' — no auth headers
        }
    }

    return { baseUrl, headers, ...(timeout_ms !== undefined && { timeout_ms }) };
}

/**
 * Resolve all connections from a YAML spec.
 *
 * @param connections - Named connection definitions
 * @param secrets - Resolved secret values
 * @returns Map of connection name → resolved config
 */
export function resolveAllConnections(
    connections: Readonly<Record<string, YamlConnectionDef>> | undefined,
    secrets: Readonly<Record<string, string>>,
): ReadonlyMap<string, ResolvedConnection> {
    const resolved = new Map<string, ResolvedConnection>();

    if (connections) {
        for (const [name, def] of Object.entries(connections)) {
            resolved.set(name, resolveConnection(def, secrets));
        }
    }

    return resolved;
}
