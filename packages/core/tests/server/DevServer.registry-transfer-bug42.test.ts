/**
 * Bug #42 Regression: DevServer.performReload collects builders in disposable registry
 *
 * BUG: `performReload` creates a local `reloadRegistry` with `register()`
 * and `getBuilders()`, calls `setup(reloadRegistry)`, collects builders,
 * but NEVER transfers them to the real MCP server's registry. The client
 * receives `notifications/tools/list_changed` but the actual tool list
 * hasn't changed. Hot-reload is effectively a no-op.
 *
 * WHY EXISTING TESTS MISSED IT:
 * All DevServer tests used `vi.fn()` (no-op) as the setup callback, or
 * verified that `register()` collects builders internally. None tested
 * that collected builders are propagated to a real registry. The test for
 * "MCP notification is sent" verified the _notification_ was sent but
 * never verified the _tools_ actually changed on the server side.
 *
 * FIX: Accept optional `registry` in DevServerConfig.
 * After setup, transfer collected builders to the real registry
 * (clearing old ones via `registry.clear()` if available).
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDevServer } from '../../src/server/DevServer.js';

describe('Bug #42 Regression: DevServer transfers builders to real registry', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('collected builders are transferred to the real registry via register()', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const realRegistry = {
            register: vi.fn(),
            getBuilders: vi.fn().mockReturnValue([]),
        };

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (reg) => {
                reg.register({ name: 'tool-a' });
                reg.register({ name: 'tool-b' });
            },
            registry: realRegistry,
        });

        await devServer.reload('test');

        // Builders should have been transferred to the real registry
        expect(realRegistry.register).toHaveBeenCalledTimes(2);
        expect(realRegistry.register).toHaveBeenCalledWith({ name: 'tool-a' });
        expect(realRegistry.register).toHaveBeenCalledWith({ name: 'tool-b' });

        consoleSpy.mockRestore();
    });

    it('real registry is cleared before re-registration (if clear() exists)', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const realRegistry = {
            register: vi.fn(),
            clear: vi.fn(),
        };

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (reg) => {
                reg.register({ name: 'tool-x' });
            },
            registry: realRegistry,
        });

        await devServer.reload('first-change');

        expect(realRegistry.clear).toHaveBeenCalledTimes(1);
        expect(realRegistry.register).toHaveBeenCalledTimes(1);

        // Second reload: clear should be called again before re-registration
        await devServer.reload('second-change');

        expect(realRegistry.clear).toHaveBeenCalledTimes(2);
        expect(realRegistry.register).toHaveBeenCalledTimes(2);

        consoleSpy.mockRestore();
    });

    it('works without clear() on the real registry (backward compatible)', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const realRegistry = {
            register: vi.fn(),
            // No clear() method — should still work
        };

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (reg) => {
                reg.register({ name: 'tool-y' });
            },
            registry: realRegistry,
        });

        // Should not throw
        await devServer.reload('test');

        expect(realRegistry.register).toHaveBeenCalledWith({ name: 'tool-y' });

        consoleSpy.mockRestore();
    });

    it('no transfer when no builders are collected', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const realRegistry = {
            register: vi.fn(),
            clear: vi.fn(),
        };

        const devServer = createDevServer({
            dir: './src/tools',
            setup: () => {
                // No builders registered
            },
            registry: realRegistry,
        });

        await devServer.reload('test');

        // Neither clear nor register should be called when no builders collected
        expect(realRegistry.clear).not.toHaveBeenCalled();
        expect(realRegistry.register).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
    });

    it('no transfer when no real registry is provided (backward compatible)', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let capturedBuilders: unknown[] = [];

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (reg) => {
                reg.register({ name: 'orphan-tool' });
                if (reg.getBuilders) {
                    capturedBuilders = reg.getBuilders();
                }
            },
            // No registry — old closure mode
        });

        await devServer.reload('test');

        // Builders collected internally but not transferred anywhere
        expect(capturedBuilders).toHaveLength(1);

        consoleSpy.mockRestore();
    });

    it('setup error prevents transfer to real registry', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const realRegistry = {
            register: vi.fn(),
            clear: vi.fn(),
        };

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (reg) => {
                reg.register({ name: 'tool-before-crash' });
                throw new Error('Setup exploded');
            },
            registry: realRegistry,
        });

        await devServer.reload('test');

        // Transfer should NOT happen because setup threw
        expect(realRegistry.register).not.toHaveBeenCalled();
        expect(realRegistry.clear).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('MCP notification + real registry transfer work together', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const sendNotification = vi.fn().mockResolvedValue(undefined);
        const realRegistry = {
            register: vi.fn(),
            clear: vi.fn(),
        };

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (reg) => {
                reg.register({ name: 'live-tool' });
            },
            server: {
                notification: vi.fn(),
                sendNotification,
            },
            registry: realRegistry,
        });

        await devServer.reload('file.ts');

        // Both transfer AND notification should happen
        expect(realRegistry.clear).toHaveBeenCalledTimes(1);
        expect(realRegistry.register).toHaveBeenCalledWith({ name: 'live-tool' });
        expect(sendNotification).toHaveBeenCalledWith({
            method: 'notifications/tools/list_changed',
        });

        consoleSpy.mockRestore();
    });
});
