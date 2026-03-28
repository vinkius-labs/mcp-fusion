/**
 * Shared introspection pipeline — boot server + compile contracts.
 *
 * Extracted from `deploy.ts` so both `deploy` and `validate` can reuse
 * the same introspection logic without duplication.
 *
 * @module
 */

// ─── Types ───────────────────────────────────────────────────────

export interface ToolEntry {
    name: string;
    description: string;
}

export interface IntrospectResult {
    serverName: string;
    version: string;
    registry: {
        getBuilders(): Iterable<{
            getName(): string;
            getActionNames(): string[];
            buildToolDefinition(): unknown;
        }>;
    };
}

export interface IntrospectionReport {
    serverName: string;
    version: string;
    tools: ToolEntry[];
    contracts: Record<string, unknown>;
    lockfile: Record<string, unknown>;
    bootTimeMs: number;
    buildTimeMs: number;
}

// ─── esbuild Resolution ─────────────────────────────────────────

/**
 * Resolve esbuild from multiple sources, in priority order:
 *
 * 1. Direct ESM `import('esbuild')` — works if esbuild is a direct or hoisted dep.
 * 2. CJS `createRequire(projectRoot)('esbuild')` — bypasses ESM resolution cache.
 * 3. Transitive discovery — find esbuild nested inside tsx, vite, or vitest.
 * 4. Auto-install fallback — `npm install -D esbuild --legacy-peer-deps`.
 */
export async function resolveEsbuild(projectRoot: string): Promise<typeof import('esbuild')> {
    // Strategy 1: standard ESM import
    try {
        return await import('esbuild');
    } catch { /* not directly available — try alternatives */ }

    const { createRequire } = await import('node:module');
    const { join } = await import('node:path');
    const projectRequire = createRequire(join(projectRoot, 'package.json'));

    // Strategy 2: CJS require from project root (bypasses ESM cache)
    try {
        return projectRequire('esbuild');
    } catch { /* not a direct dep — try transitive */ }

    // Strategy 3: discover esbuild nested inside common transitive hosts
    const hosts = ['tsx', 'vite', 'vitest'];
    for (const host of hosts) {
        try {
            const hostPath = projectRequire.resolve(host);
            const hostRequire = createRequire(hostPath);
            return hostRequire('esbuild');
        } catch { /* host not installed or esbuild not nested there */ }
    }

    // Strategy 4: auto-install as last resort
    const { execSync } = await import('node:child_process');
    try {
        execSync('npm install -D esbuild --legacy-peer-deps', { cwd: projectRoot, stdio: 'pipe' });
        return projectRequire('esbuild');
    } catch { /* install failed */ }

    throw new Error(
        'esbuild is required but could not be resolved. Run: npm install -D esbuild',
    );
}

// ─── Pipeline ────────────────────────────────────────────────────

/**
 * Boot the server via `VURB_INTROSPECT=1`, compile contracts, and
 * generate the lockfile manifest.
 *
 * @param absEntry - Absolute path to the server entrypoint.
 * @param projectRoot - Absolute path to the project root (where package.json lives).
 * @returns Full introspection report including tools, contracts, lockfile.
 * @throws If esbuild build fails, server doesn't boot, or contracts fail to compile.
 */
export async function runIntrospection(absEntry: string, projectRoot?: string): Promise<IntrospectionReport> {
    const esbuild = await resolveEsbuild(projectRoot ?? (await import('node:path')).dirname(absEntry));

    // ── 1. Build (Node platform, ESM — for local execution, not edge) ──
    const buildStart = Date.now();
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
    const buildTimeMs = Date.now() - buildStart;
    const introspectCode = new TextDecoder().decode(introspectBuild.outputFiles![0]!.contents);

    // ── 2. Boot server in introspect mode ──
    const bootStart = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;

    let resolveIntrospect!: (value: IntrospectResult) => void;
    const introspectReady = new Promise<IntrospectResult>(resolve => {
        resolveIntrospect = resolve;
    });
    g.__vurb_introspect_resolve = resolveIntrospect;
    process.env['VURB_INTROSPECT'] = '1';

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

    const bootTimeMs = Date.now() - bootStart;

    // Clean up
    delete process.env['VURB_INTROSPECT'];
    delete g.__vurb_introspect_resolve;
    delete g.__vurb_introspect_result;

    // ── 3. Compile contracts + generate lockfile ──
    const { compileContracts } = await import('../../introspection/ToolContract.js');
    const { generateLockfile } = await import('../../introspection/CapabilityLockfile.js');
    const { VURB_VERSION } = await import('../constants.js');

    const builders = [...result.registry.getBuilders()];
    const contracts = await compileContracts(builders as Parameters<typeof compileContracts>[0]);
    const lockfile = await generateLockfile(result.serverName, contracts, VURB_VERSION);

    // ── 4. Extract tool names ──
    const tools: ToolEntry[] = [];
    for (const [namespace, contract] of Object.entries(contracts)) {
        const c = contract as { surface: { actions: Record<string, { description?: string }>; description?: string } };
        const actionEntries = Object.entries(c.surface.actions);
        if (actionEntries.length <= 1) {
            tools.push({
                name: namespace,
                description: c.surface.description ?? '',
            });
        } else {
            for (const [actionKey, action] of actionEntries) {
                tools.push({
                    name: `${namespace}.${actionKey}`,
                    description: action.description ?? c.surface.description ?? '',
                });
            }
        }
    }

    return {
        serverName: result.serverName,
        version: result.version,
        tools,
        contracts: contracts as unknown as Record<string, unknown>,
        lockfile: lockfile as unknown as Record<string, unknown>,
        bootTimeMs,
        buildTimeMs,
    };
}
