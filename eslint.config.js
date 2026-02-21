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
            // Enforce no unused variables (error-level)
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            // Disallow explicit `any`
            '@typescript-eslint/no-explicit-any': 'warn',
            // Prefer `as const` over literal type assertions
            '@typescript-eslint/prefer-as-const': 'error',
            // No empty functions
            '@typescript-eslint/no-empty-function': 'warn',
        },
    },
    {
        ignores: ['dist/', 'node_modules/', 'tests/', '*.config.*'],
    },
);
