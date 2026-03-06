/**
 * devServerEsm-bug88.test.ts
 *
 * Regression: cacheBustUrl() was defined in DevServer but never called.
 * ESM modules were never cache-busted during hot-reload because
 * invalidateModule() only cleared CJS require.cache.
 *
 * After the fix:
 * - invalidateModule() calls cacheBustUrl() and stores the result
 * - cacheBustUrl() is exported for use in setup callbacks
 */
import { describe, it, expect } from 'vitest';
import { cacheBustUrl } from '../../src/server/DevServer.js';

describe('DevServer: ESM cache-bust (bug #88)', () => {
    it('cacheBustUrl should produce a file:// URL with timestamp query', () => {
        const url = cacheBustUrl('./src/tools.ts');
        expect(url).toMatch(/^file:\/\//);
        expect(url).toMatch(/\?t=\d+/);
        expect(url).toContain('tools.ts');
    });

    it('cacheBustUrl should produce different URLs on successive calls', async () => {
        const url1 = cacheBustUrl('./src/a.ts');
        // Tiny delay to ensure timestamp differs
        await new Promise(r => setTimeout(r, 2));
        const url2 = cacheBustUrl('./src/a.ts');
        expect(url1).not.toBe(url2);
    });

    it('cacheBustUrl should handle absolute paths', () => {
        const url = cacheBustUrl('/absolute/path/to/module.ts');
        expect(url).toMatch(/^file:\/\//);
        expect(url).toMatch(/\?t=\d+/);
    });

    it('should be exported from the server barrel', async () => {
        const barrel = await import('../../src/server/index.js');
        expect(barrel.cacheBustUrl).toBeDefined();
        expect(typeof barrel.cacheBustUrl).toBe('function');
    });

    it('should be exported from the main index', async () => {
        const main = await import('../../src/index.js');
        expect(main.cacheBustUrl).toBeDefined();
        expect(typeof main.cacheBustUrl).toBe('function');
    });
});
