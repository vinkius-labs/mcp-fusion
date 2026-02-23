/**
 * GlobMatcher — Dot-Separated Glob Pattern Matching
 *
 * Pure function. Single responsibility: match a dot-separated tool name
 * against a glob pattern.
 *
 * - `*`  matches exactly one segment
 * - `**` matches zero or more segments
 *
 * Uses an iterative approach with explicit stack to avoid stack overflow
 * on deeply nested patterns and to cap worst-case complexity.
 *
 * @example
 * ```typescript
 * matchGlob('sprints.*', 'sprints.get');       // true
 * matchGlob('sprints.*', 'sprints.tasks.get'); // false
 * matchGlob('**', 'anything.at.all');          // true
 * ```
 *
 * @module
 */

/**
 * Maximum number of backtrack iterations to prevent exponential blowup
 * on adversarial patterns (e.g. `**.**.**.**` against long names).
 *
 * 1024 is generous enough for any real-world MCP tool name hierarchy
 * while capping worst-case CPU usage.
 */
const MAX_ITERATIONS = 1024;

/**
 * Match a dot-separated name against a glob pattern.
 *
 * Splits both pattern and name by `.` and performs iterative matching
 * with bounded backtracking to prevent exponential blowup.
 */
export function matchGlob(pattern: string, name: string): boolean {
    const patternSegs = pattern.split('.');
    const nameSegs = name.split('.');

    return matchIterative(patternSegs, nameSegs);
}

// ── Iterative Matching with Bounded Backtracking ─────────

function matchIterative(
    pattern: readonly string[],
    name: readonly string[],
): boolean {
    let pi = 0;
    let ni = 0;

    // Bookmarks for `**` backtracking: the position to retry from
    let starPi = -1;
    let starNi = -1;

    let iterations = 0;

    while (ni < name.length) {
        if (++iterations > MAX_ITERATIONS) return false;

        if (pi < pattern.length && (pattern[pi] === '*' || pattern[pi] === name[ni])) {
            // `*` or exact match — consume one segment from both
            pi++;
            ni++;
        } else if (pi < pattern.length && pattern[pi] === '**') {
            // `**` — bookmark this position, try consuming zero segments first
            starPi = pi;
            starNi = ni;
            pi++;
        } else if (starPi !== -1) {
            // Backtrack: the last `**` consumes one more segment
            pi = starPi + 1;
            starNi++;
            ni = starNi;
        } else {
            return false;
        }
    }

    // Skip trailing `**` segments in the pattern
    while (pi < pattern.length && pattern[pi] === '**') {
        pi++;
    }

    return pi === pattern.length;
}
