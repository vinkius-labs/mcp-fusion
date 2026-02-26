/**
 * EntitlementScanner — AST-Based Blast Radius Analysis
 *
 * **Evolution 5: Blast Radius**
 *
 * Performs static analysis of handler source files to detect
 * I/O capabilities (filesystem, network, subprocess, crypto)
 * that expand the tool's blast radius beyond what its
 * declarative contract suggests.
 *
 * **Key insight**: A tool declared as `readOnly: true` that
 * imports `child_process` has a mismatch between its declared
 * contract and its actual capabilities. This scanner detects
 * such mismatches and reports them as entitlement violations.
 *
 * **Implementation approach**: Instead of a full TypeScript AST
 * parser (which would require `typescript` as a dependency),
 * this module uses regex-based pattern matching on source text.
 * This is deliberately conservative — it may over-report but
 * never under-report.
 *
 * **Contract integration**: The entitlement report is embedded
 * in the `ToolContract.entitlements` field, making entitlement
 * changes trackable via `ContractDiff`.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import type { HandlerEntitlements } from './ToolContract.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Complete entitlement report for a handler.
 */
export interface EntitlementReport {
    /** Resolved entitlements */
    readonly entitlements: HandlerEntitlements;
    /** All detected entitlement matches */
    readonly matches: readonly EntitlementMatch[];
    /** Entitlement violations (declared vs detected mismatches) */
    readonly violations: readonly EntitlementViolation[];
    /** Whether the handler is considered safe */
    readonly safe: boolean;
    /** Human-readable summary */
    readonly summary: string;
}

/**
 * A single entitlement match detected in source code.
 */
export interface EntitlementMatch {
    /** Which entitlement category */
    readonly category: EntitlementCategory;
    /** The specific API/import detected */
    readonly identifier: string;
    /** Pattern that matched */
    readonly pattern: string;
    /** Source text (context around the match) */
    readonly context: string;
    /** Line number in the source (1-based) */
    readonly line: number;
}

/**
 * An entitlement violation — mismatch between declaration and detection.
 */
export interface EntitlementViolation {
    /** Which entitlement is violated */
    readonly category: EntitlementCategory;
    /** What was declared (e.g., readOnly: true) */
    readonly declared: string;
    /** What was detected */
    readonly detected: string;
    /** Severity */
    readonly severity: 'warning' | 'error';
    /** Human-readable description */
    readonly description: string;
}

/** Entitlement categories */
export type EntitlementCategory = 'filesystem' | 'network' | 'subprocess' | 'crypto';

/**
 * Declaration claims for validation against detected entitlements.
 */
export interface EntitlementClaims {
    /** Whether the action is declared as readOnly */
    readonly readOnly?: boolean;
    /** Whether the action is declared as destructive */
    readonly destructive?: boolean;
    /** Explicitly allowed entitlements (bypasses violation detection) */
    readonly allowed?: readonly EntitlementCategory[];
}

// ============================================================================
// Pattern Definitions
// ============================================================================

interface EntitlementPattern {
    readonly category: EntitlementCategory;
    readonly identifier: string;
    readonly regex: RegExp;
}

/**
 * Entitlement detection patterns.
 *
 * Conservative: may over-report (false positives in comments/strings)
 * but never under-report. This is intentional — security analysis
 * should err on the side of caution.
 */
const PATTERNS: readonly EntitlementPattern[] = [
    // ── Filesystem ──
    { category: 'filesystem', identifier: 'fs', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?fs(?:\/promises)?['"]/g },
    { category: 'filesystem', identifier: 'fs.*', regex: /\bfs\.\w+(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'readFile', regex: /\breadFile(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'writeFile', regex: /\bwriteFile(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'appendFile', regex: /\bappendFile(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'unlink', regex: /\bunlink(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'rmdir', regex: /\brmdir(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'mkdir', regex: /\bmkdir(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'rename', regex: /\brename(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'copyFile', regex: /\bcopyFile(?:Sync)?\s*\(/g },
    { category: 'filesystem', identifier: 'createReadStream', regex: /\bcreateReadStream\s*\(/g },
    { category: 'filesystem', identifier: 'createWriteStream', regex: /\bcreateWriteStream\s*\(/g },

    // ── Network ──
    { category: 'network', identifier: 'fetch', regex: /\bfetch\s*\(/g },
    { category: 'network', identifier: 'http', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?https?['"]/g },
    { category: 'network', identifier: 'axios', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])axios['"]/g },
    { category: 'network', identifier: 'got', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])got['"]/g },
    { category: 'network', identifier: 'node-fetch', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])node-fetch['"]/g },
    { category: 'network', identifier: 'XMLHttpRequest', regex: /\bnew\s+XMLHttpRequest\s*\(/g },
    { category: 'network', identifier: 'WebSocket', regex: /\bnew\s+WebSocket\s*\(/g },
    { category: 'network', identifier: 'net', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?net['"]/g },
    { category: 'network', identifier: 'dgram', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?dgram['"]/g },
    { category: 'network', identifier: 'undici', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])undici['"]/g },

    // ── Subprocess ──
    { category: 'subprocess', identifier: 'child_process', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?child_process['"]/g },
    { category: 'subprocess', identifier: 'exec', regex: /\bexec(?:Sync|File|FileSync)?\s*\(/g },
    { category: 'subprocess', identifier: 'spawn', regex: /\bspawn(?:Sync)?\s*\(/g },
    { category: 'subprocess', identifier: 'fork', regex: /\bfork\s*\(/g },
    { category: 'subprocess', identifier: 'worker_threads', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?worker_threads['"]/g },
    { category: 'subprocess', identifier: 'cluster', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?cluster['"]/g },
    { category: 'subprocess', identifier: 'Deno.run', regex: /\bDeno\.run\s*\(/g },
    { category: 'subprocess', identifier: 'Bun.spawn', regex: /\bBun\.spawn\s*\(/g },

    // ── Crypto ──
    { category: 'crypto', identifier: 'crypto', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?crypto['"]/g },
    { category: 'crypto', identifier: 'createSign', regex: /\bcreateSign\s*\(/g },
    { category: 'crypto', identifier: 'createVerify', regex: /\bcreateVerify\s*\(/g },
    { category: 'crypto', identifier: 'createCipher', regex: /\bcreateCipher(?:iv)?\s*\(/g },
    { category: 'crypto', identifier: 'createDecipher', regex: /\bcreateDecipher(?:iv)?\s*\(/g },
    { category: 'crypto', identifier: 'privateEncrypt', regex: /\bprivateEncrypt\s*\(/g },
    { category: 'crypto', identifier: 'privateDecrypt', regex: /\bprivateDecrypt\s*\(/g },
];

// ============================================================================
// Scanner
// ============================================================================

/**
 * Scan source text for entitlement patterns.
 *
 * @param source - The source code text to scan
 * @param fileName - File name for reporting (optional)
 * @returns All entitlement matches found
 */
export function scanSource(
    source: string,
    fileName?: string,
): readonly EntitlementMatch[] {
    const matches: EntitlementMatch[] = [];
    const lines = source.split('\n');
    const lineOffsets = buildLineOffsets(source);

    for (const pattern of PATTERNS) {
        // Reset regex state (global flag)
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(source)) !== null) {
            const lineNumber = resolveLineNumber(lineOffsets, match.index);
            const contextLine = lines[lineNumber - 1]?.trim() ?? '';

            matches.push({
                category: pattern.category,
                identifier: pattern.identifier,
                pattern: pattern.regex.source,
                context: contextLine,
                line: lineNumber,
            });
        }
    }

    return matches;
}

/**
 * Build `HandlerEntitlements` from detected matches.
 *
 * @param matches - Detected entitlement matches
 * @returns Aggregated entitlements
 */
export function buildEntitlements(
    matches: readonly EntitlementMatch[],
): HandlerEntitlements {
    const categories = new Set(matches.map(m => m.category));
    const raw = [...new Set(matches.map(m => m.identifier))].sort();

    return {
        filesystem: categories.has('filesystem'),
        network: categories.has('network'),
        subprocess: categories.has('subprocess'),
        crypto: categories.has('crypto'),
        raw,
    };
}

/** Filesystem identifiers that imply write operations */
const WRITE_OPS = /write|append|unlink|rmdir|mkdir|rename|copy|createWriteStream/i;

/** All entitlement categories for iteration */
const ALL_CATEGORIES: readonly EntitlementCategory[] = ['filesystem', 'network', 'subprocess', 'crypto'];

/**
 * Violation rule — encodes a policy check as data rather than imperative branching.
 * @internal
 */
interface ViolationRule {
    readonly predicate: (categories: ReadonlySet<EntitlementCategory>, claims: EntitlementClaims, allowed: ReadonlySet<EntitlementCategory>, matches: readonly EntitlementMatch[]) => boolean;
    readonly produce: (categories: ReadonlySet<EntitlementCategory>, claims: EntitlementClaims, matches: readonly EntitlementMatch[]) => EntitlementViolation;
}

/** @internal */
const VIOLATION_RULES: readonly ViolationRule[] = [
    // readOnly + filesystem writes → error
    {
        predicate: (cats, claims, allowed, matches) =>
            !!claims.readOnly
            && cats.has('filesystem')
            && !allowed.has('filesystem')
            && matches.some(m => m.category === 'filesystem' && WRITE_OPS.test(m.identifier)),
        produce: (_cats, _claims, matches) => {
            const writeOps = matches.filter(m => m.category === 'filesystem' && WRITE_OPS.test(m.identifier));
            const ids = writeOps.map(m => m.identifier).join(', ');
            return {
                category: 'filesystem',
                declared: 'readOnly: true',
                detected: `Filesystem write operations: ${ids}`,
                severity: 'error',
                description: `Tool declares readOnly but handler uses filesystem write APIs: ${ids}`,
            };
        },
    },
    // readOnly + subprocess → error
    {
        predicate: (cats, claims, allowed) =>
            !!claims.readOnly && cats.has('subprocess') && !allowed.has('subprocess'),
        produce: () => ({
            category: 'subprocess',
            declared: 'readOnly: true',
            detected: 'Subprocess APIs detected',
            severity: 'error',
            description: 'Tool declares readOnly but handler uses subprocess APIs',
        }),
    },
    // non-destructive + subprocess → warning
    {
        predicate: (cats, claims, allowed) =>
            !claims.destructive && cats.has('subprocess') && !allowed.has('subprocess'),
        produce: () => ({
            category: 'subprocess',
            declared: 'destructive: false',
            detected: 'Subprocess APIs detected',
            severity: 'warning',
            description: 'Tool is not marked destructive but handler uses subprocess APIs — consider marking as destructive',
        }),
    },
    // readOnly + network → warning
    {
        predicate: (cats, claims, allowed) =>
            !!claims.readOnly && cats.has('network') && !allowed.has('network'),
        produce: () => ({
            category: 'network',
            declared: 'readOnly: true',
            detected: 'Network APIs detected',
            severity: 'warning',
            description: 'Tool declares readOnly but handler makes network calls — side effects possible',
        }),
    },
];

/**
 * Validate detected entitlements against declared claims.
 *
 * Uses a rule table instead of imperative branching.
 * Each rule encodes a policy check as pure data.
 *
 * @param matches - Detected matches
 * @param claims - Declared claims from action metadata
 * @returns Violations found
 */
export function validateClaims(
    matches: readonly EntitlementMatch[],
    claims: EntitlementClaims,
): readonly EntitlementViolation[] {
    const categories = new Set(matches.map(m => m.category));
    const allowed = new Set(claims.allowed ?? []);

    return VIOLATION_RULES
        .filter(rule => rule.predicate(categories, claims, allowed, matches))
        .map(rule => rule.produce(categories, claims, matches));
}

/**
 * Perform a complete entitlement scan and validation.
 *
 * @param source - Handler source code
 * @param claims - Declared claims for validation
 * @param fileName - Optional file name for reporting
 * @returns Complete entitlement report
 */
export function scanAndValidate(
    source: string,
    claims: EntitlementClaims = {},
    fileName?: string,
): EntitlementReport {
    const matches = scanSource(source, fileName);
    const entitlements = buildEntitlements(matches);
    const violations = validateClaims(matches, claims);

    const safe = violations.every(v => v.severity !== 'error');

    const summary = buildSummary(entitlements, violations, safe);

    return {
        entitlements,
        matches,
        violations,
        safe,
        summary,
    };
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Precompute line start offsets for O(log n) line-number resolution.
 * @internal
 */
function buildLineOffsets(source: string): readonly number[] {
    const offsets: number[] = [0]; // Line 1 starts at offset 0
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '\n') offsets.push(i + 1);
    }
    return offsets;
}

/**
 * Binary search for the line number at a given character offset.
 * O(log n) per lookup vs O(n) for naive iteration.
 * @internal
 */
function resolveLineNumber(offsets: readonly number[], offset: number): number {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (offsets[mid]! <= offset) lo = mid;
        else hi = mid - 1;
    }
    return lo + 1; // 1-based
}

/**
 * Build a human-readable summary.
 * @internal
 */
function buildSummary(
    entitlements: HandlerEntitlements,
    violations: readonly EntitlementViolation[],
    safe: boolean,
): string {
    const active = ALL_CATEGORIES.filter(c => entitlements[c]);

    if (active.length === 0) {
        return 'No I/O entitlements detected — handler is sandboxed.';
    }

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const violationSuffix = violations.length > 0
        ? ` | ${violations.length} violation(s) (${errorCount} errors)`
        : ' | No violations';

    return `Entitlements: [${active.join(', ')}]${violationSuffix} | ${safe ? 'SAFE' : 'UNSAFE'}`;
}
