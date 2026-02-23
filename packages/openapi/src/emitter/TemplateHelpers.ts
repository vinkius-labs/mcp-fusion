/**
 * TemplateHelpers — Code Generation Utilities
 *
 * Pure string manipulation helpers for the code emitter.
 * Zero runtime dependencies.
 *
 * @module
 */

// ── Case Converters ──────────────────────────────────────

/**
 * Convert a camelCase or PascalCase string to snake_case.
 *
 * @example
 * toSnakeCase('getPetById')   → 'get_pet_by_id'
 * toSnakeCase('findPetsByTags') → 'find_pets_by_tags'
 * toSnakeCase('addPet')       → 'add_pet'
 */
export function toSnakeCase(str: string): string {
    return str
        // Insert underscore before uppercase letters (camelCase boundaries)
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        // Insert underscore between consecutive uppercase followed by lowercase
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase()
        // Collapse multiple underscores
        .replace(/_+/g, '_')
        // Trim leading/trailing underscores
        .replace(/^_|_$/g, '');
}

/**
 * Convert a string to PascalCase.
 *
 * @example
 * toPascalCase('pet')          → 'Pet'
 * toPascalCase('user-account') → 'UserAccount'
 * toPascalCase('find_pets')    → 'FindPets'
 */
export function toPascalCase(str: string): string {
    return str
        .split(/[-_\s.]+/)
        .filter(Boolean)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
        .join('');
}

/**
 * Convert a string to camelCase.
 *
 * @example
 * toCamelCase('pet_store')  → 'petStore'
 * toCamelCase('user-name')  → 'userName'
 */
export function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// ── Code Formatting ──────────────────────────────────────

/**
 * Indent every line of a string by the specified number of spaces.
 */
export function indent(code: string, spaces: number): string {
    const pad = ' '.repeat(spaces);
    return code
        .split('\n')
        .map(line => line.length > 0 ? pad + line : line)
        .join('\n');
}

/**
 * Escape a string for use inside single-quoted TypeScript literals.
 */
export function escapeTs(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

/**
 * Build a URL template expression for fetch calls.
 * Replaces OpenAPI `{param}` with `${args.param}`.
 *
 * @example
 * buildUrlTemplate('/pet/{petId}')  → '`${ctx.baseUrl}/pet/${args.petId}`'
 */
export function buildUrlTemplate(path: string, baseUrlExpr = 'ctx.baseUrl'): string {
    const interpolated = path.replace(/\{([^}]+)\}/g, (_match, name: string) => `\${args.${name}}`);
    return `\`\${${baseUrlExpr}}${interpolated}\``;
}

// ── File Naming (MVA Convention) ─────────────────────────
//
//   Model  → models/{tag}.schema.ts
//   View   → views/{tag}.presenter.ts
//   Tool   → agents/{tag}.tool.ts      (Agent layer — MCP delivery)
//

/**
 * Generate the Schema (Model) file path for a tag.
 * @example 'pet' → 'models/pet.schema.ts'
 */
export function schemaFileName(tag: string): string {
    return `models/${tag.toLowerCase()}.schema.ts`;
}

/**
 * Generate the Presenter (View) file path for a tag.
 * @example 'pet' → 'views/pet.presenter.ts'
 */
export function presenterFileName(tag: string): string {
    return `views/${tag.toLowerCase()}.presenter.ts`;
}

/**
 * Generate the Tool file path for a tag.
 * @example 'pet' → 'agents/pet.tool.ts'
 */
export function toolFileName(tag: string): string {
    return `agents/${tag.toLowerCase()}.tool.ts`;
}
