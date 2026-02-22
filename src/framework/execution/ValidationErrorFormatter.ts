/**
 * ValidationErrorFormatter — LLM-Friendly Zod Error Translation
 *
 * Translates raw ZodIssue arrays into directive correction prompts
 * that guide the LLM to fix its input on the next call.
 *
 * Instead of returning:
 *   "Validation failed: email: Invalid"
 *
 * It produces:
 *   "❌ Validation failed for 'users.create':
 *    • email — Invalid email format. You sent: 'admin@local'. Expected: a valid email address.
 *    • age — Number must be >= 18. You sent: 10.
 *    💡 Fix the fields above and call the action again."
 *
 * This dramatically reduces LLM retry loops by providing actionable,
 * unambiguous correction instructions.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import { type ZodIssue } from 'zod';

// ── Public API ───────────────────────────────────────────

/**
 * Format Zod validation issues into an LLM-friendly correction prompt.
 *
 * @param issues - Array of ZodIssue from safeParse failure
 * @param actionKey - The action key (e.g. "users.create") for context
 * @param sentArgs - The raw args the LLM sent (for "You sent:" hints)
 * @returns A formatted string optimized for LLM self-correction
 */
export function formatValidationError(
    issues: readonly ZodIssue[],
    actionKey: string,
    sentArgs: Record<string, unknown>,
): string {
    const lines: string[] = [];

    lines.push(`❌ Validation failed for '${actionKey}':`);

    for (const issue of issues) {
        const fieldPath = issue.path.length > 0
            ? issue.path.join('.')
            : '(root)';

        const sentValue = resolveValue(sentArgs, issue.path);
        const sentHint = formatSentValue(sentValue);
        const suggestion = buildSuggestion(issue);

        let line = `  • ${fieldPath} — ${issue.message}.`;
        if (sentHint) {
            line += ` You sent: ${sentHint}.`;
        }
        if (suggestion) {
            line += ` ${suggestion}`;
        }

        lines.push(line);
    }

    lines.push(`💡 Fix the fields above and call the action again.`);

    return lines.join('\n');
}

// ── Suggestion Builder ───────────────────────────────────

/**
 * Build an actionable suggestion from Zod issue metadata.
 *
 * Each ZodIssueCode has different metadata fields we can use
 * to generate a precise correction hint.
 */
function buildSuggestion(issue: ZodIssue): string | undefined {
    switch (issue.code) {
        case 'invalid_type':
            return `Expected type: ${(issue as IssueInvalidType).expected}.`;

        case 'invalid_string':
            return buildStringSuggestion(issue as IssueInvalidString);

        case 'too_small':
            return buildTooSmallSuggestion(issue as IssueTooSmall);

        case 'too_big':
            return buildTooBigSuggestion(issue as IssueTooBig);

        case 'invalid_enum_value': {
            const opts = (issue as IssueInvalidEnum).options;
            return `Valid options: ${opts.map(o => `'${o}'`).join(', ')}.`;
        }

        case 'invalid_literal': {
            const expected = (issue as IssueInvalidLiteral).expected;
            return `Expected exactly: ${JSON.stringify(expected)}.`;
        }

        case 'invalid_union':
            return `Value didn't match any of the expected formats.`;

        case 'unrecognized_keys': {
            const keys = (issue as IssueUnrecognizedKeys).keys;
            return `Remove unrecognized fields: ${keys.map(k => `'${k}'`).join(', ')}.`;
        }

        case 'invalid_date':
            return 'Expected a valid date string (ISO 8601).';

        case 'custom':
            return undefined; // Custom validators already have descriptive messages

        default:
            return undefined;
    }
}

function buildStringSuggestion(issue: IssueInvalidString): string | undefined {
    switch (issue.validation) {
        case 'email':
            return 'Expected: a valid email address (e.g. user@example.com).';
        case 'url':
            return 'Expected: a valid URL (e.g. https://example.com).';
        case 'uuid':
            return 'Expected: a valid UUID (e.g. 123e4567-e89b-12d3-a456-426614174000).';
        case 'cuid':
            return 'Expected: a valid CUID.';
        case 'datetime':
            return 'Expected: an ISO 8601 datetime (e.g. 2024-01-15T10:30:00Z).';
        case 'ip':
            return 'Expected: a valid IP address.';
        case 'emoji':
            return 'Expected: a valid emoji character.';
        case 'regex':
            return 'Value does not match the required pattern.';
        default:
            return undefined;
    }
}

function buildTooSmallSuggestion(issue: IssueTooSmall): string | undefined {
    const bound = issue.inclusive ? '>=' : '>';
    switch (issue.type) {
        case 'string':
            return `Minimum length: ${issue.minimum} character${issue.minimum === 1 ? '' : 's'}.`;
        case 'number':
        case 'bigint':
            return `Must be ${bound} ${issue.minimum}.`;
        case 'array':
            return `Minimum ${issue.minimum} item${issue.minimum === 1 ? '' : 's'}.`;
        case 'date':
            return `Must be after ${new Date(issue.minimum as number).toISOString()}.`;
        default:
            return `Must be ${bound} ${issue.minimum}.`;
    }
}

function buildTooBigSuggestion(issue: IssueTooBig): string | undefined {
    const bound = issue.inclusive ? '<=' : '<';
    switch (issue.type) {
        case 'string':
            return `Maximum length: ${issue.maximum} character${issue.maximum === 1 ? '' : 's'}.`;
        case 'number':
        case 'bigint':
            return `Must be ${bound} ${issue.maximum}.`;
        case 'array':
            return `Maximum ${issue.maximum} item${issue.maximum === 1 ? '' : 's'}.`;
        default:
            return `Must be ${bound} ${issue.maximum}.`;
    }
}

// ── Value Resolution ─────────────────────────────────────

/**
 * Resolve a nested value from an object using a ZodIssue path.
 * Returns undefined if the path doesn't exist.
 */
function resolveValue(
    obj: Record<string, unknown>,
    path: readonly (string | number)[],
): unknown {
    if (path.length === 0) return undefined;
    let current: unknown = obj;
    for (const key of path) {
        if (current === null || current === undefined) return undefined;
        if (typeof current === 'object') {
            current = (current as Record<string | number, unknown>)[key];
        } else {
            return undefined;
        }
    }
    return current;
}

/**
 * Format a sent value for display in the error message.
 * Truncates long strings and handles undefined gracefully.
 */
function formatSentValue(value: unknown): string | undefined {
    if (value === undefined) return '(missing)';
    if (value === null) return 'null';
    if (typeof value === 'string') {
        const truncated = value.length > 50
            ? value.slice(0, 47) + '...'
            : value;
        return `'${truncated}'`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return `array(${value.length})`;
    }
    return JSON.stringify(value).slice(0, 50);
}

// ── Zod Issue Type Narrowing ─────────────────────────────
// These types extract the extra metadata fields that Zod attaches
// to specific issue codes. We cast to these after the switch(issue.code)
// check, so they don't need to extend ZodIssue.

interface IssueInvalidType {
    expected: string;
    received: string;
}

interface IssueInvalidString {
    validation: string;
}

interface IssueTooSmall {
    minimum: number | bigint;
    inclusive: boolean;
    type: string;
}

interface IssueTooBig {
    maximum: number | bigint;
    inclusive: boolean;
    type: string;
}

interface IssueInvalidEnum {
    options: readonly (string | number)[];
    received: string;
}

interface IssueInvalidLiteral {
    expected: unknown;
    received: unknown;
}

interface IssueUnrecognizedKeys {
    keys: string[];
}

