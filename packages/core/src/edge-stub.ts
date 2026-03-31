/**
 * Edge Stub — Dead Code Satisfier for V8 Isolate Bundles
 *
 * INTERNAL: Lives in dist/ but NOT in package.json exports.
 * Only used by CLI deploy esbuild aliases.
 *
 * Provides class shells that satisfy the AST so esbuild
 * can compile @modelcontextprotocol/sdk without errors.
 * These classes are NEVER instantiated at runtime because
 * startServer() intercepts before any transport is created.
 *
 * Two tiers:
 *   Tier 1 — Structural stubs (safe for AST, never called at runtime)
 *   Tier 2 — Executable stubs (CRASH immediately if invoked at runtime)
 *
 * @internal
 * @module
 */

// ── Tier 1: Structural (satisfy AST — dead code, never called) ──────────────

export class EventEmitter {
    on(): this { return this; }
    once(): this { return this; }
    emit(): boolean { return false; }
    addListener(): this { return this; }
    removeListener(): this { return this; }
    removeAllListeners(): this { return this; }
    listeners(): unknown[] { return []; }
    listenerCount(): number { return 0; }
    setMaxListeners(): this { return this; }
}

export class Readable extends EventEmitter {}
export class Writable extends EventEmitter {}
export class Duplex extends EventEmitter {}
export class Transform extends EventEmitter {}
export class PassThrough extends EventEmitter {}
export class Server extends EventEmitter { listen(): void {} close(): void {} }
export class Socket extends EventEmitter {}
export class IncomingMessage extends Readable {}
export class ServerResponse extends Writable {}

// ── Tier 2: Executable (fail-fast CRASH at runtime) ─────────────────────────

const CRASH = (api: string): never => {
    throw new Error(
        `[Vinkius Edge] "${api}" is blocked in the Serverless Sandbox. ` +
        `Edge functions cannot use Node.js built-in modules. ` +
        `Use Web APIs (fetch, crypto.subtle, TextEncoder) instead.`,
    );
};

export const createHash = (): never => CRASH('node:crypto.createHash');
export const createHmac = (): never => CRASH('node:crypto.createHmac');
export const randomUUID = (): never => CRASH('node:crypto.randomUUID');
export const randomBytes = (): never => CRASH('node:crypto.randomBytes');
export const createReadStream = (): never => CRASH('node:fs.createReadStream');
export const readFileSync = (): never => CRASH('node:fs.readFileSync');
export const writeFileSync = (): never => CRASH('node:fs.writeFileSync');
export const exec = (): never => CRASH('node:child_process.exec');
export const execSync = (): never => CRASH('node:child_process.execSync');
export const spawn = (): never => CRASH('node:child_process.spawn');

// Diplomatic Buffer — defensive checks pass, allocation crashes
export const Buffer = {
    isBuffer: (): boolean => false,
    isEncoding: (): boolean => false,
    from: (): never => CRASH('Buffer.from (use Uint8Array)'),
    alloc: (): never => CRASH('Buffer.alloc (use Uint8Array)'),
    allocUnsafe: (): never => CRASH('Buffer.allocUnsafe (use Uint8Array)'),
};

// Path stubs — safe defaults for import-time init (MCP SDK session paths).
// Return concatenated strings so path construction doesn't crash.
export const resolve = (...parts: string[]): string => parts.filter(Boolean).join('/');
export const join = (...parts: string[]): string => parts.filter(Boolean).join('/');
export const dirname = (p: string): string => p.split('/').slice(0, -1).join('/') || '/';
export const basename = (p: string): string => p.split('/').pop() || '';
export const sep = '/';
export const posix = { sep: '/', join, resolve, dirname, basename };

// OS stubs — safe defaults for import-time init (MCP SDK, zod, etc.)
export const tmpdir = (): string => '/tmp';
export const homedir = (): string => '/home';
export const platform = (): string => 'linux';
export const arch = (): string => 'x64';
export const cpus = (): unknown[] => [];
export const totalmem = (): number => 0;
export const freemem = (): number => 0;
export const EOL = '\n';

export default {};
