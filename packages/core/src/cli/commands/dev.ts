/**
 * `vurb dev` — HMR development server.
 * @module
 */
import type { CliArgs } from '../args.js';
import type { ProgressReporter } from '../progress.js';
import { ProgressTracker } from '../progress.js';
import { ansi } from '../constants.js';
import { resolveRegistry } from '../registry.js';
import { inferServerEntry, inferWatchDir } from '../utils.js';
import { createDevServer } from '../../server/DevServer.js';
import { toErrorMessage } from '../../core/ErrorUtils.js';

/** @internal exported for testing */
export async function commandDev(args: CliArgs, reporter?: ProgressReporter): Promise<void> {
    const progress = new ProgressTracker(reporter);

    if (!args.server) {
        const detected = inferServerEntry(args.cwd);
        if (!detected) {
            console.error('Error: Could not auto-detect server entrypoint.\n');
            console.error('Usage: vurb dev --server ./src/server.ts');
            process.exit(1);
        }
        args.server = detected;
    }

    const serverEntry = args.server;

    process.stderr.write(`\n  ${ansi.bold('vurb dev')} ${ansi.dim('— HMR Development Server')}\n\n`);

    // Step 1: Resolve registry
    progress.start('resolve', 'Resolving server entrypoint');
    const { registry, name } = await resolveRegistry(serverEntry);
    progress.done('resolve', 'Resolving server entrypoint', name);

    // Step 2: Determine watch directory
    const watchDir = args.dir ?? inferWatchDir(serverEntry);
    progress.start('watch', `Watching ${watchDir}`);
    progress.done('watch', `Watching ${watchDir}`);

    // Step 3: Create and start dev server
    const devServer = createDevServer({
        dir: watchDir,
        setup: async (regOrCtx) => {
            // Extract registry: new context shape has .registry, duck-typed also has .register
            const reg = 'registry' in regOrCtx && 'cacheBustUrl' in regOrCtx
                ? regOrCtx.registry
                : regOrCtx as { register(b: unknown): void; clear?(): void };

            // Bug #75 fix: resolve NEW registry first, only clear+register on success.
            // If resolveRegistry throws (syntax error in user code), the
            // current tools remain available until the next successful reload.
            let resolved: Awaited<ReturnType<typeof resolveRegistry>>;
            try {
                resolved = await resolveRegistry(serverEntry);
            } catch (err) {
                const message = toErrorMessage(err);
                throw new Error(`Failed to reload: ${message}`);
            }

            if ('clear' in reg && typeof (reg as { clear: unknown }).clear === 'function') {
                (reg as { clear: () => void }).clear();
            }
            for (const builder of resolved.registry.getBuilders()) {
                reg.register(builder);
            }
        },
    });

    process.on('SIGINT', () => {
        process.stderr.write(`\n  ${ansi.dim('Shutting down...')}\n\n`);
        devServer.stop();
        process.exit(0);
    });

    await devServer.start();
}
