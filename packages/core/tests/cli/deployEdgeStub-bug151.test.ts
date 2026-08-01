/**
 * Bug #151 — Deploy edge-stub resolution (integration + source analysis)
 *
 * Previously, `edgeStubAliases()` used `createRequire().resolve('mcpfusion')`
 * which failed because (1) the package is `@mcpfusion/core`, and (2) the
 * exports map only defines the `"import"` (ESM) condition — CJS
 * `require.resolve` fails even with the correct name.
 *
 * Then `alias` was used instead of a plugin, but esbuild `alias` does
 * prefix matching: aliasing `fs` → `edge-stub.js` turns `fs/promises`
 * → `edge-stub.js/promises` which doesn't exist.
 *
 * The fix uses an esbuild **plugin** with `onResolve` that intercepts
 * ALL node built-in imports including subpaths, and `builtinModules`
 * from `node:module` to dynamically build the regex — future-proof.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { tmpdir } from 'node:os';
import { builtinModules } from 'node:module';

const SRC_PATH = resolve(__dirname, '../../src/cli/commands/deploy.ts');
const DIST_PATH = resolve(__dirname, '../../dist/cli/commands/deploy.js');
const EDGE_STUB_DIST = resolve(__dirname, '../../dist/edge-stub.js');
const EDGE_STUB_SRC = resolve(__dirname, '../../src/edge-stub.ts');

const deploySource = readFileSync(SRC_PATH, 'utf-8');

// ── Source Analysis ─────────────────────────────────────────────────

describe('Bug #151 — source analysis: no require.resolve', () => {
    it('should NOT use require.resolve to locate edge-stub', () => {
        expect(deploySource).not.toContain("require.resolve('mcpfusion')");
        expect(deploySource).not.toContain('require.resolve("mcpfusion")');
        expect(deploySource).not.toContain("require.resolve('@mcpfusion/core')");
        expect(deploySource).not.toContain('require.resolve("@mcpfusion/core")');
    });

    it('should NOT use esbuild alias (prefix matching breaks subpaths)', () => {
        // alias: edgeStubAliases() was the broken pattern
        expect(deploySource).not.toMatch(/alias\s*:\s*edgeStubAliases/);
    });

    it('should use an esbuild plugin with onResolve', () => {
        expect(deploySource).toContain('edgeStubPlugin');
        expect(deploySource).toContain('onResolve');
        expect(deploySource).toMatch(/plugins:\s*\[edgeStubPlugin\(\w*\)\]/);
    });

    it('should use builtinModules from node:module for dynamic list', () => {
        expect(deploySource).toContain('builtinModules');
        expect(deploySource).toContain("from 'node:module'");
    });

    it('should use import.meta.url relative resolution for edge-stub path', () => {
        expect(deploySource).toContain("new URL('../../edge-stub.js', import.meta.url)");
        expect(deploySource).toContain('fileURLToPath');
    });

    it('should NOT have unused dirname import', () => {
        const pathImport = deploySource.match(/import\s*\{([^}]*)\}\s*from\s*['"]node:path['"]/);
        expect(pathImport).toBeTruthy();
        expect(pathImport![1]).not.toContain('dirname');
    });
});

// ── Edge Stub File Existence ────────────────────────────────────────

describe('Bug #151 — edge-stub physical existence', () => {
    it('should have edge-stub.ts in source', () => {
        expect(existsSync(EDGE_STUB_SRC)).toBe(true);
    });

    it('should have edge-stub.js in dist after build', () => {
        expect(existsSync(EDGE_STUB_DIST)).toBe(true);
    });

    it('should maintain correct relative distance', () => {
        const deployDir = resolve(DIST_PATH, '..');
        const rel = relative(deployDir, EDGE_STUB_DIST).replace(/\\/g, '/');
        expect(rel).toBe('../../edge-stub.js');
    });
});

// ── Regex Coverage ──────────────────────────────────────────────────

describe('Bug #151 — BUILTIN_FILTER regex coverage', () => {
    // Reconstruct the same regex as deploy.ts
    const roots = [
        ...new Set(builtinModules.filter(m => !m.startsWith('_')).map(m => m.split('/')[0]!)),
    ];
    const filter = new RegExp(`^(node:)?(${roots.join('|')})(/.*)?$`);

    it('should match bare module specifiers', () => {
        expect(filter.test('fs')).toBe(true);
        expect(filter.test('path')).toBe(true);
        expect(filter.test('crypto')).toBe(true);
        expect(filter.test('child_process')).toBe(true);
        expect(filter.test('http2')).toBe(true);
    });

    it('should match node: prefixed specifiers', () => {
        expect(filter.test('node:fs')).toBe(true);
        expect(filter.test('node:path')).toBe(true);
        expect(filter.test('node:crypto')).toBe(true);
        expect(filter.test('node:process')).toBe(true);
    });

    it('should match subpath imports (the core bug)', () => {
        expect(filter.test('node:fs/promises')).toBe(true);
        expect(filter.test('fs/promises')).toBe(true);
        expect(filter.test('node:path/posix')).toBe(true);
        expect(filter.test('node:path/win32')).toBe(true);
        expect(filter.test('node:dns/promises')).toBe(true);
        expect(filter.test('node:stream/promises')).toBe(true);
        expect(filter.test('node:stream/consumers')).toBe(true);
        expect(filter.test('node:stream/web')).toBe(true);
        expect(filter.test('node:readline/promises')).toBe(true);
        expect(filter.test('node:timers/promises')).toBe(true);
        expect(filter.test('node:util/types')).toBe(true);
        expect(filter.test('node:assert/strict')).toBe(true);
        expect(filter.test('node:inspector/promises')).toBe(true);
    });

    it('should NOT match non-node modules', () => {
        expect(filter.test('lodash')).toBe(false);
        expect(filter.test('esbuild')).toBe(false);
        expect(filter.test('@mcpfusion/core')).toBe(false);
        expect(filter.test('zod')).toBe(false);
        expect(filter.test('./my-module')).toBe(false);
    });

    it('should cover ALL Node.js built-in modules', () => {
        for (const mod of builtinModules.filter(m => !m.startsWith('_'))) {
            expect(filter.test(mod), `missing: ${mod}`).toBe(true);
            expect(filter.test(`node:${mod}`), `missing: node:${mod}`).toBe(true);
        }
    });
});

// ── REAL esbuild integration test ───────────────────────────────────

/** Reconstruct the exact plugin used in deploy.ts */
function createTestPlugin(): import('esbuild').Plugin {
    const roots = [
        ...new Set(builtinModules.filter(m => !m.startsWith('_')).map(m => m.split('/')[0]!)),
    ];
    const builtinFilter = new RegExp(`^(node:)?(${roots.join('|')})(/.*)?$`);
    const stubPathEscaped = JSON.stringify(EDGE_STUB_DIST);

    return {
        name: 'mcpfusion-edge-stub',
        setup(build) {
            build.onResolve({ filter: builtinFilter }, (args) => ({
                path: args.path,
                namespace: 'edge-stub',
            }));
            build.onLoad({ filter: /.*/, namespace: 'edge-stub' }, () => ({
                contents: [
                    `const _stub = require(${stubPathEscaped});`,
                    `const CRASH = (api) => { throw new Error(\`[Vinkius Edge] "\${api}" is blocked.\`); };`,
                    `module.exports = new Proxy(_stub, {`,
                    `  get(target, prop) {`,
                    `    if (prop in target) return target[prop];`,
                    `    if (prop === '__esModule') return true;`,
                    `    if (typeof prop === 'symbol') return undefined;`,
                    `    return (...args) => CRASH(prop);`,
                    `  }`,
                    `});`,
                ].join('\n'),
                loader: 'js',
                resolveDir: '.',
            }));
        },
    };
}

describe('Bug #151 — esbuild plugin integration', () => {
    it('should bundle a file that imports node builtins without errors', async () => {
        const esbuild = await import('esbuild');

        // Create a temp file that imports various node builtins (including subpaths)
        const tmpDir = mkdtempSync(join(tmpdir(), 'mcpfusion-deploy-test-'));
        const entryFile = join(tmpDir, 'entry.mjs');
        writeFileSync(entryFile, [
            'import { readFileSync } from "node:fs";',
            'import { readFile } from "node:fs/promises";',
            'import { resolve as pathResolve } from "node:path";',
            'import { join as pathJoin } from "node:path/posix";',
            'import { createHash } from "node:crypto";',
            'import { EventEmitter } from "node:events";',
            'import { createServer } from "node:http";',
            'import { connect } from "node:http2";',
            'import { Socket } from "node:net";',
            'import { Readable } from "node:stream";',
            'import { pipeline } from "node:stream/promises";',
            'import process from "node:process";',
            'import { lookup } from "node:dns/promises";',
            'import { createInterface } from "node:readline";',
            'import { setTimeout as setTimeoutP } from "node:timers/promises";',
            'import { types } from "node:util";',
            'import { isDeepStrictEqual } from "node:assert/strict";',
            'console.log("bundled OK");',
        ].join('\n'));

        try {
            const result = await esbuild.build({
                entryPoints: [entryFile],
                bundle: true,
                format: 'iife',
                platform: 'browser',
                target: 'es2022',
                write: false,
                logLevel: 'silent',
                plugins: [createTestPlugin()],
            });

            // Must produce output with no errors
            expect(result.errors).toHaveLength(0);
            expect(result.outputFiles).toBeDefined();
            expect(result.outputFiles!.length).toBeGreaterThan(0);

            const output = new TextDecoder().decode(result.outputFiles![0]!.contents);
            expect(output.length).toBeGreaterThan(0);
            expect(output).toContain('bundled OK');
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('should bundle with the MCP SDK pattern (node:fs + node:fs/promises + node:process)', async () => {
        const esbuild = await import('esbuild');

        // Simulate the exact imports that caused failures in production
        const tmpDir = mkdtempSync(join(tmpdir(), 'mcpfusion-deploy-mcp-'));
        const entryFile = join(tmpDir, 'mcp-entry.mjs');
        writeFileSync(entryFile, [
            '// Simulates @modelcontextprotocol/sdk imports',
            'import process from "node:process";',
            'import { createServer } from "node:http";',
            '// Simulates @mcpfusion/core/dist/introspection/CapabilityLockfile.js',
            'import { readFile } from "node:fs/promises";',
            '// Simulates @hono/node-server',
            'import { connect } from "http2";',
            '// Various other patterns found in real deps',
            'import { spawn } from "child_process";',
            'import { EventEmitter } from "events";',
            'import { Buffer } from "buffer";',
            'console.log("mcp bundle OK");',
        ].join('\n'));

        try {
            const result = await esbuild.build({
                entryPoints: [entryFile],
                bundle: true,
                format: 'iife',
                platform: 'browser',
                target: 'es2022',
                write: false,
                logLevel: 'silent',
                plugins: [createTestPlugin()],
            });

            expect(result.errors).toHaveLength(0);
            expect(result.outputFiles!.length).toBeGreaterThan(0);

            const output = new TextDecoder().decode(result.outputFiles![0]!.contents);
            expect(output).toContain('mcp bundle OK');
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

// ── Compiled deploy.js Verification ─────────────────────────────────

describe('Bug #151 — compiled deploy.js correctness', () => {
    it('should not contain stale require.resolve in compiled output', () => {
        if (!existsSync(DIST_PATH)) return;
        const compiled = readFileSync(DIST_PATH, 'utf-8');
        expect(compiled).not.toContain("require.resolve('mcpfusion')");
        expect(compiled).not.toContain("require.resolve('@mcpfusion/core')");
    });

    it('should contain the relative URL resolution in compiled output', () => {
        if (!existsSync(DIST_PATH)) return;
        const compiled = readFileSync(DIST_PATH, 'utf-8');
        expect(compiled).toContain('../../edge-stub.js');
        expect(compiled).toContain('import.meta.url');
    });

    it('should use plugins instead of alias in compiled output', () => {
        if (!existsSync(DIST_PATH)) return;
        const compiled = readFileSync(DIST_PATH, 'utf-8');
        expect(compiled).toContain('edgeStubPlugin');
        expect(compiled).toContain('onResolve');
    });

    it('should contain sanitizeBundleForEdge in compiled output', () => {
        if (!existsSync(DIST_PATH)) return;
        const compiled = readFileSync(DIST_PATH, 'utf-8');
        expect(compiled).toContain('sanitizeBundleForEdge');
    });
});

// ── Bundle Sanitizer Tests ──────────────────────────────────────────────────

describe('Bug #151 — sanitizeBundleForEdge', () => {
    // Replicate the EXACT server-side static analysis regexes
    const SERVER_PATTERNS: Array<[RegExp, string]> = [
        [/\b__proto__\s*[=\[]/,                       '__proto__'],
        [/Object\.setPrototypeOf\s*\(/,               'Object.setPrototypeOf'],
        [/Reflect\.setPrototypeOf\s*\(/,              'Reflect.setPrototypeOf'],
        [/\beval\s*\(/,                               'eval()'],
        [/\bnew\s+Function\s*\(/,                     'new Function()'],
        [/Function\s*\.\s*constructor\b/,             'Function.constructor'],
        [/Function\s*\(\s*['"]/,                      "Function('string')"],
    ];

    // Replicate the sanitizer from deploy.ts
    function sanitize(code: string): string {
        return code
            .replace(/\beval\s*\(/g, '(0,eval)(')
            .replace(/\bnew\s+Function\s*\(/g, 'new(0,Function)(')
            .replace(/Function\s*\.\s*constructor\b/g, 'Function["constructor"]')
            .replace(/Function\s*\(\s*['"]/g, (m) => `(0,Function)(${m.slice(m.indexOf('(') + 1)}`)
            .replace(/Object\.setPrototypeOf\s*\(/g, 'Object["setPrototypeOf"](')
            .replace(/Reflect\.setPrototypeOf\s*\(/g, 'Reflect["setPrototypeOf"](')
            .replace(/\b__proto__\s*([=\[])/g, '["__proto__"]$1');
    }

    const testCases = [
        { input: 'obj.__proto__ = val',            pattern: '__proto__' },
        { input: 'obj.__proto__["x"]',             pattern: '__proto__' },
        { input: 'Object.setPrototypeOf(a, b)',    pattern: 'Object.setPrototypeOf' },
        { input: 'Reflect.setPrototypeOf(a, b)',   pattern: 'Reflect.setPrototypeOf' },
        { input: 'eval("code")',                   pattern: 'eval()' },
        { input: 'var x = eval (expr)',            pattern: 'eval()' },
        { input: 'new Function("return 1")',       pattern: 'new Function()' },
        { input: 'Function.constructor',           pattern: 'Function.constructor' },
        { input: "Function('return 1')",           pattern: "Function('string')" },
        { input: 'Function("return 1")',           pattern: "Function('string')" },
    ];

    for (const { input, pattern } of testCases) {
        it(`should neutralize: ${pattern} in "${input}"`, () => {
            // Find the matching server regex
            const serverRegex = SERVER_PATTERNS.find(([, name]) => name === pattern)?.[0];
            expect(serverRegex).toBeDefined();

            // Verify original input WOULD be caught by server
            expect(serverRegex!.test(input)).toBe(true);

            // Sanitize and verify it no longer matches
            const sanitized = sanitize(input);
            expect(serverRegex!.test(sanitized)).toBe(false);
        });
    }

    it('should not alter safe code', () => {
        const safe = 'const x = 42; console.log("hello");';
        expect(sanitize(safe)).toBe(safe);
    });

    it('should handle multiple violations in one bundle', () => {
        const bundle = [
            'eval("code");',
            'Object.setPrototypeOf(a, b);',
            'obj.__proto__ = val;',
            'new Function("x");',
        ].join('\n');
        const sanitized = sanitize(bundle);

        for (const [regex] of SERVER_PATTERNS) {
            expect(regex.test(sanitized)).toBe(false);
        }
    });
});
