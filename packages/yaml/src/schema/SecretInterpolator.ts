/**
 * SecretInterpolator — ${SECRETS.KEY} Resolution
 *
 * Resolves `${SECRETS.KEY}` references in strings to actual values.
 *
 * **Open-source behavior**: Resolves from `process.env[KEY]`
 * **Vinkius Engine**: Resolves from the encrypted BYOC vault
 *
 * @module
 */

/** Regex matching ${SECRETS.KEY} tokens. */
const SECRETS_PATTERN = /\$\{SECRETS\.([A-Z0-9_]+)\}/g;

/**
 * Interpolate all `${SECRETS.KEY}` tokens in a string.
 *
 * @param template - String potentially containing secret references
 * @param secrets - Map of secret key → resolved value
 * @returns Interpolated string with secrets replaced
 * @throws When a referenced secret has no value
 */
export function interpolateSecrets(
    template: string,
    secrets: Readonly<Record<string, string>>,
): string {
    return template.replace(SECRETS_PATTERN, (match, key: string) => {
        const value = secrets[key];
        if (value === undefined) {
            throw new Error(
                `Secret "${key}" is referenced via \${SECRETS.${key}} but has no value. ` +
                `Set the environment variable ${key} or configure it in the Vinkius dashboard.`,
            );
        }
        return value;
    });
}

/**
 * Recursively interpolate secrets in any value (string, object, array).
 *
 * @param value - Any value from the parsed YAML
 * @param secrets - Map of secret key → resolved value
 * @returns Deep-cloned value with all secrets resolved
 */
export function interpolateSecretsDeep(
    value: unknown,
    secrets: Readonly<Record<string, string>>,
): unknown {
    if (typeof value === 'string') {
        return interpolateSecrets(value, secrets);
    }
    if (Array.isArray(value)) {
        return value.map(item => interpolateSecretsDeep(item, secrets));
    }
    if (value !== null && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = interpolateSecretsDeep(v, secrets);
        }
        return result;
    }
    return value;
}

/**
 * Resolve secrets from environment variables.
 * This is the **open-source** secret resolver.
 *
 * @param declaredSecrets - Secret names declared in the YAML spec
 * @returns Map of secret key → env var value
 */
export function resolveSecretsFromEnv(
    declaredSecrets: readonly string[],
): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const key of declaredSecrets) {
        const envValue = process.env[key];
        if (envValue !== undefined) {
            resolved[key] = envValue;
        }
    }

    return resolved;
}
