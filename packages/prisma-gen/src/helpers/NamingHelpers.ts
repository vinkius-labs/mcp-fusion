/**
 * NamingHelpers — Case conversion and pluralization utilities
 *
 * Reuses patterns from openapi-gen's TemplateHelpers.
 *
 * @module
 */

// ── Case Conversion ──────────────────────────────────────

/**
 * Convert PascalCase or camelCase to snake_case.
 * @example toSnakeCase('UserProfile') → 'user_profile'
 */
export function toSnakeCase(str: string): string {
    return str
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase();
}

/**
 * Ensure PascalCase.
 * @example toPascalCase('user_profile') → 'UserProfile'
 */
export function toPascalCase(str: string): string {
    return str
        .replace(/(^|_)([a-z])/g, (_m, _p, c: string) => c.toUpperCase());
}

/**
 * Simple English pluralize (covers common cases).
 * @example pluralize('User') → 'Users'
 * @example pluralize('Company') → 'Companies'
 */
export function pluralize(str: string): string {
    if (str.endsWith('s') || str.endsWith('x') || str.endsWith('z')
        || str.endsWith('sh') || str.endsWith('ch')) {
        return str + 'es';
    }
    if (str.endsWith('y') && !/[aeiou]y$/i.test(str)) {
        return str.slice(0, -1) + 'ies';
    }
    return str + 's';
}
