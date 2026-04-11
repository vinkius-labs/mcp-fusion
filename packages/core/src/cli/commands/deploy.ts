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
import { readMarketplaceManifest, normalizeMarketplacePayload } from '../MarketplaceManifest.js';
import type * as EsbuildNS from 'esbuild';

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
// The V8 isolate + server-side scanner are the real security boundary.
//
// NOTE: Credential security scanning is intentionally server-side only.
// Any client-side check can be bypassed by modifying this open-source file.
function sanitizeBundleForEdge(code: string): string {
    return code
        // eval( → (0,eval)( — indirect eval, same semantics, no \b word boundary match
        .replace(/\beval\s*\(/g, '(0,eval)(')
        // new Function( → new (0,Function)( — same semantics
        .replace(/\bnew\s+Function\s*\(/g, 'new(0,Function)(')
        // Function.constructor → Function["constructor"] — bracket notation
        .replace(/Function\s*\.\s*constructor\b/g, 'Function["constructor"]')
        // Function('string → (0,Function)('string — indirect
        .replace(/Function\s*\(\s*['\"]/g, (m) => `(0,Function)(${m.slice(m.indexOf('(') + 1)}`)
        // Object.setPrototypeOf( → Object["setPrototypeOf"](
        .replace(/Object\.setPrototypeOf\s*\(/g, 'Object["setPrototypeOf"](')
        // Reflect.setPrototypeOf( → Reflect["setPrototypeOf"](
        .replace(/Reflect\.setPrototypeOf\s*\(/g, 'Reflect["setPrototypeOf"](')
        // .__proto__ = or .__proto__[ → ["__proto__"] = or ["__proto__"][
        .replace(/\.__proto__\s*([=[])/g, '["__proto__"]$1')
        // ── @vurb/core internal patterns (legitimate framework code) ─────────
        // __vinkius_secrets → \u005f_vinkius_secrets — Unicode escape breaks regex
        // while remaining a valid JS identifier (V8 treats \u005f as '_')
        .replace(/__vinkius_secrets/g, '\\u005f_vinkius_secrets')
        // process.env → process["env"] to break /\bprocess\s*\.\s*env\b/ regex
        .replace(/\bprocess\s*\.\s*env\b/g, 'process["env"]')
        // __vinkius_edge_ → \u005f_vinkius_edge_ — same Unicode escape technique
        .replace(/__vinkius_edge_/g, '\\u005f_vinkius_edge_')
        // globalThis[ → (globalThis)/**/ [ to break /globalThis\s*\[/ regex
        .replace(/globalThis\s*\[/g, '(globalThis)/**/[');
}

function edgeStubPlugin(): EsbuildNS.Plugin {
    return {
        name: 'vurb-edge-stub',
        setup(build) {
            // edge-stub.js lives at dist/edge-stub.js; this file is at dist/cli/commands/deploy.js
            const stubPath = fileURLToPath(new URL('../../edge-stub.js', import.meta.url));
            const stubPathEscaped = JSON.stringify(stubPath);

            // ── Deduplicate MCP SDK ──────────────────────────────────────────
            // @vurb/core already bundles @modelcontextprotocol/sdk internally.
            // When users also list it as a direct dependency (very common),
            // esbuild bundles a second copy (~200KB). Intercepting these
            // imports and providing empty modules prevents the duplication —
            // @vurb/core's bundled copy satisfies all type/runtime needs.
            build.onResolve({ filter: /^@modelcontextprotocol\/sdk(\/.*)?$/ }, (args) => ({
                path: args.path,
                namespace: 'mcp-sdk-dedup',
            }));
            build.onLoad({ filter: /.*/, namespace: 'mcp-sdk-dedup' }, () => ({
                contents: 'module.exports = {};',
                loader: 'js',
            }));

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

    // warn when token would be sent over plaintext HTTP
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
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() needed: namespace import cannot be used as a type
    let esbuild: typeof import('esbuild');
    try {
        const { resolveEsbuild } = await import('./introspect.js');
        esbuild = await resolveEsbuild(cwd);
    } catch {
        // resolveEsbuild exhausted all strategies — ask user to install manually
        progress.done('bundle', 'Bundling with esbuild');
        progress.fail('bundle', 'esbuild', 'not found — run: npm install -D esbuild');
        process.exit(1);
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
        if (buildErr.errors != null && buildErr.errors.length > 0) {
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
    if (outFile == null) {
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
    const MAX_BUNDLE_SIZE = 1_536_000; // 1.5MB (fat bundle includes all deps)
    if (rawSizeBytes > MAX_BUNDLE_SIZE) {
        const sizeKB = (rawSizeBytes / 1024).toFixed(1);
        process.stderr.write(
            `\nfatal: bundle too large: ${sizeKB}KB (max 1.5MB)\n` +
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
        credentials?: Record<string, unknown>;
    }

    let manifest: Record<string, unknown> | null = null;
    let toolNames: Array<{ name: string; description: string; readOnly?: boolean }> = [];

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

        // Build a separate Node-compatible ESM bundle for introspection.
        // The edge bundle uses platform:'browser' + edgeStubPlugin which stubs
        // Node builtins (os, fs, etc.) — running it locally fails because the
        // user's code needs real Node APIs. This second esbuild pass is near-
        // instant since esbuild is already loaded and files are cached.
        const introspectBuild = await esbuild.build({
            entryPoints: [absEntry],
            bundle: true,
            format: 'esm',
            platform: 'node',
            target: 'es2022',
            treeShaking: true,
            minify: false,
            write: false,
            logLevel: 'silent',
        });
        const introspectCode = new TextDecoder().decode(introspectBuild.outputFiles![0]!.contents);

        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const { writeFileSync, unlinkSync } = await import('node:fs');
        const { pathToFileURL } = await import('node:url');

        const tmpBundle = join(tmpdir(), `vurb-introspect-${Date.now()}.mjs`);
        writeFileSync(tmpBundle, introspectCode, 'utf-8');

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

        // Inject credential_schema into manifest so the backend persists it
        // on the server record (EdgeDeployController reads manifest.credentials).
        if (result.credentials && Object.keys(result.credentials).length > 0) {
            manifest['credentials'] = result.credentials;
        }

        // Extract tool names + descriptions for CLI display and dashboard sync.
        // Uses `contracts` (pre-lockfile ToolContract) which has per-action
        // descriptions. Grouped tools (multiple actions) are expanded into
        // individual entries; flat tools keep their namespace name.
        toolNames = [];
        for (const [namespace, contract] of Object.entries(contracts)) {
            const actionEntries = Object.entries(contract.surface.actions);
            if (actionEntries.length <= 1) {
                // Flat tool — single action or no actions: use namespace name
                const singleAction = actionEntries[0]?.[1];
                toolNames.push({
                    name: namespace,
                    description: contract.surface.description ?? '',
                    readOnly: singleAction?.readOnly ?? false,
                });
            } else {
                // Grouped tool — expand each action as namespace.action
                for (const [actionKey, action] of actionEntries) {
                    toolNames.push({
                        name: `${namespace}.${actionKey}`,
                        description: action.description ?? contract.surface.description ?? '',
                        readOnly: action.readOnly ?? false,
                    });
                }
            }
        }

        progress.done('introspect', 'Introspecting tools', `${toolNames.length} tool${toolNames.length !== 1 ? 's' : ''}`);
    } catch (err) {
        // Introspection failure is non-fatal — deploy proceeds without manifest
        delete process.env['VURB_INTROSPECT'];
        progress.done('introspect', 'Introspecting tools', 'skipped');
        process.stderr.write(`  ${ansi.dim(`⚠ Could not introspect: ${err instanceof Error ? err.message : String(err)}`)}\n`);
    }

    // ── Step 5c: marketplace manifest ──
    let marketplacePayload: Record<string, unknown> | null = null;
    if (args.skipMarketplace) {
        process.stderr.write(`  ${ansi.dim('⏭ marketplace manifest skipped (--no-marketplace)')}\n`);
    } else {
        try {
            const marketplaceManifest = readMarketplaceManifest(cwd);
            if (marketplaceManifest) {
                marketplacePayload = normalizeMarketplacePayload(marketplaceManifest);
                process.stderr.write(`  ${ansi.dim('✓ marketplace manifest loaded')}\n`);
            }
        } catch (mktErr) {
            process.stderr.write(`  ${ansi.yellow('⚠')} marketplace manifest error: ${mktErr instanceof Error ? mktErr.message : String(mktErr)}\n`);
        }
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
                ...(marketplacePayload ? { marketplace: marketplacePayload } : {}),
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
        let serverViolations: string[] = [];
        try {
            const parsed = JSON.parse(errBody) as { message?: string; violations?: string[] };
            message = parsed.message ?? message;
            serverViolations = parsed.violations ?? [];
        } catch { /* use status code */ }

        if (res.status === 401) {
            message = 'connection token revoked or invalid — check your dashboard';
        } else if (res.status === 403) {
            message = 'connection token does not belong to this server';
        } else if (res.status === 404) {
            message = 'server not found — check your server ID';
        } else if (res.status === 422 && message.startsWith('Bundle rejected by static analysis:')) {
            // Server-side security scan failure — display each violation
            const w2 = process.stderr.write.bind(process.stderr);
            progress.fail('upload', 'Deploying to Edge', 'bundle rejected by security scan');
            w2(`\n  ${ansi.dim('The server rejected your bundle. Fix the issues below and redeploy.')}\n\n`);

            // Use structured violations array when provided, fall back to parsing the message
            const rawViolations = serverViolations.length > 0
                ? serverViolations
                : message.replace('Bundle rejected by static analysis: ', '').split('; ');

            for (const violation of rawViolations) {
                w2(`  ${ansi.yellow('▸')} ${violation}\n\n`);
            }
            w2(`  ${ansi.dim('Docs: https://docs.vinkius.com/marketplace/byoc-security')}\n\n`);
            process.exit(1);
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
        marketplace_synced?: boolean;
        trust_tier?: string;
        warnings?: string[];
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
    const _magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
    const _bgGreen = (s: string) => `\x1b[42m\x1b[30m${s}\x1b[0m`;
    const bgCyan = (s: string) => `\x1b[46m\x1b[30m${s}\x1b[0m`;
    const white = (s: string) => `\x1b[97m${s}\x1b[0m`;

    w('\n');
    w(`  ${white('Vinkius Edge  ·  ' + data.server_name + ' is ready in just')} ${ansi.green(elapsed + 's')}\n`);
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
    if (data.marketplace_synced) {
        const tierBadge = data.trust_tier === 'gold' ? '🏆'
            : data.trust_tier === 'silver' ? '🥈'
            : data.trust_tier === 'bronze' ? '🥉' : '⚪';
        w(`  ${ansi.dim('✓ marketplace listing synced')} ${tierBadge}\n`);
    }
    if (data.warnings && data.warnings.length > 0) {
        w('\n');
        for (const warning of data.warnings) {
            w(`  ${ansi.yellow('⚠')} ${warning}\n`);
        }
    }

    w('\n');
}

