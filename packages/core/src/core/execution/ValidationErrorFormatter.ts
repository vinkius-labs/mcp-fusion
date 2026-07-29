/**
 * ValidationErrorFormatter — LLM-Friendly Zod Error Translation
 *
 * Translates raw ZodIssue arrays into directive correction prompts
 * that guide the LLM to fix its input on the next call.
 *
 * Instead of returning:
 *   "Validation failed: email: Invalid"
 *
 * It produces structured XML:
 *   <validation_error action="users/create">
 *   <field name="email">Invalid email format. You sent: 'admin@local'. Expected: a valid email address.</field>
 *   <field name="age">Number must be >= 18. You sent: 10.</field>
 *   <recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
 *   </validation_error>
 *
 * This dramatically reduces LLM retry loops by providing actionable,
 * unambiguous correction instructions.
 *
 * Pure-function module: no state, no side effects.
 *
 * @module
 */
import { type ZodIssue } from 'zod';
import { escapeXml, escapeXmlAttr } from '../response.js';

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
    const parts: string[] = [];

    parts.push(`<validation_error action="${escapeXmlAttr(actionKey)}">`);

    for (const issue of issues) {
        const fieldPath = issue.path.length > 0
            ? issue.path.join('.')
            : '(root)';

        const sentValue = resolveValue(sentArgs, issue.path as readonly (string | number)[]);
        const sentHint = formatSentValue(sentValue);
        const suggestion = buildSuggestion(issue);

        let detail = issue.message;
        if (sentHint) {
            detail += ` You sent: ${sentHint}.`;
        }
        if (suggestion) {
            detail += ` ${suggestion}`;
        }

        parts.push(`<field name="${escapeXmlAttr(fieldPath)}">${escapeXml(detail)}</field>`);
    }

    parts.push('<recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>');
    parts.push('</validation_error>');

    return parts.join('\n');
}

// ── Suggestion Builder ───────────────────────────────────

/**
 * Build an actionable suggestion from Zod issue metadata.
 *
 * Each ZodIssueCode has different metadata fields we can use
 * to generate a precise correction hint.
 */
function buildSuggestion(issue: ZodIssue): string | undefined {
    // zod v4: issue codes changed. We cast to `unknown` first then to our
    // narrowing interfaces because the v4 issue shapes differ from v3.
    switch (issue.code) {
        case 'invalid_type':
            return `Expected type: ${(issue as unknown as IssueInvalidType).expected}.`;

        case 'invalid_format':
            return buildStringSuggestion(issue as unknown as IssueInvalidString);

        case 'too_small':
            return buildTooSmallSuggestion(issue as unknown as IssueTooSmall);

        case 'too_big':
            return buildTooBigSuggestion(issue as unknown as IssueTooBig);

        case 'invalid_value': {
            const opts = (issue as unknown as IssueInvalidEnum).values;
            return `Valid options: ${opts.map(o => `'${o}'`).join(', ')}.`;
        }

        case 'invalid_union':
            return `Value didn't match any of the expected formats.`;

        case 'unrecognized_keys': {
            const keys = (issue as unknown as IssueUnrecognizedKeys).keys;
            return `Remove or correct unrecognized fields: ${keys.map(k => `'${k}'`).join(', ')}. Check for typos.`;
        }

        case 'custom':
            return undefined; // Custom validators already have descriptive messages

        default:
            return undefined;
    }
}

function buildStringSuggestion(issue: IssueInvalidString): string | undefined {
    // zod v4: `validation` → `format`
    switch (issue.format) {
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
    // zod v4: `inclusive` is optional (defaults true); `type` → `origin`
    const bound = issue.inclusive !== false ? '>=' : '>';
    switch (issue.origin) {
        case 'string':
            return `Minimum length: ${issue.minimum} character${issue.minimum === 1 ? '' : 's'}.`;
        case 'number':
        case 'int':
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
    // zod v4: `inclusive` is optional (defaults true); `type` → `origin`
    const bound = issue.inclusive !== false ? '<=' : '<';
    switch (issue.origin) {
        case 'string':
            return `Maximum length: ${issue.maximum} character${issue.maximum === 1 ? '' : 's'}.`;
        case 'number':
        case 'int':
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
//
// zod v4 notes:
// - $ZodIssueInvalidType no longer has `received`
// - $ZodIssueTooSmall/TooBig use `origin` instead of `type`; `inclusive` is optional
// - `invalid_string` → `invalid_format` (uses `format` instead of `validation`)
// - `invalid_enum_value` → `invalid_value` (uses `values` instead of `options`)
// - `invalid_literal` and `invalid_date` codes were removed

interface IssueInvalidType {
    expected: string;
}

interface IssueInvalidString {
    format: string;
}

interface IssueTooSmall {
    minimum: number | bigint;
    inclusive?: boolean;
    origin: string;
}

interface IssueTooBig {
    maximum: number | bigint;
    inclusive?: boolean;
    origin: string;
}

interface IssueInvalidEnum {
    values: readonly (string | number)[];
}

interface IssueUnrecognizedKeys {
    keys: string[];
}

