/**
 * Ambient type declaration for the optional inspector package.
 * This prevents TS2307 when `@vinkius-core/mcp-fusion-inspector`
 * is dynamically imported but not installed (e.g. CI builds).
 */
declare module '@vinkius-core/mcp-fusion-inspector' {
    export function runInspector(argv: string[]): Promise<void>;
    export function parseInspectorArgs(argv: string[]): {
        pid: number | undefined;
        path: string | undefined;
        out: 'tui' | 'stderr';
        demo: boolean;
        help: boolean;
    };
    export const INSPECTOR_HELP: string;
}
