/**
 * Bug #83 — Deploy esbuild resolution
 *
 * Verifies that deploy.ts uses the shared `resolveEsbuild` helper
 * which discovers esbuild from transitive deps (tsx, vite, vitest)
 * and only falls back to `npm install --legacy-peer-deps` as a last
 * resort, rather than blindly running `npm install -D esbuild`.
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

const introspectSource = readFileSync(
    resolve(__dirname, '../../src/cli/commands/introspect.ts'),
    'utf-8',
);

describe('Bug #83 — esbuild resolution resilience', () => {
    it('deploy.ts should use resolveEsbuild from introspect', () => {
        expect(deploySource).toContain('resolveEsbuild');
        expect(deploySource).toContain('./introspect.js');
    });

    it('should NOT use stdio: ignore for the npm install', () => {
        // stdio: 'ignore' made the install completely invisible
        expect(deploySource).not.toContain("stdio: 'ignore'");
    });

    it('resolveEsbuild should try transitive discovery before npm install', () => {
        // Must try tsx, vite, vitest as transitive hosts
        expect(introspectSource).toContain("'tsx'");
        expect(introspectSource).toContain("'vite'");
        expect(introspectSource).toContain("'vitest'");
    });

    it('resolveEsbuild should use --legacy-peer-deps in installfall back', () => {
        expect(introspectSource).toContain('--legacy-peer-deps');
    });
});
