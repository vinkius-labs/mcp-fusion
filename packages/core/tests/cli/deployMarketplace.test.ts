/**
 * Deploy + Marketplace integration — source-level regression tests.
 *
 * Verifies that deploy.ts correctly imports and uses the marketplace
 * manifest reader. Same pattern as `deployGuards-bug81-82.test.ts`.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const deploySource = readFileSync(
    resolve(__dirname, '../../src/cli/commands/deploy.ts'),
    'utf-8',
);

describe('Deploy — Marketplace Manifest integration', () => {
    it('should import readMarketplaceManifest', () => {
        expect(deploySource).toContain('readMarketplaceManifest');
    });

    it('should import normalizeMarketplacePayload', () => {
        expect(deploySource).toContain('normalizeMarketplacePayload');
    });

    it('should include marketplace in the fetch body', () => {
        expect(deploySource).toContain('marketplace: marketplacePayload');
    });

    it('should handle marketplace_synced in the response', () => {
        expect(deploySource).toContain('marketplace_synced');
    });

    it('should display trust tier badge', () => {
        expect(deploySource).toContain('trust_tier');
    });
});
