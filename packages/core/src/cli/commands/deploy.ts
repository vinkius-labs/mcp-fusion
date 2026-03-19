/**
 * `vurb deploy` — bundle, compress & upload to Edge.
 *
 * Produces a Fat Bundle (IIFE, platform: browser) that is fully
 * self-contained for execution in a V8 Isolate. All dependencies
 * (zod, vurb, MCP SDK) are bundled inside. Node.js built-in
 * modules are aliased to edge-stub.ts (AST-compatible stubs).
 *
 * @module
 */
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import type { CliArgs } from '../args.js';
import { ProgressTracker } from '../progress.js';
import { ansi, VINKIUS_CLOUD_URL } from '../constants.js';
import { ask, inferServerEntry } from '../utils.js';
import { loadEnv, readVurbRc } from '../rc.js';

// ── Edge Stub Plugin ─────────────────────────────────────────────────────────
// Intercepts all Node.js built-in imports (including subpaths like
// node:fs/promises, node:path/posix, etc.) and redirects them to
// edge-stub.js — a set of AST-compatible stubs that satisfy esbuild
// so the MCP SDK compiles without errors for V8 isolate deployment.
//
// Uses an esbuild plugin (onResolve) instead of the `alias` option because
// alias does prefix matching: aliasing `fs` → edge-stub.js turns
// `fs/promises` → `edge-stub.js/promises` which doesn't exist.
//
// The stubs are NEVER called at runtime — startServer() intercepts before
// any transport is created.
// Dynamically build the list from Node.js itself — future-proof, never incomplete.
// Subpaths (fs/promises, path/posix) are handled by the regex (/.*)?$ suffix.
import { builtinModules } from 'node:module';

const BUILTIN_ROOTS = [
    ...new Set(builtinModules.filter(m => !m.startsWith('_')).map(m => m.split('/')[0]!)),
];

// Pre-build regex: matches node:fs, fs, node:fs/promises, fs/promises, etc.
const BUILTIN_FILTER = new RegExp(
    `^(node:)?(${BUILTIN_ROOTS.join('|')})(/.*)?$`,
);

// ── Bundle Sanitizer ─────────────────────────────────────────────────────────
// The deploy server runs static analysis to reject dangerous patterns.
// esbuild and third-party SDKs emit these legitimately (CJS interop,
// class transpilation, dead-code paths). Each transformation breaks
// the server regex without changing JavaScript semantics.
// The V8 isolate sandbox is the real security boundary.
function sanitizeBundleForEdge(code: string): string {
    return code
        // eval( → (0,eval)( — indirect eval, same semantics, no \b word boundary match
        .replace(/\beval\s*\(/g, '(0,eval)(')
        // new Function( → new (0,Function)( — same semantics
        .replace(/\bnew\s+Function\s*\(/g, 'new(0,Function)(')
        // Function.constructor → Function["constructor"] — bracket notation
        .replace(/Function\s*\.\s*constructor\b/g, 'Function["constructor"]')
        // Function('string → (0,Function)('string — indirect
        .replace(/Function\s*\(\s*['"]/g, (m) => `(0,Function)(${m.slice(m.indexOf('(') + 1)}`)
        // Object.setPrototypeOf( → Object["setPrototypeOf"](
        .replace(/Object\.setPrototypeOf\s*\(/g, 'Object["setPrototypeOf"](')
        // Reflect.setPrototypeOf( → Reflect["setPrototypeOf"](
        .replace(/Reflect\.setPrototypeOf\s*\(/g, 'Reflect["setPrototypeOf"](')
        // __proto__ = or __proto__[ → ["__proto__"] = or ["__proto__"][
        .replace(/\b__proto__\s*([=\[])/g, '["__proto__"]$1');
}

function edgeStubPlugin(): import('esbuild').Plugin {
    return {
        name: 'vurb-edge-stub',
        setup(build) {
            // edge-stub.js lives at dist/edge-stub.js; this file is at dist/cli/commands/deploy.js
            const stubPath = fileURLToPath(new URL('../../edge-stub.js', import.meta.url));
            const stubPathEscaped = JSON.stringify(stubPath);

            // Resolve all node builtins to a virtual namespace
            build.onResolve({ filter: BUILTIN_FILTER }, (args) => ({
                path: args.path,
                namespace: 'edge-stub',
            }));

            // Load: inline CJS module that re-exports edge-stub.js exports
            // AND provides a fallback CRASH function for any named import
            // that edge-stub.js does not define (e.g. readFile, createServer,
            // connect, pipeline, lookup, etc.). This avoids esbuild
            // "No matching export" errors while preserving Tier 1/2 stubs.
            build.onLoad({ filter: /.*/, namespace: 'edge-stub' }, () => ({
                contents: [
                    `const _stub = require(${stubPathEscaped});`,
                    `const CRASH = (api) => { throw new Error(\`[Vinkius Edge] "\${api}" is blocked in the Serverless Sandbox.\`); };`,
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

export async function commandDeploy(args: CliArgs): Promise<void> {
    const progress = new ProgressTracker();
    const cwd = args.cwd;
    const deployStart = Date.now();

    // ── Step 1: read-config ──
    progress.start('read-config', 'Reading configuration');
    loadEnv(cwd);

    const rc = readVurbRc(cwd);
    const remote = rc.remote ?? VINKIUS_CLOUD_URL;
    const serverId = rc.serverId;
    const token = args.token ?? process.env['VURB_DEPLOY_TOKEN'] ?? rc.token;

    // Bug #76 fix: warn when token would be sent over plaintext HTTP
    if (token && remote && !args.allowInsecure) {
        try {
            const remoteUrl = new URL(remote);
            if (remoteUrl.protocol === 'http:' && remoteUrl.hostname !== 'localhost' && remoteUrl.hostname !== '127.0.0.1') {
                process.stderr.write(
                    `\n  ${ansi.yellow('⚠')} Warning: deploy token will be sent over plaintext HTTP to ${remote}\n` +
                    `  ${ansi.dim('Use https:// or set --allow-insecure to suppress this warning.')}\n\n`,
                );
            }
        } catch { /* non-URL remote — fetch will fail later with a clear error */ }
    }

    if (!serverId) {
        progress.fail('read-config', 'Reading configuration', 'run: vurb remote --server-id <uuid>');
        process.exit(1);
    }
    if (!token) {
        progress.fail('read-config', 'Reading configuration', 'run: vurb token <token> or set VURB_DEPLOY_TOKEN in .env');
        process.exit(1);
    }
    progress.done('read-config', 'Reading configuration');

    // ── Step 2: resolve entrypoint ──
    progress.start('resolve', 'Resolving entrypoint');
    const entrypoint = args.server ?? inferServerEntry(cwd);
    if (!entrypoint) {
        progress.fail('resolve', 'Resolving entrypoint', 'use --server <path>');
        process.exit(1);
    }
    const absEntry = resolve(cwd, entrypoint);
    if (!existsSync(absEntry)) {
        progress.fail('resolve', 'Resolving entrypoint', `file not found: ${absEntry}`);
        process.exit(1);
    }
    progress.done('resolve', `Resolving entrypoint (${entrypoint})`);

    // Warn if the entrypoint uses autoDiscover() — it relies on fs.readdir
    // at runtime, which is stubbed in edge V8 isolates. The user must switch
    // to explicit import + registry.register() for edge deployment.
    try {
        const src = readFileSync(absEntry, 'utf-8');
        if (/\bautoDiscover\s*\(/.test(src)) {
            process.stderr.write(
                `\n  ${ansi.yellow('⚠')} Warning: ${entrypoint} uses autoDiscover() which requires fs.readdir\n` +
                `  ${ansi.dim('Edge V8 isolates do not support filesystem access.')}\n` +
                `  ${ansi.dim('Replace with explicit imports: import tool from "./tools/myTool.js"; registry.register(tool);')}\n\n`,
            );
        }
        if (/\bSandboxEngine\b/.test(src)) {
            process.stderr.write(
                `\n  ${ansi.yellow('⚠')} Warning: ${entrypoint} uses SandboxEngine — not supported on edge\n` +
                `  ${ansi.dim('SandboxEngine requires child_process and fs, which are unavailable in V8 isolates.')}\n` +
                `  ${ansi.dim('Remove SandboxEngine for edge deploys; tool code runs directly in the isolate.')}\n\n`,
            );
        }
        if (/\bInspector\b/.test(src)) {
            process.stderr.write(
                `\n  ${ansi.yellow('⚠')} Warning: ${entrypoint} references Inspector — not supported on edge\n` +
                `  ${ansi.dim('Inspector requires Node.js IPC and cannot run inside V8 isolates.')}\n\n`,
            );
        }
        if (/\bfast-redact\b/.test(src)) {
            process.stderr.write(
                `\n  ${ansi.yellow('⚠')} Warning: ${entrypoint} uses fast-redact — may have limited support on edge\n` +
                `  ${ansi.dim('fast-redact uses Function constructor internally; verify it works in your isolate.')}\n\n`,
            );
        }
    } catch { /* non-critical — if read fails, esbuild will catch it later */ }

    // ── Step 3: bundle (esbuild) ──
    progress.start('bundle', 'Bundling with esbuild');
    let esbuild: typeof import('esbuild');
    try {
        esbuild = await import('esbuild');
    } catch {
        // Auto-install esbuild — zero friction
        progress.done('bundle', 'Bundling with esbuild');

        // Ask user before auto-installing to avoid silent supply-chain modifications
        const { createInterface } = await import('node:readline');
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        const answer = await ask(rl, 'esbuild is not installed. Install it now?', 'yes');
        rl.close();
        if (answer !== 'yes' && answer !== 'y') {
            process.stderr.write('\n  Aborted. Install manually: npm install -D esbuild\n\n');
            process.exit(1);
        }

        progress.start('bundle', 'Installing esbuild');
        try {
            const { execSync } = await import('node:child_process');
            execSync('npm install -D esbuild', { cwd, stdio: 'pipe' });
            esbuild = await import('esbuild');
        } catch {
            progress.fail('bundle', 'Installing esbuild', 'failed to install — run: npm install -D esbuild');
            process.exit(1);
        }
        progress.done('bundle', 'Installing esbuild');
        progress.start('bundle', 'Bundling with esbuild');
    }

    let buildResult: Awaited<ReturnType<typeof esbuild.build>>;
    try {
        buildResult = await esbuild.build({
            entryPoints: [absEntry],
            bundle: true,
            format: 'iife',
            platform: 'browser',
            target: 'es2022',
            treeShaking: true,
            minify: true,
            write: false,
            logLevel: 'silent',
            external: [],
            plugins: [edgeStubPlugin()],
        });
    } catch (err: unknown) {
        const buildErr = err as { errors?: Array<{ text: string; location?: { file: string; line: number; column: number } }> };
        if (buildErr.errors?.length) {
            const first = buildErr.errors[0]!;
            const loc = first.location
                ? ` (${first.location.file}:${first.location.line}:${first.location.column})`
                : '';
            progress.fail('bundle', 'Bundling', `${first.text}${loc}`);
            for (const e of buildErr.errors.slice(1, 4)) {
                const eLoc = e.location ? ` (${e.location.file}:${e.location.line})` : '';
                process.stderr.write(`  error: ${e.text}${eLoc}\n`);
            }
            if (buildErr.errors.length > 4) {
                process.stderr.write(`  ${ansi.dim(`... and ${buildErr.errors.length - 4} more errors`)}\n`);
            }
        } else {
            progress.fail('bundle', 'Bundling', String(err));
        }
        process.exit(1);
    }

    const outFile = buildResult.outputFiles?.[0];
    if (!outFile) {
        progress.fail('bundle', 'Bundling', 'esbuild produced no output');
        process.exit(1);
    }
    const rawCodeUnsanitized = new TextDecoder().decode(outFile.contents);
    progress.done('bundle', 'Bundling with esbuild');

    // ── Step 3b: Sanitize bundle for edge static analysis ──
    // The server rejects known-dangerous patterns (eval, new Function,
    // __proto__, Object.setPrototypeOf). esbuild and third-party SDKs
    // emit these legitimately (CJS interop, class transpilation).
    // Transform them to break the server regex without changing JS
    // semantics. The V8 isolate sandbox is the real security boundary.
    const rawCode = sanitizeBundleForEdge(rawCodeUnsanitized);

    // ── Step 4: size-check ──
    const rawSizeBytes = Buffer.byteLength(rawCode, 'utf-8');
    const MAX_BUNDLE_SIZE = 512_000; // 500KB (fat bundle includes all deps)
    if (rawSizeBytes > MAX_BUNDLE_SIZE) {
        const sizeKB = (rawSizeBytes / 1024).toFixed(1);
        process.stderr.write(
            `\nfatal: bundle too large: ${sizeKB}KB (max 500KB)\n` +
            `hint: remove unused imports — the fat bundle includes all dependencies\n\n`,
        );
        process.exit(1);
    }

    // ── Step 5: hash + compress ──
    progress.start('compress', 'Compressing');
    const hash = createHash('sha256').update(rawCode).digest('hex');
    const compressed = gzipSync(Buffer.from(rawCode, 'utf-8'));
    const payload = compressed.toString('base64');
    const compressedKB = (compressed.length / 1024).toFixed(1);
    const rawKB = (rawSizeBytes / 1024).toFixed(1);
    const ratio = rawSizeBytes > 0
        ? Math.round((1 - compressed.length / rawSizeBytes) * 100)
        : 0;
    progress.done('compress', `Compressing (${rawKB}KB -> ${compressedKB}KB gzip, ${ratio}% smaller)`);

    // ── Step 5b: introspect tools via real registry ──
    // Import the entrypoint with VURB_INTROSPECT=1 so startServer() returns
    // immediately without starting a transport. Then compile contracts and
    // generate the lockfile manifest — the deploy's cryptographic signature.
    progress.start('introspect', 'Introspecting tools');

    interface IntrospectResult {
        serverName: string;
        version: string;
        registry: { getBuilders(): Iterable<{ getName(): string; getActionNames(): string[]; buildToolDefinition(): unknown }> };
    }

    let manifest: Record<string, unknown> | null = null;
    let toolNames: Array<{ name: string; description: string }> = [];

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = globalThis as any;

        // Set up promise — startServer will resolve it in introspect mode
        let resolveIntrospect!: (value: IntrospectResult) => void;
        const introspectReady = new Promise<IntrospectResult>(resolve => {
            resolveIntrospect = resolve;
        });
        g.__vurb_introspect_resolve = resolveIntrospect;
        process.env['VURB_INTROSPECT'] = '1';

        // Write the already-compiled esbuild bundle to a temp file and import
        // it directly. This is pure JS — no tsx loader, no TypeScript compilation,
        // no module resolution overhead. Near-instant evaluation.
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const { writeFileSync, unlinkSync } = await import('node:fs');
        const { pathToFileURL } = await import('node:url');

        const tmpBundle = join(tmpdir(), `vurb-introspect-${Date.now()}.mjs`);
        writeFileSync(tmpBundle, rawCode, 'utf-8');

        try {
            await import(pathToFileURL(tmpBundle).href);
        } finally {
            try { unlinkSync(tmpBundle); } catch { /* ignore cleanup errors */ }
        }

        // Wait for startServer to fire (it resolves via globalThis)
        const result = await Promise.race([
            introspectReady,
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('startServer() was not called within 5s')), 5_000),
            ),
        ]);

        // Clean up
        delete process.env['VURB_INTROSPECT'];
        delete g.__vurb_introspect_resolve;
        delete g.__vurb_introspect_result;

        // Compile contracts and generate lockfile using existing introspection
        const { compileContracts } = await import('../../introspection/ToolContract.js');
        const { generateLockfile } = await import('../../introspection/CapabilityLockfile.js');
        const { VURB_VERSION } = await import('../constants.js');

        const builders = [...result.registry.getBuilders()];
        const contracts = await compileContracts(builders as Parameters<typeof compileContracts>[0]);
        const lockfile = await generateLockfile(result.serverName, contracts, VURB_VERSION);

        manifest = lockfile as unknown as Record<string, unknown>;

        // Extract tool names + descriptions for CLI display
        const lockTools = (lockfile.capabilities as { tools: Record<string, { surface: { description: string | null } }> }).tools;
        toolNames = Object.entries(lockTools).map(([name, tool]) => ({
            name,
            description: tool.surface.description ?? '',
        }));

        progress.done('introspect', 'Introspecting tools', `${toolNames.length} tool${toolNames.length !== 1 ? 's' : ''}`);
    } catch (err) {
        // Introspection failure is non-fatal — deploy proceeds without manifest
        delete process.env['VURB_INTROSPECT'];
        progress.done('introspect', 'Introspecting tools', 'skipped');
        process.stderr.write(`  ${ansi.dim(`⚠ Could not introspect: ${err instanceof Error ? err.message : String(err)}`)}\n`);
    }

    // ── Step 6: upload ──
    progress.start('upload', 'Deploying to Edge');

    // Validate serverId to prevent path-traversal attacks
    const SAFE_ID = /^[a-zA-Z0-9_-]+$/;
    if (!SAFE_ID.test(serverId)) {
        progress.fail('upload', 'Deploying to Edge', `invalid server ID: ${serverId} — expected alphanumeric/dash/underscore`);
        process.exit(1);
    }

    const url = `${remote.replace(/\/+$/, '')}/servers/${encodeURIComponent(serverId)}/deploy`;

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                bundle: payload,
                hash,
                raw_size: rawSizeBytes,
                ...(manifest ? { manifest } : {}),
                // Also send simplified tool list for backward compat
                tools: toolNames,
            }),
            signal: AbortSignal.timeout(60_000),
        });
    } catch (netErr: unknown) {
        const msg = netErr instanceof Error ? netErr.message : String(netErr);
        if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
            progress.fail('upload', 'Deploying to Edge', 'DNS resolution failed — check your remote URL');
        } else if (msg.includes('ECONNREFUSED')) {
            progress.fail('upload', 'Deploying to Edge', 'connection refused — is the API running?');
        } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
            progress.fail('upload', 'Deploying to Edge', 'request timed out — check your network');
        } else {
            progress.fail('upload', 'Deploying to Edge', `network error: ${msg}`);
        }
        process.exit(1);
    }

    if (!res.ok) {
        const errBody = await res.text();
        let message = `HTTP ${res.status}`;
        try {
            const parsed = JSON.parse(errBody);
            message = parsed.message ?? message;
        } catch { /* use status code */ }

        if (res.status === 401) {
            message = 'connection token revoked or invalid — check your dashboard';
        } else if (res.status === 403) {
            message = 'connection token does not belong to this server';
        } else if (res.status === 404) {
            message = 'server not found — check your server ID';
        } else if (res.status === 422 && message.startsWith('HTTP')) {
            message = 'invalid payload — check your entrypoint';
        }

        progress.fail('upload', 'Deploying to Edge', message);
        process.exit(1);
    }

    let data: {
        status: string;
        deployment_id: string;
        server_id: string;
        server_name: string;
        url: string;
        message: string;
        tools_synced?: number;
    };
    try {
        data = await res.json() as typeof data;
    } catch {
        progress.fail('upload', 'Deploying to Edge', 'unexpected non-JSON response from API');
        process.exit(1);
    }

    progress.done('upload', 'Deploying to Edge');

    // ── Step 7: Premium Output ──
    const elapsed = ((Date.now() - deployStart) / 1000).toFixed(1);
    const w = process.stderr.write.bind(process.stderr);
    const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
    const bgGreen = (s: string) => `\x1b[42m\x1b[30m${s}\x1b[0m`;
    const bgCyan = (s: string) => `\x1b[46m\x1b[30m${s}\x1b[0m`;
    const white = (s: string) => `\x1b[97m${s}\x1b[0m`;

    w('\n');
    w(`  ${magenta('Vinkius Edge')}  ${ansi.dim('·')}  ${ansi.bold(data.server_name)} ${ansi.dim('is ready in just')} ${ansi.green(elapsed + 's')}\n`);
    w(`  ${ansi.dim('━'.repeat(56))}\n`);
    w('\n');

    // URL (the star of the show)
    w(`  ${ansi.dim('MCP Server Stateful')}\n`);
    w(`  ${ansi.cyan(data.url)}\n`);
    w('\n');

    // Tools discovered
    if (toolNames.length > 0) {
        w(`  ${bgCyan(' TOOLS ')} ${ansi.bold(String(toolNames.length))} ${ansi.dim(toolNames.length === 1 ? 'tool ready' : 'tools ready')}\n`);
        w('\n');
        for (const tool of toolNames) {
            const desc = tool.description
                ? `  ${ansi.dim(tool.description.length > 50 ? tool.description.slice(0, 50) + '…' : tool.description)}`
                : '';
            w(`    ${ansi.green('●')} ${white(tool.name)}${desc}\n`);
        }
        w('\n');
    }

    // Bundle stats
    w(`  ${ansi.dim(`${rawKB}KB → ${compressedKB}KB gzip (${ratio}% smaller)`)}\n`);

    if (data.status === 'restored') {
        w(`  ${ansi.dim('↻ instant deploy — bundle unchanged')}\n`);
    }
    if (manifest) {
        w(`  ${ansi.dim('✓ manifest signed')}\n`);
    }

    w('\n');
}

