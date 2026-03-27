/**
 * credentials — Test Suite
 *
 * Covers defineCredentials, requireCredential, and CredentialMissingError
 * across all CredentialType variants, edge cases, provider scenarios,
 * and runtime injection patterns.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
    defineCredentials,
    requireCredential,
    CredentialMissingError,
} from '../../src/credentials/index.js';
import type { CredentialDef, CredentialType, CredentialsMap } from '../../src/credentials/index.js';

// ── Test Helpers ───────────────────────────────────────────────────────────────

const g = globalThis as Record<string, unknown>;

function setSecrets(secrets: Record<string, unknown> | undefined | null): void {
    g['__vinkius_secrets'] = secrets;
}

afterEach(() => {
    delete g['__vinkius_secrets'];
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. defineCredentials — identity, typing, field preservation
// ─────────────────────────────────────────────────────────────────────────────

describe('defineCredentials', () => {
    it('returns the exact same reference (identity function)', () => {
        const map = { KEY: { label: 'Key', description: 'A key.', type: 'api_key' as const } };
        expect(defineCredentials(map)).toBe(map);
    });

    it('does not mutate the input map', () => {
        const map = { KEY: { label: 'Key', description: 'A key.' } };
        const before = JSON.stringify(map);
        defineCredentials(map);
        expect(JSON.stringify(map)).toBe(before);
    });

    it('accepts an empty map', () => {
        const result = defineCredentials({});
        expect(result).toEqual({});
    });

    it('accepts a map with multiple credentials', () => {
        const result = defineCredentials({
            HOST:     { label: 'Host',     description: 'DB host.',     type: 'string' },
            PORT:     { label: 'Port',     description: 'DB port.',     type: 'number', default_value: '3306' },
            PASSWORD: { label: 'Password', description: 'DB password.', type: 'password', sensitive: true },
        });
        expect(Object.keys(result)).toHaveLength(3);
        expect(result['PORT'].default_value).toBe('3306');
    });

    describe('CredentialDef field preservation', () => {
        it('preserves label and description', () => {
            const creds = defineCredentials({
                KEY: { label: 'My Label', description: 'My description.' },
            });
            expect(creds['KEY'].label).toBe('My Label');
            expect(creds['KEY'].description).toBe('My description.');
        });

        it('preserves optional fields: placeholder, group, docs_url', () => {
            const creds = defineCredentials({
                TOKEN: {
                    label: 'Token',
                    description: 'Auth token.',
                    placeholder: 'tok_live_xxx',
                    group: 'Authentication',
                    docs_url: 'https://example.com/tokens',
                },
            });
            expect(creds['TOKEN'].placeholder).toBe('tok_live_xxx');
            expect(creds['TOKEN'].group).toBe('Authentication');
            expect(creds['TOKEN'].docs_url).toBe('https://example.com/tokens');
        });

        it('preserves select type with allowed values', () => {
            const creds = defineCredentials({
                REGION: {
                    label: 'AWS Region',
                    description: 'Your AWS region.',
                    type: 'select',
                    allowed: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
                    default_value: 'us-east-1',
                },
            });
            expect(creds['REGION'].allowed).toEqual(['us-east-1', 'eu-west-1', 'ap-southeast-1']);
            expect(creds['REGION'].default_value).toBe('us-east-1');
        });

        it('preserves sensitive flag', () => {
            const creds = defineCredentials({
                SECRET: { label: 'Secret', description: 'A secret.', sensitive: true },
                PUBLIC: { label: 'Public', description: 'A public value.', sensitive: false },
            });
            expect(creds['SECRET'].sensitive).toBe(true);
            expect(creds['PUBLIC'].sensitive).toBe(false);
        });

        it('preserves required: false', () => {
            const creds = defineCredentials({
                OPTIONAL: { label: 'Optional', description: 'Optional field.', required: false },
            });
            expect(creds['OPTIONAL'].required).toBe(false);
        });
    });

    describe('all CredentialType values are accepted', () => {
        const allTypes: CredentialType[] = [
            'api_key', 'token', 'password',
            'url', 'connection_string',
            'string', 'number', 'email', 'boolean',
            'select',
        ];

        for (const type of allTypes) {
            it(`accepts type: '${type}'`, () => {
                const entry: CredentialDef = { label: type, description: `A ${type}.`, type };
                const result = defineCredentials({ FIELD: entry });
                expect(result['FIELD'].type).toBe(type);
            });
        }
    });

    describe('real-world provider declarations', () => {
        it('Stripe — two api_keys', () => {
            const creds = defineCredentials({
                STRIPE_SECRET_KEY: {
                    label: 'Stripe Secret Key',
                    description: 'Found in Stripe Dashboard → Developers → API keys.',
                    type: 'api_key',
                    required: true,
                    sensitive: true,
                    group: 'Stripe',
                },
                STRIPE_PUBLISHABLE_KEY: {
                    label: 'Stripe Publishable Key',
                    description: 'Found in Stripe Dashboard → Developers → API keys.',
                    type: 'api_key',
                    required: true,
                    sensitive: false,
                    group: 'Stripe',
                },
            });
            expect(creds['STRIPE_SECRET_KEY'].type).toBe('api_key');
            expect(creds['STRIPE_PUBLISHABLE_KEY'].type).toBe('api_key');
        });

        it('Notion — token + string ID', () => {
            const creds = defineCredentials({
                NOTION_TOKEN: {
                    label: 'Notion Integration Token',
                    description: 'Your Notion internal integration token.',
                    type: 'token',
                    required: true,
                    sensitive: true,
                },
                NOTION_DATABASE_ID: {
                    label: 'Database ID',
                    description: 'The Notion database ID from the page URL.',
                    type: 'string',
                    required: true,
                    sensitive: false,
                },
            });
            expect(creds['NOTION_TOKEN'].type).toBe('token');
            expect(creds['NOTION_DATABASE_ID'].type).toBe('string');
        });

        it('MySQL — host, port (number), user, password, dbname', () => {
            const creds = defineCredentials({
                DB_HOST:     { label: 'Host',     description: 'MySQL host.',     type: 'string' },
                DB_PORT:     { label: 'Port',     description: 'MySQL port.',     type: 'number', default_value: '3306' },
                DB_USER:     { label: 'User',     description: 'MySQL user.',     type: 'string' },
                DB_PASSWORD: { label: 'Password', description: 'MySQL password.', type: 'password', sensitive: true },
                DB_NAME:     { label: 'Database', description: 'Database name.',  type: 'string' },
            });
            expect(creds['DB_PORT'].type).toBe('number');
            expect(creds['DB_PORT'].default_value).toBe('3306');
            expect(creds['DB_PASSWORD'].sensitive).toBe(true);
        });

        it('MySQL — connection_string shorthand', () => {
            const creds = defineCredentials({
                DATABASE_URL: {
                    label: 'MySQL Connection String',
                    description: 'Full connection URI: mysql://user:pass@host:3306/db',
                    type: 'connection_string',
                    sensitive: true,
                    required: true,
                },
            });
            expect(creds['DATABASE_URL'].type).toBe('connection_string');
        });

        it('AWS — api_key pair + select region', () => {
            const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
            const creds = defineCredentials({
                AWS_ACCESS_KEY_ID:     { label: 'Access Key ID',     description: 'AWS access key.', type: 'api_key',  sensitive: false },
                AWS_SECRET_ACCESS_KEY: { label: 'Secret Access Key', description: 'AWS secret.',    type: 'api_key',  sensitive: true },
                AWS_REGION:            { label: 'Region',            description: 'AWS region.',     type: 'select',  allowed: regions, default_value: 'us-east-1' },
            });
            expect(creds['AWS_REGION'].allowed).toEqual(regions);
            expect(creds['AWS_REGION'].default_value).toBe('us-east-1');
        });

        it('SendGrid — api_key + email sender', () => {
            const creds = defineCredentials({
                SENDGRID_API_KEY:    { label: 'API Key',      description: 'SendGrid API key.', type: 'api_key', sensitive: true },
                SENDGRID_FROM_EMAIL: { label: 'Sender Email', description: 'Verified sender.',  type: 'email',   required: true },
            });
            expect(creds['SENDGRID_FROM_EMAIL'].type).toBe('email');
        });

        it('Slack — bot token + channel + SSL boolean', () => {
            const creds = defineCredentials({
                SLACK_BOT_TOKEN: { label: 'Bot Token',  description: 'Slack bot token.',    type: 'token',   sensitive: true },
                SLACK_CHANNEL:   { label: 'Channel ID', description: 'Default channel.',    type: 'string' },
                SLACK_USE_SSL:   { label: 'Use SSL',    description: 'Enable SSL.',          type: 'boolean', default_value: 'true' },
            });
            expect(creds['SLACK_USE_SSL'].type).toBe('boolean');
            expect(creds['SLACK_USE_SSL'].default_value).toBe('true');
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. requireCredential — runtime secrets injection
// ─────────────────────────────────────────────────────────────────────────────

describe('requireCredential', () => {
    describe('success cases', () => {
        it('returns the string value when present', () => {
            setSecrets({ MY_KEY: 'secret-value-123' });
            expect(requireCredential('MY_KEY')).toBe('secret-value-123');
        });

        it('returns a URL value correctly', () => {
            setSecrets({ REDIS_URL: 'https://xxx.upstash.io' });
            expect(requireCredential('REDIS_URL')).toBe('https://xxx.upstash.io');
        });

        it('returns a value that looks like a number (stored as string)', () => {
            setSecrets({ DB_PORT: '3306' });
            expect(requireCredential('DB_PORT')).toBe('3306');
        });

        it('returns a value with special characters untouched', () => {
            const complex = 'mysql://user:p@$$w0rd!@host:3306/mydb?ssl=true';
            setSecrets({ DATABASE_URL: complex });
            expect(requireCredential('DATABASE_URL')).toBe(complex);
        });

        it('returns value with leading/trailing spaces preserved (not trimmed)', () => {
            // We only reject ALL-whitespace. A single non-whitespace char is valid.
            setSecrets({ TOKEN: ' tok_live_abc ' });
            expect(requireCredential('TOKEN')).toBe(' tok_live_abc ');
        });

        it('reads independent keys from the same secrets object', () => {
            setSecrets({ KEY_A: 'value-a', KEY_B: 'value-b', KEY_C: 'value-c' });
            expect(requireCredential('KEY_A')).toBe('value-a');
            expect(requireCredential('KEY_B')).toBe('value-b');
            expect(requireCredential('KEY_C')).toBe('value-c');
        });
    });

    describe('missing/invalid — throws CredentialMissingError', () => {
        it('throws when __vinkius_secrets is undefined', () => {
            // global not set at all (deleted in afterEach)
            expect(() => requireCredential('ANY_KEY')).toThrow(CredentialMissingError);
        });

        it('throws when __vinkius_secrets is explicitly set to undefined', () => {
            setSecrets(undefined);
            expect(() => requireCredential('ANY_KEY')).toThrow(CredentialMissingError);
        });

        it('throws when __vinkius_secrets is null', () => {
            setSecrets(null);
            expect(() => requireCredential('ANY_KEY')).toThrow(CredentialMissingError);
        });

        it('throws when __vinkius_secrets is an empty object', () => {
            setSecrets({});
            expect(() => requireCredential('MISSING_KEY')).toThrow(CredentialMissingError);
        });

        it('throws when the key is absent (other keys present)', () => {
            setSecrets({ OTHER_KEY: 'some-value' });
            expect(() => requireCredential('MISSING_KEY')).toThrow(CredentialMissingError);
        });

        it('throws when value is empty string', () => {
            setSecrets({ KEY: '' });
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });

        it('throws when value is whitespace-only (spaces)', () => {
            setSecrets({ KEY: '   ' });
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });

        it('throws when value is whitespace-only (tabs/newlines)', () => {
            setSecrets({ KEY: '\t\n\r' });
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });

        it('throws when value is a number (not a string)', () => {
            g['__vinkius_secrets'] = { KEY: 3306 };
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });

        it('throws when value is a boolean (not a string)', () => {
            g['__vinkius_secrets'] = { KEY: true };
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });

        it('throws when value is an object (not a string)', () => {
            g['__vinkius_secrets'] = { KEY: { nested: 'value' } };
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });

        it('throws when value is null', () => {
            g['__vinkius_secrets'] = { KEY: null };
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });

        it('throws when __vinkius_secrets is not an object (number)', () => {
            g['__vinkius_secrets'] = 42;
            expect(() => requireCredential('KEY')).toThrow(CredentialMissingError);
        });
    });

    describe('CredentialMissingError properties', () => {
        function catch1(key: string, hint?: string): CredentialMissingError {
            setSecrets({});
            try {
                requireCredential(key, hint);
            } catch (e) {
                return e as CredentialMissingError;
            }
            throw new Error('Expected CredentialMissingError to be thrown');
        }

        it('error.name is "CredentialMissingError"', () => {
            expect(catch1('KEY').name).toBe('CredentialMissingError');
        });

        it('error is instanceof CredentialMissingError', () => {
            expect(catch1('KEY')).toBeInstanceOf(CredentialMissingError);
        });

        it('error is instanceof Error', () => {
            expect(catch1('KEY')).toBeInstanceOf(Error);
        });

        it('error.credentialKey matches the requested key', () => {
            expect(catch1('STRIPE_SECRET_KEY').credentialKey).toBe('STRIPE_SECRET_KEY');
        });

        it('error.message contains the credential key', () => {
            expect(catch1('MY_UNIQUE_KEY').message).toContain('MY_UNIQUE_KEY');
        });

        it('error.message contains hint when provided', () => {
            const err = catch1('TOKEN', 'Found in Notion → Settings → Integrations.');
            expect(err.message).toContain('Found in Notion → Settings → Integrations.');
        });

        it('error.message does NOT contain hint text when no hint provided', () => {
            // message should be generic
            const err = catch1('SOME_KEY');
            expect(err.message).toContain('SOME_KEY');
            expect(err.message).not.toContain('undefined');
        });

        it('error.message mentions globalThis.__vinkius_secrets for local dev guidance', () => {
            const err = catch1('KEY');
            expect(err.message).toContain('__vinkius_secrets');
        });
    });

    describe('integration: full BYOC flow simulation', () => {
        it('Redis: URL + token injected and read by tools', () => {
            setSecrets({
                UPSTASH_REDIS_REST_URL:   'https://my-redis.upstash.io',
                UPSTASH_REDIS_REST_TOKEN: 'AXxxTOKENxx==',
            });

            const url   = requireCredential('UPSTASH_REDIS_REST_URL',   'Found in Upstash console');
            const token = requireCredential('UPSTASH_REDIS_REST_TOKEN', 'Found in Upstash console');

            expect(url).toBe('https://my-redis.upstash.io');
            expect(token).toBe('AXxxTOKENxx==');
        });

        it('MySQL: 5 credentials injected and read correctly', () => {
            setSecrets({
                DB_HOST: 'db.example.com',
                DB_PORT: '3306',
                DB_USER: 'admin',
                DB_PASSWORD: 's3cur3pass!',
                DB_NAME: 'production',
            });

            expect(requireCredential('DB_HOST')).toBe('db.example.com');
            expect(requireCredential('DB_PORT')).toBe('3306');
            expect(requireCredential('DB_USER')).toBe('admin');
            expect(requireCredential('DB_PASSWORD')).toBe('s3cur3pass!');
            expect(requireCredential('DB_NAME')).toBe('production');
        });

        it('Stripe: two keys, failing if secret is missing', () => {
            setSecrets({ STRIPE_PUBLISHABLE_KEY: 'pk_live_xxx' });
            // Publishable key works
            expect(requireCredential('STRIPE_PUBLISHABLE_KEY')).toBe('pk_live_xxx');
            // Secret key missing → throws
            expect(() => requireCredential('STRIPE_SECRET_KEY')).toThrow(CredentialMissingError);
        });

        it('partial config: missing credential fails with correct key in error', () => {
            setSecrets({ SLACK_BOT_TOKEN: 'xoxb-123' });
            // token ok
            expect(requireCredential('SLACK_BOT_TOKEN')).toBe('xoxb-123');
            // webhook missing
            const err = (() => {
                try { requireCredential('SLACK_WEBHOOK_URL'); }
                catch (e) { return e as CredentialMissingError; }
            })()!;
            expect(err.credentialKey).toBe('SLACK_WEBHOOK_URL');
        });

        it('secrets object is read-only (requireCredential does not mutate it)', () => {
            const secrets = { KEY: 'value' };
            setSecrets(secrets);
            requireCredential('KEY');
            // Must not have been modified
            expect(secrets).toEqual({ KEY: 'value' });
            expect(Object.keys(secrets)).toHaveLength(1);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CredentialDef — type coverage (compile-time, confirmed at runtime)
// ─────────────────────────────────────────────────────────────────────────────

describe('CredentialDef shape (exhaustive fields)', () => {
    it('accepts all fields together', () => {
        const def: CredentialDef = {
            label: 'My Credential',
            description: 'Full-fat definition.',
            placeholder: 'enter-value',
            type: 'select',
            required: true,
            sensitive: false,
            group: 'Main',
            docs_url: 'https://docs.example.com',
            allowed: ['a', 'b', 'c'],
            default_value: 'a',
        };
        expect(def.allowed).toEqual(['a', 'b', 'c']);
        expect(def.default_value).toBe('a');
    });

    it('only label + description are required', () => {
        const def: CredentialDef = { label: 'Min', description: 'Minimal.' };
        // All optional fields should be undefined
        expect(def.type).toBeUndefined();
        expect(def.required).toBeUndefined();
        expect(def.sensitive).toBeUndefined();
        expect(def.group).toBeUndefined();
        expect(def.docs_url).toBeUndefined();
        expect(def.allowed).toBeUndefined();
        expect(def.default_value).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CredentialsMap — type assignability
// ─────────────────────────────────────────────────────────────────────────────

describe('CredentialsMap', () => {
    it('is assignable from a defineCredentials result', () => {
        const creds = defineCredentials({
            FOO: { label: 'Foo', description: 'Foo cred.' },
            BAR: { label: 'Bar', description: 'Bar cred.', type: 'password', sensitive: true },
        });
        const map: CredentialsMap = creds; // must not cause TS error
        expect(Object.keys(map)).toContain('FOO');
        expect(Object.keys(map)).toContain('BAR');
    });
});
