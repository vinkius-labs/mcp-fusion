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
    on() { return this; }
    once() { return this; }
    emit() { return false; }
    addListener() { return this; }
    removeListener() { return this; }
    removeAllListeners() { return this; }
    listeners() { return []; }
    listenerCount() { return 0; }
    setMaxListeners() { return this; }
}

export class Readable extends EventEmitter {}
export class Writable extends EventEmitter {}
export class Duplex extends EventEmitter {}
export class Transform extends EventEmitter {}
export class PassThrough extends EventEmitter {}
export class Server extends EventEmitter { listen() {} close() {} }
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

export const createHash = () => CRASH('node:crypto.createHash');
export const createHmac = () => CRASH('node:crypto.createHmac');
export const randomUUID = () => CRASH('node:crypto.randomUUID');
export const randomBytes = () => CRASH('node:crypto.randomBytes');
export const createReadStream = () => CRASH('node:fs.createReadStream');
export const readFileSync = () => CRASH('node:fs.readFileSync');
export const writeFileSync = () => CRASH('node:fs.writeFileSync');
export const exec = () => CRASH('node:child_process.exec');
export const execSync = () => CRASH('node:child_process.execSync');
export const spawn = () => CRASH('node:child_process.spawn');

// Diplomatic Buffer — defensive checks pass, allocation crashes
export const Buffer = {
    isBuffer: () => false,
    isEncoding: () => false,
    from: () => CRASH('Buffer.from (use Uint8Array)'),
    alloc: () => CRASH('Buffer.alloc (use Uint8Array)'),
    allocUnsafe: () => CRASH('Buffer.allocUnsafe (use Uint8Array)'),
};

// Path stubs — crash like Tier 2 stubs for consistency.
// If these are ever reached at runtime, a silent empty string
// would propagate and create hard-to-debug path errors.
export const resolve = () => CRASH('node:path.resolve');
export const join = () => CRASH('node:path.join');
export const dirname = () => CRASH('node:path.dirname');
export const basename = () => CRASH('node:path.basename');

export default {};
