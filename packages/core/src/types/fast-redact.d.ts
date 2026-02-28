/**
 * Ambient type declaration for `fast-redact` (optional peer dependency).
 *
 * `fast-redact` v3 does not ship its own TypeScript declarations.
 * This minimal ambient module allows dynamic `import('fast-redact')`
 * without a TS7016 error.
 */
declare module 'fast-redact' {
    interface FastRedactOptions {
        paths: string[];
        censor?: string | ((value: unknown) => string);
        serialize?: boolean | ((value: unknown) => string);
        remove?: boolean;
        strict?: boolean;
    }

    interface RedactorFn {
        (obj: unknown): unknown;
        restore: (obj: unknown) => unknown;
    }

    function fastRedact(opts: FastRedactOptions): RedactorFn;
    export = fastRedact;
}
