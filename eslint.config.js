import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // ── Strict Type Safety ──
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/prefer-as-const': 'error',
            '@typescript-eslint/no-empty-function': 'warn',

            // ── Type-Aware Rules (require projectService) ──
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'warn',

            // ── Module Boundary Safety ──
            '@typescript-eslint/explicit-module-boundary-types': 'error',

            // ── Boolean Precision ──
            '@typescript-eslint/strict-boolean-expressions': ['error', {
                allowNullableBoolean: true,
                allowNullableString: true,
                allowNullableNumber: false,
                allowNullableObject: true,
                allowAny: false,
            }],

            // ── Import Consistency ──
            '@typescript-eslint/consistent-type-imports': ['error', {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports',
            }],
            '@typescript-eslint/consistent-type-exports': ['error', {
                fixMixedExportsWithInlineTypeSpecifier: true,
            }],
        },
    },
    {
        ignores: ['dist/', 'node_modules/', 'tests/', '*.config.*'],
    },
);
