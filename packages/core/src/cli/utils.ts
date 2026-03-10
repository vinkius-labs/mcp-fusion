/**
 * CLI utilities — server detection, watch dir inference.
 * @module
 */
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ansi } from './constants.js';

// ─── Server Entry Detection ──────────────────────────────────────

/**
 * Auto-detect the server entrypoint by probing common file paths.
 *
 * Checks in order: `src/server.ts`, `src/index.ts`, `server.ts`, `index.ts`,
 * and their `.js` counterparts.
 *
 * @internal
 */
export function inferServerEntry(cwd: string): string | undefined {
    const candidates = [
        'src/server.ts', 'src/index.ts',
        'src/server.js', 'src/index.js',
        'server.ts', 'index.ts',
        'server.js', 'index.js',
    ];
    for (const candidate of candidates) {
        const fullPath = resolve(cwd, candidate);
        if (existsSync(fullPath)) return candidate;
    }
    return undefined;
}

// ─── Watch Dir Inference ─────────────────────────────────────────

/**
 * Infer the watch directory from the server entrypoint path.
 *
 * Heuristic: if the server is in `src/server.ts`, watch `src/`.
 * Falls back to the directory containing the entrypoint.
 *
 * @internal
 */
export function inferWatchDir(serverPath: string): string {
    const dir = resolve(serverPath, '..');
    const dirName = dir.split(/[\\/]/).pop() ?? '';

    if (dirName === 'src') return dir;

    const parentDir = resolve(dir, '..');
    const parentName = parentDir.split(/[\\/]/).pop() ?? '';
    if (parentName === 'src') return parentDir;

    return dir;
}

// ─── Interactive Prompt ──────────────────────────────────────────

/**
 * Ask a question via readline with styled ANSI output.
 * @internal exported for testing
 */
export function ask(
    rl: { question: (q: string, cb: (a: string) => void) => void; once?: (event: string, cb: () => void) => void },
    prompt: string,
    fallback: string,
): Promise<string> {
    return new Promise((resolve) => {
        let resolved = false;
        rl.once?.('close', () => {
            if (!resolved) {
                resolved = true;
                resolve(fallback);
            }
        });
        rl.question(`  ${ansi.cyan('◇')} ${prompt} ${ansi.dim(`(${fallback})`)} `, (answer: string) => {
            if (!resolved) {
                resolved = true;
                resolve(answer.trim() || fallback);
            }
        });
    });
}
