/**
 * EntitlementScanner — Hardened Multi-Layer Blast Radius Analysis
 *
 * **Evolution 5: Blast Radius**
 *
 * Performs static analysis of handler source files to detect
 * I/O capabilities (filesystem, network, subprocess, crypto,
 * code evaluation) that expand the tool's blast radius beyond
 * what its declarative contract suggests.
 *
 * **Key insight**: A tool declared as `readOnly: true` that
 * imports `child_process` has a mismatch between its declared
 * contract and its actual capabilities. This scanner detects
 * such mismatches and reports them as entitlement violations.
 *
 * **Multi-layer defense**:
 *
 * 1. **Pattern detection** — Regex-based pattern matching for
 *    known I/O APIs across 5 categories. Conservative: may
 *    over-report but never under-report.
 *
 * 2. **Code evaluation detection** — Detects `eval()`,
 *    `new Function()`, `vm` module, indirect eval, and other
 *    dynamic code execution vectors.
 *
 * 3. **Evasion heuristics** — Detects techniques commonly used
 *    to bypass static analysis: `String.fromCharCode()`,
 *    bracket-notation global access, computed require/import,
 *    high encoding density, and entropy anomalies in string
 *    literals.
 *
 * The evasion layer does NOT try to determine what obfuscated
 * code does — it flags the *presence of obfuscation itself*
 * as a security concern. Code that hides its intent is
 * inherently untrustworthy.
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
    /** Evasion indicators — patterns suggesting intentional detection bypass */
    readonly evasionIndicators: readonly EvasionIndicator[];
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
export type EntitlementCategory = 'filesystem' | 'network' | 'subprocess' | 'crypto' | 'codeEvaluation';

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

/**
 * Evasion indicator — suspicious pattern suggesting intentional
 * static-analysis bypass.
 *
 * Evasion indicators do NOT identify a specific I/O capability.
 * Instead, they flag *techniques* commonly used to hide intent:
 * string construction, bracket-notation access, computed imports,
 * high-entropy payloads, and dense hex/unicode escape sequences.
 */
export interface EvasionIndicator {
    /** Type of evasion technique detected */
    readonly type: EvasionType;
    /** Confidence level — high confidence makes handler UNSAFE */
    readonly confidence: 'low' | 'medium' | 'high';
    /** Human-readable description */
    readonly description: string;
    /** Source context around the match */
    readonly context: string;
    /** Line number (1-based) */
    readonly line: number;
}

/** Evasion technique categories */
export type EvasionType =
    | 'string-construction'
    | 'indirect-access'
    | 'computed-import'
    | 'encoding-density'
    | 'entropy-anomaly';

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

    // ── Code Evaluation ──
    { category: 'codeEvaluation', identifier: 'eval', regex: /\beval\s*\(/g },
    { category: 'codeEvaluation', identifier: 'eval-indirect', regex: /\(\s*0\s*,\s*eval\s*\)\s*\(/g },
    { category: 'codeEvaluation', identifier: 'Function', regex: /\bnew\s+Function\s*\(/g },
    { category: 'codeEvaluation', identifier: 'vm', regex: /(?:require\s*\(\s*['"]|import\s*\(\s*['"]|from\s+['"])(?:node:)?vm['"]/g },
    { category: 'codeEvaluation', identifier: 'vm.runInNewContext', regex: /\brunInNewContext\s*\(/g },
    { category: 'codeEvaluation', identifier: 'vm.runInThisContext', regex: /\brunInThisContext\s*\(/g },
    { category: 'codeEvaluation', identifier: 'vm.compileFunction', regex: /\bcompileFunction\s*\(/g },
    { category: 'codeEvaluation', identifier: 'vm.Script', regex: /\bnew\s+vm\.Script\s*\(/g },
    { category: 'codeEvaluation', identifier: 'globalThis.eval', regex: /\bglobalThis\s*\.\s*eval\s*\(/g },
    { category: 'codeEvaluation', identifier: 'Reflect.construct-Function', regex: /\bReflect\.construct\s*\(\s*Function/g },
    { category: 'codeEvaluation', identifier: 'process.binding', regex: /\bprocess\.binding\s*\(/g },
    { category: 'codeEvaluation', identifier: 'process.dlopen', regex: /\bprocess\.dlopen\s*\(/g },
];

// ============================================================================
// Evasion Heuristics
// ============================================================================

/** @internal */
interface EvasionHeuristic {
    readonly type: EvasionType;
    readonly confidence: 'low' | 'medium' | 'high';
    readonly regex: RegExp;
    readonly description: string;
}

/**
 * Evasion detection heuristics.
 *
 * These patterns detect techniques commonly used to bypass
 * regex-based static analysis. Unlike entitlement patterns,
 * these flag the *mechanism* of evasion rather than a specific
 * I/O capability.
 *
 * A malicious actor who knows the entitlement patterns can
 * use `String.fromCharCode(114,101,113,117,105,114,101)` to
 * build "require" at runtime. These heuristics catch that.
 */
const EVASION_HEURISTICS: readonly EvasionHeuristic[] = [
    // ── String construction ──
    {
        type: 'string-construction',
        confidence: 'high',
        regex: /\bString\.fromCharCode\s*\(/g,
        description: 'String.fromCharCode() can build API names at runtime to evade static detection',
    },
    {
        type: 'string-construction',
        confidence: 'medium',
        regex: /\bString\.raw\s*`/g,
        description: 'String.raw template can encode obfuscated identifiers',
    },
    {
        type: 'string-construction',
        confidence: 'low',
        regex: /\batob\s*\(/g,
        description: 'atob() decodes base64 — can hide module names or code',
    },
    {
        type: 'string-construction',
        confidence: 'low',
        regex: /\bBuffer\.from\s*\([^)]*['"]base64['"]\s*\)/g,
        description: 'Buffer.from(…, "base64") can decode hidden payloads',
    },

    // ── Indirect access ──
    {
        type: 'indirect-access',
        confidence: 'high',
        regex: /(?:globalThis|global|window|self)\s*\[\s*[^\]]*(?:\+|\()/g,
        description: 'Computed property access on global object with dynamic expression',
    },
    {
        type: 'indirect-access',
        confidence: 'medium',
        regex: /(?:globalThis|global|window|self)\s*\[\s*['"]/g,
        description: 'Bracket-notation access on global object — bypasses dot-notation detection',
    },
    {
        type: 'indirect-access',
        confidence: 'high',
        regex: /\bprocess\s*\[\s*['"]/g,
        description: 'Bracket-notation access on process object — potential binding/dlopen bypass',
    },

    // ── Computed import/require ──
    {
        type: 'computed-import',
        confidence: 'high',
        regex: /\brequire\s*\(\s*(?!['"])\S/g,
        description: 'Dynamic require() with non-literal argument — module name computed at runtime',
    },
    {
        type: 'computed-import',
        confidence: 'high',
        regex: /\bimport\s*\(\s*(?!['"])\S/g,
        description: 'Dynamic import() with non-literal argument — module name computed at runtime',
    },
];

/** Minimum string length to consider for entropy analysis */
const ENTROPY_MIN_LENGTH = 64;

/** Shannon entropy threshold — values above this suggest obfuscation */
const ENTROPY_THRESHOLD = 5.0;

/** Minimum ratio of hex/unicode escapes to total characters to flag */
const ENCODING_DENSITY_THRESHOLD = 0.15;

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
 * Scan source for evasion indicators.
 *
 * This is a secondary analysis pass that detects patterns
 * commonly associated with intentional static-analysis bypass.
 * Unlike `scanSource`, which identifies specific I/O capabilities,
 * this function flags *evasion techniques* regardless of what
 * they ultimately execute.
 *
 * @param source - Source code text
 * @returns Detected evasion indicators
 */
export function scanEvasionIndicators(source: string): readonly EvasionIndicator[] {
    const indicators: EvasionIndicator[] = [];
    const lines = source.split('\n');
    const lineOffsets = buildLineOffsets(source);

    // ── Pattern-based heuristics ──
    for (const heuristic of EVASION_HEURISTICS) {
        const regex = new RegExp(heuristic.regex.source, heuristic.regex.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(source)) !== null) {
            const lineNumber = resolveLineNumber(lineOffsets, match.index);
            const contextLine = lines[lineNumber - 1]?.trim() ?? '';

            indicators.push({
                type: heuristic.type,
                confidence: heuristic.confidence,
                description: heuristic.description,
                context: contextLine,
                line: lineNumber,
            });
        }
    }

    // ── Encoding density analysis ──
    const hexEscapes = (source.match(/\\x[0-9a-fA-F]{2}/g) ?? []).length;
    const unicodeEscapes = (source.match(/\\u(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]+\})/g) ?? []).length;
    const totalEscapes = hexEscapes + unicodeEscapes;
    const density = source.length > 0 ? totalEscapes / source.length : 0;

    if (density > ENCODING_DENSITY_THRESHOLD) {
        indicators.push({
            type: 'encoding-density',
            confidence: 'high',
            description: `High density of hex/unicode escapes (${(density * 100).toFixed(1)}%) — likely obfuscated code`,
            context: `${totalEscapes} escape sequences in ${source.length} characters`,
            line: 1,
        });
    }

    // ── Entropy analysis on string literals ──
    const stringLiteralRegex = /(?:'([^'\\]|\\.){40,}'|"([^"\\]|\\.){40,}"|`([^`\\]|\\.){40,}`)/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = stringLiteralRegex.exec(source)) !== null) {
        const literal = strMatch[0].slice(1, -1);
        if (literal.length >= ENTROPY_MIN_LENGTH) {
            const entropy = computeEntropy(literal);
            if (entropy > ENTROPY_THRESHOLD) {
                const lineNumber = resolveLineNumber(lineOffsets, strMatch.index);
                indicators.push({
                    type: 'entropy-anomaly',
                    confidence: 'medium',
                    description: `High-entropy string literal (Shannon entropy: ${entropy.toFixed(2)}) — possible encoded payload`,
                    context: literal.slice(0, 60) + (literal.length > 60 ? '…' : ''),
                    line: lineNumber,
                });
            }
        }
    }

    return indicators;
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
        codeEvaluation: categories.has('codeEvaluation'),
        raw,
    };
}

/** Filesystem identifiers that imply write operations */
const WRITE_OPS = /write|append|unlink|rmdir|mkdir|rename|copy|createWriteStream/i;

/** All entitlement categories for iteration */
const ALL_CATEGORIES: readonly EntitlementCategory[] = ['filesystem', 'network', 'subprocess', 'crypto', 'codeEvaluation'];

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
    // codeEvaluation → always error (eval/Function can execute anything)
    {
        predicate: (cats, _claims, allowed) =>
            cats.has('codeEvaluation') && !allowed.has('codeEvaluation'),
        produce: (_cats, _claims, matches) => {
            const evalOps = matches.filter(m => m.category === 'codeEvaluation');
            const ids = [...new Set(evalOps.map(m => m.identifier))].join(', ');
            return {
                category: 'codeEvaluation',
                declared: 'no code evaluation expected',
                detected: `Code evaluation APIs: ${ids}`,
                severity: 'error',
                description: `Handler uses dynamic code evaluation (${ids}) — blast radius is unbounded; eval'd code can perform any I/O`,
            };
        },
    },
    // readOnly + codeEvaluation → error (even if allowed, flag readOnly conflict)
    {
        predicate: (cats, claims, allowed) =>
            !!claims.readOnly && cats.has('codeEvaluation') && allowed.has('codeEvaluation'),
        produce: () => ({
            category: 'codeEvaluation',
            declared: 'readOnly: true',
            detected: 'Code evaluation APIs detected',
            severity: 'error',
            description: 'Tool declares readOnly but uses code evaluation — eval can perform writes',
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
    const evasionIndicators = scanEvasionIndicators(source);

    const hasHighConfidenceEvasion = evasionIndicators.some(e => e.confidence === 'high');
    const safe = violations.every(v => v.severity !== 'error') && !hasHighConfidenceEvasion;

    const summary = buildSummary(entitlements, violations, evasionIndicators, safe);

    return {
        entitlements,
        matches,
        violations,
        evasionIndicators,
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
 * Compute Shannon entropy of a string.
 * High entropy (> 4.5) in code regions suggests obfuscation.
 * @internal
 */
function computeEntropy(str: string): number {
    if (str.length === 0) return 0;
    const freq = new Map<string, number>();
    for (const ch of str) {
        freq.set(ch, (freq.get(ch) ?? 0) + 1);
    }
    let entropy = 0;
    for (const count of freq.values()) {
        const p = count / str.length;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

/**
 * Build a human-readable summary.
 * @internal
 */
function buildSummary(
    entitlements: HandlerEntitlements,
    violations: readonly EntitlementViolation[],
    evasionIndicators: readonly EvasionIndicator[],
    safe: boolean,
): string {
    const active = ALL_CATEGORIES.filter(c => entitlements[c]);
    const highEvasion = evasionIndicators.filter(e => e.confidence === 'high');

    if (active.length === 0 && evasionIndicators.length === 0) {
        return 'No I/O entitlements detected — handler is sandboxed.';
    }

    const parts: string[] = [];

    if (active.length > 0) {
        parts.push(`Entitlements: [${active.join(', ')}]`);
    }

    const errorCount = violations.filter(v => v.severity === 'error').length;
    if (violations.length > 0) {
        parts.push(`${violations.length} violation(s) (${errorCount} errors)`);
    }

    if (evasionIndicators.length > 0) {
        parts.push(`${evasionIndicators.length} evasion indicator(s) (${highEvasion.length} high-confidence)`);
    }

    parts.push(safe ? 'SAFE' : 'UNSAFE');

    return parts.join(' | ');
}
