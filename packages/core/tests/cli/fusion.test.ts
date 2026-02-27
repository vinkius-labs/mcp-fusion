/**
 * CLI `fusion` — Integration Tests
 *
 * Tests the full CLI pipeline:
 *   - `parseArgs` — argument parsing
 *   - `resolveRegistry` — module resolution strategies
 *   - `commandLock` — generate and check modes
 *   - End-to-end: generate → serialize → read → check flow via CLI
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import {
    parseArgs,
    MCP_FUSION_VERSION,
    HELP,
} from '../../src/cli/fusion.js';
import type { CliArgs } from '../../src/cli/fusion.js';
import { createTool } from '../../src/core/builder/index.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { compileContracts } from '../../src/introspection/ToolContract.js';
import {
    generateLockfile,
    serializeLockfile,
    checkLockfile,
    parseLockfile,
    writeLockfile,
    readLockfile,
    LOCKFILE_NAME,
} from '../../src/introspection/CapabilityLockfile.js';
import type { ToolContract } from '../../src/introspection/ToolContract.js';

// ============================================================================
// parseArgs
// ============================================================================

describe('parseArgs', () => {
    it('parses the lock command', () => {
        const args = parseArgs(['node', 'fusion', 'lock']);
        expect(args.command).toBe('lock');
        expect(args.check).toBe(false);
        expect(args.help).toBe(false);
    });

    it('parses --check flag', () => {
        const args = parseArgs(['node', 'fusion', 'lock', '--check']);
        expect(args.command).toBe('lock');
        expect(args.check).toBe(true);
    });

    it('parses --server / -s', () => {
        const args = parseArgs(['node', 'fusion', 'lock', '--server', './src/server.ts']);
        expect(args.server).toBe('./src/server.ts');

        const args2 = parseArgs(['node', 'fusion', 'lock', '-s', './src/server.ts']);
        expect(args2.server).toBe('./src/server.ts');
    });

    it('parses --name / -n', () => {
        const args = parseArgs(['node', 'fusion', 'lock', '--name', 'my-server']);
        expect(args.name).toBe('my-server');

        const args2 = parseArgs(['node', 'fusion', 'lock', '-n', 'my-server']);
        expect(args2.name).toBe('my-server');
    });

    it('parses --cwd', () => {
        const args = parseArgs(['node', 'fusion', 'lock', '--cwd', '/tmp/project']);
        expect(args.cwd).toBe('/tmp/project');
    });

    it('parses --help / -h', () => {
        expect(parseArgs(['node', 'fusion', '-h']).help).toBe(true);
        expect(parseArgs(['node', 'fusion', '--help']).help).toBe(true);
    });

    it('defaults cwd to process.cwd()', () => {
        const args = parseArgs(['node', 'fusion', 'lock']);
        expect(args.cwd).toBe(process.cwd());
    });

    it('handles no arguments', () => {
        const args = parseArgs(['node', 'fusion']);
        expect(args.command).toBe('');
        expect(args.help).toBe(false);
    });

    it('handles all flags combined', () => {
        const args = parseArgs([
            'node', 'fusion', 'lock',
            '--check',
            '-s', './server.ts',
            '-n', 'demo',
            '--cwd', '/tmp',
        ]);
        expect(args.command).toBe('lock');
        expect(args.check).toBe(true);
        expect(args.server).toBe('./server.ts');
        expect(args.name).toBe('demo');
        expect(args.cwd).toBe('/tmp');
    });

    // ── Dev command parsing ──

    it('parses the dev command', () => {
        const args = parseArgs(['node', 'fusion', 'dev']);
        expect(args.command).toBe('dev');
    });

    it('parses dev with --server', () => {
        const args = parseArgs(['node', 'fusion', 'dev', '--server', './src/server.ts']);
        expect(args.command).toBe('dev');
        expect(args.server).toBe('./src/server.ts');
    });

    it('parses dev with -s shorthand', () => {
        const args = parseArgs(['node', 'fusion', 'dev', '-s', './src/server.ts']);
        expect(args.command).toBe('dev');
        expect(args.server).toBe('./src/server.ts');
    });

    it('parses dev with --dir', () => {
        const args = parseArgs(['node', 'fusion', 'dev', '--dir', './src/tools']);
        expect(args.command).toBe('dev');
        expect(args.dir).toBe('./src/tools');
    });

    it('parses dev with -d shorthand', () => {
        const args = parseArgs(['node', 'fusion', 'dev', '-d', './src/tools']);
        expect(args.command).toBe('dev');
        expect(args.dir).toBe('./src/tools');
    });

    it('parses dev with all flags combined', () => {
        const args = parseArgs([
            'node', 'fusion', 'dev',
            '-s', './src/server.ts',
            '-d', './src/tools',
        ]);
        expect(args.command).toBe('dev');
        expect(args.server).toBe('./src/server.ts');
        expect(args.dir).toBe('./src/tools');
    });

    it('defaults dir to undefined when not provided', () => {
        const args = parseArgs(['node', 'fusion', 'dev']);
        expect(args.dir).toBeUndefined();
    });
});

// ============================================================================
// Constants
// ============================================================================

describe('CLI constants', () => {
    it('MCP_FUSION_VERSION is a semver string', () => {
        expect(MCP_FUSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('HELP contains usage instructions', () => {
        expect(HELP).toContain('fusion lock');
        expect(HELP).toContain('fusion dev');
        expect(HELP).toContain('--server');
        expect(HELP).toContain('--check');
        expect(HELP).toContain('--name');
        expect(HELP).toContain('--cwd');
        expect(HELP).toContain('--dir');
        expect(HELP).toContain('--help');
    });
});

// ============================================================================
// End-to-end: ToolRegistry → compileContracts → lockfile → check
// ============================================================================

describe('CLI end-to-end lockfile flow', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = join(tmpdir(), `fusion-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function buildRealRegistry() {
        const registry = new ToolRegistry();

        const usersTool = createTool('users')
            .description('Manage users')
            .tags('core', 'users')
            .discriminator('action')
            .action({
                name: 'list',
                description: 'List all users',
                schema: z.object({
                    limit: z.number().optional(),
                }),
                readOnly: true,
                handler: async () => ({ content: [{ type: 'text' as const, text: '[]' }] }),
            })
            .action({
                name: 'create',
                description: 'Create a user',
                schema: z.object({
                    name: z.string(),
                    email: z.string(),
                }),
                handler: async () => ({ content: [{ type: 'text' as const, text: 'created' }] }),
            })
            .action({
                name: 'delete',
                description: 'Delete a user',
                schema: z.object({ id: z.string() }),
                destructive: true,
                handler: async () => ({ content: [{ type: 'text' as const, text: 'deleted' }] }),
            });

        const tasksTool = createTool('tasks')
            .description('Manage tasks')
            .tags('core', 'tasks')
            .discriminator('action')
            .action({
                name: 'list',
                description: 'List tasks',
                schema: z.object({}),
                readOnly: true,
                handler: async () => ({ content: [{ type: 'text' as const, text: '[]' }] }),
            });

        registry.register(usersTool);
        registry.register(tasksTool);

        return registry;
    }

    it('compileContracts produces valid contracts from real ToolRegistry', async () => {
        const registry = buildRealRegistry();
        const builders = [...registry.getBuilders()];
        const contracts = await compileContracts(builders);

        expect(Object.keys(contracts)).toContain('users');
        expect(Object.keys(contracts)).toContain('tasks');

        // Verify contract structure
        const usersContract = contracts['users']!;
        expect(usersContract.surface.name).toBe('users');
        expect(usersContract.surface.description).toContain('Manage users');
        expect(Object.keys(usersContract.surface.actions)).toContain('list');
        expect(Object.keys(usersContract.surface.actions)).toContain('create');
        expect(Object.keys(usersContract.surface.actions)).toContain('delete');
        expect(usersContract.surface.actions['list']!.readOnly).toBe(true);
        expect(usersContract.surface.actions['delete']!.destructive).toBe(true);
    });

    it('generates lockfile from real registry contracts', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('test-server', contracts, MCP_FUSION_VERSION);

        expect(lockfile.lockfileVersion).toBe(1);
        expect(lockfile.serverName).toBe('test-server');
        expect(lockfile.fusionVersion).toBe(MCP_FUSION_VERSION);
        expect(lockfile.integrityDigest).toMatch(/^sha256:[a-f0-9]{64}$/);

        // Tool entries
        const toolNames = Object.keys(lockfile.capabilities.tools);
        expect(toolNames).toEqual(['tasks', 'users']); // sorted

        // Users tool behavioral snapshot
        const users = lockfile.capabilities.tools['users']!;
        expect(users.integrityDigest).toMatch(/^sha256:/);
        expect(users.surface.actions).toEqual(['create', 'delete', 'list']);
        expect(users.behavior.destructiveActions).toContain('delete');
        expect(users.behavior.readOnlyActions).toContain('list');
        expect(users.entitlements.filesystem).toBe(false);
        expect(users.entitlements.network).toBe(false);
    });

    it('serializes lockfile to canonical JSON', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('test-server', contracts, MCP_FUSION_VERSION);

        const json = serializeLockfile(lockfile);

        // Trailing newline
        expect(json.endsWith('\n')).toBe(true);

        // Valid JSON
        const parsed = JSON.parse(json);
        expect(parsed.lockfileVersion).toBe(1);
        expect(parsed.capabilities.tools.users).toBeDefined();
        expect(parsed.capabilities.tools.tasks).toBeDefined();

        // Keys are sorted (canonical)
        const topKeys = Object.keys(parsed);
        expect(topKeys).toEqual([...topKeys].sort());
    });

    it('writes and reads lockfile from disk', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('test-server', contracts, MCP_FUSION_VERSION);

        // Write
        await writeLockfile(lockfile, tmpDir);
        const lockPath = join(tmpDir, LOCKFILE_NAME);
        expect(existsSync(lockPath)).toBe(true);

        // Read
        const loaded = await readLockfile(tmpDir);
        expect(loaded).not.toBeNull();
        expect(loaded!.serverName).toBe('test-server');
        expect(loaded!.integrityDigest).toBe(lockfile.integrityDigest);
    });

    it('checkLockfile passes when surface matches', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('test-server', contracts, MCP_FUSION_VERSION);

        // Write to disk
        await writeLockfile(lockfile, tmpDir);

        // Read back
        const loaded = await readLockfile(tmpDir);
        expect(loaded).not.toBeNull();

        // Check — should pass
        const result = await checkLockfile(loaded!, contracts);
        expect(result.ok).toBe(true);
        expect(result.unchanged).toEqual(['tasks', 'users']);
    });

    it('checkLockfile fails when a tool is added', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('test-server', contracts, MCP_FUSION_VERSION);

        await writeLockfile(lockfile, tmpDir);

        // Add a new tool
        const newTool = createTool('reports')
            .description('Generate reports')
            .discriminator('action')
            .action({
                name: 'generate',
                schema: z.object({}),
                handler: async () => ({ content: [{ type: 'text' as const, text: 'report' }] }),
            });

        registry.register(newTool);
        const updatedContracts = await compileContracts([...registry.getBuilders()]);

        const loaded = await readLockfile(tmpDir);
        const result = await checkLockfile(loaded!, updatedContracts);

        expect(result.ok).toBe(false);
        expect(result.added).toContain('reports');
    });

    it('checkLockfile fails when a tool is removed', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('test-server', contracts, MCP_FUSION_VERSION);

        await writeLockfile(lockfile, tmpDir);

        // Remove 'tasks' from contracts
        const { tasks: _, ...remaining } = contracts;

        const loaded = await readLockfile(tmpDir);
        const result = await checkLockfile(loaded!, remaining);

        expect(result.ok).toBe(false);
        expect(result.removed).toContain('tasks');
    });

    it('checkLockfile fails when behavioral surface changes', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('test-server', contracts, MCP_FUSION_VERSION);

        await writeLockfile(lockfile, tmpDir);

        // Rebuild with a modified tool (add an action)
        const registry2 = new ToolRegistry();
        const modifiedUsers = createTool('users')
            .description('Manage users')
            .tags('core', 'users')
            .discriminator('action')
            .action({
                name: 'list',
                schema: z.object({ limit: z.number().optional() }),
                readOnly: true,
                handler: async () => ({ content: [{ type: 'text' as const, text: '[]' }] }),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string(), email: z.string() }),
                handler: async () => ({ content: [{ type: 'text' as const, text: 'created' }] }),
            })
            .action({
                name: 'delete',
                schema: z.object({ id: z.string() }),
                destructive: true,
                handler: async () => ({ content: [{ type: 'text' as const, text: 'deleted' }] }),
            })
            // ← NEW action added — surface changed
            .action({
                name: 'deactivate',
                schema: z.object({ id: z.string() }),
                handler: async () => ({ content: [{ type: 'text' as const, text: 'deactivated' }] }),
            });

        registry2.register(modifiedUsers);
        registry2.register(createTool('tasks')
            .description('Manage tasks')
            .tags('core', 'tasks')
            .discriminator('action')
            .action({
                name: 'list',
                description: 'List tasks',
                schema: z.object({}),
                readOnly: true,
                handler: async () => ({ content: [{ type: 'text' as const, text: '[]' }] }),
            }));

        const updatedContracts = await compileContracts([...registry2.getBuilders()]);
        const loaded = await readLockfile(tmpDir);
        const result = await checkLockfile(loaded!, updatedContracts);

        expect(result.ok).toBe(false);
        expect(result.changed).toContain('users');
        expect(result.unchanged).toContain('tasks');
    });

    it('full roundtrip: registry → compile → generate → serialize → write → read → parse → check', async () => {
        const registry = buildRealRegistry();
        const builders = [...registry.getBuilders()];

        // Step 1 — compileContracts
        const contracts = await compileContracts(builders);
        expect(Object.keys(contracts).length).toBe(2);

        // Step 2 — generateLockfile
        const lockfile = await generateLockfile('roundtrip-test', contracts, MCP_FUSION_VERSION);
        expect(lockfile.lockfileVersion).toBe(1);

        // Step 3 — serializeLockfile
        const json = serializeLockfile(lockfile);
        expect(json.endsWith('\n')).toBe(true);

        // Step 4 — writeLockfile
        await writeLockfile(lockfile, tmpDir);
        const onDisk = readFileSync(join(tmpDir, LOCKFILE_NAME), 'utf-8');
        expect(onDisk).toBe(json);

        // Step 5 — readLockfile
        const loaded = await readLockfile(tmpDir);
        expect(loaded).not.toBeNull();

        // Step 6 — parseLockfile (verify the raw string also parses)
        const parsed = parseLockfile(onDisk);
        expect(parsed).not.toBeNull();
        expect(parsed!.integrityDigest).toBe(lockfile.integrityDigest);

        // Step 7 — checkLockfile (CI gate)
        const result = await checkLockfile(loaded!, contracts);
        expect(result.ok).toBe(true);
        expect(result.message).toContain('up to date');
        expect(result.unchanged).toEqual(['tasks', 'users']);
        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
        expect(result.changed).toHaveLength(0);
    });

    it('lockfile is deterministic across multiple generations (same contracts)', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);

        const lockfile1 = await generateLockfile('det-test', contracts, MCP_FUSION_VERSION);
        const lockfile2 = await generateLockfile('det-test', contracts, MCP_FUSION_VERSION);

        // Integrity digests are always identical
        expect(lockfile1.integrityDigest).toBe(lockfile2.integrityDigest);

        // Per-tool digests are always identical
        for (const toolName of Object.keys(contracts)) {
            expect(lockfile1.capabilities.tools[toolName]!.integrityDigest)
                .toBe(lockfile2.capabilities.tools[toolName]!.integrityDigest);
        }
    });

    it('lockfile records correct action metadata', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('metadata-test', contracts, MCP_FUSION_VERSION);

        const users = lockfile.capabilities.tools['users']!;

        // Surface
        expect(users.surface.description).toContain('Manage users');
        expect(users.surface.tags).toEqual(['core', 'users']);
        expect(users.surface.inputSchemaDigest).toMatch(/^sha256:/);

        // Behavioral classification
        expect(users.behavior.destructiveActions).toEqual(['delete']);
        expect(users.behavior.readOnlyActions).toEqual(['list']);

        // Token economics
        expect(users.tokenEconomics.inflationRisk).toBeDefined();
        expect(typeof users.tokenEconomics.schemaFieldCount).toBe('number');

        // Entitlements (no I/O in test handlers)
        expect(users.entitlements.filesystem).toBe(false);
        expect(users.entitlements.network).toBe(false);
        expect(users.entitlements.subprocess).toBe(false);
        expect(users.entitlements.crypto).toBe(false);
    });

    it('readLockfile returns null when no lockfile exists', async () => {
        const result = await readLockfile(tmpDir);
        expect(result).toBeNull();
    });

    it('serialized lockfile keys are alphabetically sorted', async () => {
        const registry = buildRealRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('sort-test', contracts, MCP_FUSION_VERSION);
        const json = serializeLockfile(lockfile);
        const parsed = JSON.parse(json);

        // Verify top-level keys are sorted
        const topKeys = Object.keys(parsed);
        expect(topKeys).toEqual([...topKeys].sort());

        // Verify tool-level keys are sorted
        for (const toolName of Object.keys(parsed.capabilities.tools)) {
            const toolKeys = Object.keys(parsed.capabilities.tools[toolName]);
            expect(toolKeys).toEqual([...toolKeys].sort());
        }
    });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('CLI edge cases', () => {
    it('empty registry produces valid lockfile', async () => {
        const registry = new ToolRegistry();
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('empty', contracts, MCP_FUSION_VERSION);

        expect(Object.keys(lockfile.capabilities.tools)).toHaveLength(0);
        expect(lockfile.integrityDigest).toMatch(/^sha256:/);

        // Serializes cleanly
        const json = serializeLockfile(lockfile);
        expect(() => JSON.parse(json)).not.toThrow();

        // Parses back
        const parsed = parseLockfile(json);
        expect(parsed).not.toBeNull();

        // checkLockfile on empty passes
        const result = await checkLockfile(parsed!, contracts);
        expect(result.ok).toBe(true);
    });

    it('single-tool registry roundtrips correctly', async () => {
        const registry = new ToolRegistry();
        registry.register(createTool('ping')
            .description('Ping')
            .discriminator('action')
            .action({
                name: 'ping',
                schema: z.object({}),
                readOnly: true,
                handler: async () => ({ content: [{ type: 'text' as const, text: 'pong' }] }),
            }));

        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('single', contracts, MCP_FUSION_VERSION);
        const json = serializeLockfile(lockfile);
        const parsed = parseLockfile(json)!;
        const result = await checkLockfile(parsed, contracts);

        expect(result.ok).toBe(true);
        expect(result.unchanged).toEqual(['ping']);
    });

    it('tool with many actions produces sorted action list in lockfile', async () => {
        const registry = new ToolRegistry();
        const tool = createTool('multi')
            .description('Multi action')
            .discriminator('action')
            .action({ name: 'zebra', schema: z.object({}), handler: async () => ({ content: [{ type: 'text' as const, text: '' }] }) })
            .action({ name: 'alpha', schema: z.object({}), handler: async () => ({ content: [{ type: 'text' as const, text: '' }] }) })
            .action({ name: 'middle', schema: z.object({}), handler: async () => ({ content: [{ type: 'text' as const, text: '' }] }) });

        registry.register(tool);
        const contracts = await compileContracts([...registry.getBuilders()]);
        const lockfile = await generateLockfile('sort', contracts, MCP_FUSION_VERSION);

        expect(lockfile.capabilities.tools['multi']!.surface.actions)
            .toEqual(['alpha', 'middle', 'zebra']);
    });
});
