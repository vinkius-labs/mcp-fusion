/**
 * Tests for createDevServer() — HMR Dev Server
 */
import { describe, it, expect, vi } from 'vitest';
import { createDevServer } from '../../src/server/DevServer.js';

describe('createDevServer', () => {
    it('should create a DevServer instance with start/stop/reload', () => {
        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
        });

        expect(typeof devServer.start).toBe('function');
        expect(typeof devServer.stop).toBe('function');
        expect(typeof devServer.reload).toBe('function');
    });

    it('should call setup on reload', async () => {
        const setupFn = vi.fn();

        const devServer = createDevServer({
            dir: './src/tools',
            setup: setupFn,
        });

        await devServer.reload('test-change');
        expect(setupFn).toHaveBeenCalledTimes(1);
    });

    it('should call onReload callback when specified', async () => {
        const onReload = vi.fn();

        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
            onReload,
        });

        await devServer.reload('some/file.ts');
        expect(onReload).toHaveBeenCalledWith('some/file.ts');
    });

    it('should handle setup errors gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const devServer = createDevServer({
            dir: './src/tools',
            setup: () => { throw new Error('Setup failed'); },
        });

        // Should not throw
        await devServer.reload('test');

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Reload failed: Setup failed'),
        );

        consoleSpy.mockRestore();
    });

    it('should send MCP notification when server is provided', async () => {
        const sendNotification = vi.fn().mockResolvedValue(undefined);

        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
            server: { notification: vi.fn(), sendNotification },
        });

        await devServer.reload('change');

        expect(sendNotification).toHaveBeenCalledWith({
            method: 'notifications/tools/list_changed',
        });
    });

    it('should use default reason when reload is called without reason', async () => {
        const onReload = vi.fn();

        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
            onReload,
        });

        await devServer.reload();
        expect(onReload).toHaveBeenCalledWith('(manual)');
    });

    it('stop should not throw even if not started', () => {
        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
        });

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(() => devServer.stop()).not.toThrow();
        consoleSpy.mockRestore();
    });

    it('should handle server notification failure silently', async () => {
        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
            server: {
                notification: vi.fn().mockRejectedValue(new Error('No connection')),
                sendNotification: vi.fn().mockRejectedValue(new Error('No connection')),
            },
        });

        // Should not throw despite notification failure
        await devServer.reload('test');
    });
});
