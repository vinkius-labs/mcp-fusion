/**
 * EntitlementScanner — Unit Tests
 *
 * Dedicated tests for static analysis of handler source code:
 * - scanSource: pattern-based I/O capability detection
 * - scanEvasionIndicators: obfuscation and bypass detection
 * - buildEntitlements: aggregation from matches
 * - validateClaims: policy violation detection
 * - scanAndValidate: full pipeline
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import {
    scanSource,
    scanEvasionIndicators,
    buildEntitlements,
    validateClaims,
    scanAndValidate,
} from '../../src/introspection/EntitlementScanner.js';
import type {
    EntitlementClaims,
} from '../../src/introspection/EntitlementScanner.js';

// ============================================================================
// 1 · scanSource — I/O capability detection
// ============================================================================

describe('scanSource', () => {
    it('detects fs import (CJS)', () => {
        const source = `const fs = require('fs');`;
        const matches = scanSource(source);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some(m => m.category === 'filesystem')).toBe(true);
    });

    it('detects fs import (ESM)', () => {
        const source = `import fs from 'fs';`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'filesystem')).toBe(true);
    });

    it('detects node: prefixed fs import', () => {
        const source = `import { readFile } from 'node:fs/promises';`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'filesystem')).toBe(true);
    });

    it('detects fetch call', () => {
        const source = `const resp = await fetch('https://example.com');`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'network')).toBe(true);
        expect(matches.some(m => m.identifier === 'fetch')).toBe(true);
    });

    it('detects http module import', () => {
        const source = `import http from 'http';`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'network')).toBe(true);
    });

    it('detects child_process import', () => {
        const source = `const { exec } = require('child_process');`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'subprocess')).toBe(true);
    });

    it('detects exec call', () => {
        const source = `exec('ls -la');`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'subprocess')).toBe(true);
    });

    it('detects spawn call', () => {
        const source = `spawn('node', ['script.js']);`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'subprocess')).toBe(true);
    });

    it('detects crypto import', () => {
        const source = `import crypto from 'crypto';`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'crypto')).toBe(true);
    });

    it('detects eval call', () => {
        const source = `eval('console.log(1)');`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'codeEvaluation')).toBe(true);
    });

    it('detects Function constructor', () => {
        const source = `new Function('return 1')();`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'codeEvaluation')).toBe(true);
    });

    it('detects multiple categories in one file', () => {
        const source = `
            import fs from 'fs';
            const resp = await fetch('https://api.example.com');
            exec('rm -rf /');
        `;
        const matches = scanSource(source);
        const categories = new Set(matches.map(m => m.category));
        expect(categories.has('filesystem')).toBe(true);
        expect(categories.has('network')).toBe(true);
        expect(categories.has('subprocess')).toBe(true);
    });

    it('returns empty array for safe source', () => {
        const source = `
            function add(a, b) { return a + b; }
            const result = add(1, 2);
            console.log(result);
        `;
        const matches = scanSource(source);
        expect(matches).toHaveLength(0);
    });

    it('returns line numbers for matches', () => {
        const source = `const x = 1;\nconst y = await fetch('/api');\nconst z = 3;`;
        const matches = scanSource(source);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0]!.line).toBe(2);
    });

    it('handles empty source', () => {
        const matches = scanSource('');
        expect(matches).toHaveLength(0);
    });

    it('detects writeFileSync', () => {
        const source = `writeFileSync('/tmp/out', data);`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'filesystem')).toBe(true);
    });

    it('detects XMLHttpRequest', () => {
        const source = `new XMLHttpRequest();`;
        const matches = scanSource(source);
        expect(matches.some(m => m.category === 'network')).toBe(true);
    });
});

// ============================================================================
// 2 · scanEvasionIndicators — obfuscation detection
// ============================================================================

describe('scanEvasionIndicators', () => {
    it('detects String.fromCharCode', () => {
        const source = `const x = String.fromCharCode(114, 101, 113);`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators.some(i => i.type === 'string-construction')).toBe(true);
    });

    it('detects bracket-notation on global object', () => {
        const source = `const fn = globalThis['require'];`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators.some(i => i.type === 'indirect-access')).toBe(true);
    });

    it('detects bracket-notation on process', () => {
        const source = `process['binding']('fs');`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators.some(i => i.type === 'indirect-access')).toBe(true);
    });

    it('detects dynamic import with variable', () => {
        const source = `const mod = await import(moduleName);`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators.some(i => i.type === 'computed-import')).toBe(true);
    });

    it('does not flag static import', () => {
        const source = `import fs from 'fs';`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators.some(i => i.type === 'computed-import')).toBe(false);
    });

    it('returns empty array for clean source', () => {
        const source = `function add(a, b) { return a + b; }`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators).toHaveLength(0);
    });

    it('returns line numbers', () => {
        const source = `const a = 1;\nconst x = String.fromCharCode(104);`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators.length).toBeGreaterThan(0);
        expect(indicators[0]!.line).toBe(2);
    });

    it('includes confidence level', () => {
        const source = `String.fromCharCode(72, 101, 108);`;
        const indicators = scanEvasionIndicators(source);
        expect(indicators.length).toBeGreaterThan(0);
        expect(['low', 'medium', 'high']).toContain(indicators[0]!.confidence);
    });

    it('handles empty source', () => {
        const indicators = scanEvasionIndicators('');
        expect(indicators).toHaveLength(0);
    });
});

// ============================================================================
// 3 · buildEntitlements — aggregation
// ============================================================================

describe('buildEntitlements', () => {
    it('aggregates filesystem matches into entitlements', () => {
        const matches = [
            { category: 'filesystem' as const, identifier: 'fs', pattern: '', context: '', line: 1 },
            { category: 'filesystem' as const, identifier: 'readFile', pattern: '', context: '', line: 2 },
        ];
        const entitlements = buildEntitlements(matches);
        expect(entitlements.filesystem).toBe(true);
        expect(entitlements.network).toBe(false);
        expect(entitlements.subprocess).toBe(false);
        expect(entitlements.crypto).toBe(false);
        expect(entitlements.codeEvaluation).toBe(false);
    });

    it('aggregates multiple categories', () => {
        const matches = [
            { category: 'filesystem' as const, identifier: 'fs', pattern: '', context: '', line: 1 },
            { category: 'network' as const, identifier: 'fetch', pattern: '', context: '', line: 2 },
            { category: 'subprocess' as const, identifier: 'exec', pattern: '', context: '', line: 3 },
        ];
        const entitlements = buildEntitlements(matches);
        expect(entitlements.filesystem).toBe(true);
        expect(entitlements.network).toBe(true);
        expect(entitlements.subprocess).toBe(true);
    });

    it('returns all-false for empty matches', () => {
        const entitlements = buildEntitlements([]);
        expect(entitlements.filesystem).toBe(false);
        expect(entitlements.network).toBe(false);
        expect(entitlements.subprocess).toBe(false);
        expect(entitlements.crypto).toBe(false);
        expect(entitlements.codeEvaluation).toBe(false);
    });

    it('deduplicates identifiers in raw list', () => {
        const matches = [
            { category: 'network' as const, identifier: 'fetch', pattern: '', context: '', line: 1 },
            { category: 'network' as const, identifier: 'fetch', pattern: '', context: '', line: 5 },
        ];
        const entitlements = buildEntitlements(matches);
        expect(entitlements.raw).toEqual(['fetch']);
    });

    it('sorts raw identifiers', () => {
        const matches = [
            { category: 'network' as const, identifier: 'fetch', pattern: '', context: '', line: 1 },
            { category: 'filesystem' as const, identifier: 'createWriteStream', pattern: '', context: '', line: 2 },
            { category: 'subprocess' as const, identifier: 'exec', pattern: '', context: '', line: 3 },
        ];
        const entitlements = buildEntitlements(matches);
        expect(entitlements.raw).toEqual(['createWriteStream', 'exec', 'fetch']);
    });
});

// ============================================================================
// 4 · validateClaims — policy violations
// ============================================================================

describe('validateClaims', () => {
    it('readOnly + filesystem write detection → violation', () => {
        const matches = [
            { category: 'filesystem' as const, identifier: 'writeFileSync', pattern: '', context: '', line: 1 },
        ];
        const claims: EntitlementClaims = { readOnly: true };
        const violations = validateClaims(matches, claims);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations.some(v => v.severity === 'error')).toBe(true);
    });

    it('no violations for matching claims', () => {
        const matches = [
            { category: 'filesystem' as const, identifier: 'readFile', pattern: '', context: '', line: 1 },
        ];
        const claims: EntitlementClaims = {
            readOnly: false,
            allowed: ['filesystem'],
        };
        const violations = validateClaims(matches, claims);
        expect(violations.every(v => v.severity !== 'error')).toBe(true);
    });

    it('readOnly + network → warning', () => {
        const matches = [
            { category: 'network' as const, identifier: 'fetch', pattern: '', context: '', line: 1 },
        ];
        const claims: EntitlementClaims = { readOnly: true };
        const violations = validateClaims(matches, claims);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations.some(v => v.severity === 'warning')).toBe(true);
    });

    it('empty claims with no matches → no violations', () => {
        const violations = validateClaims([], {});
        expect(violations).toHaveLength(0);
    });

    it('non-destructive + subprocess → warning', () => {
        const matches = [
            { category: 'subprocess' as const, identifier: 'exec', pattern: '', context: '', line: 1 },
        ];
        const claims: EntitlementClaims = { destructive: false };
        const violations = validateClaims(matches, claims);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations.some(v => v.severity === 'warning')).toBe(true);
    });
});

// ============================================================================
// 5 · scanAndValidate — full pipeline
// ============================================================================

describe('scanAndValidate', () => {
    it('full pipeline: safe code returns safe=true', () => {
        const source = `function add(a, b) { return a + b; }`;
        const report = scanAndValidate(source);
        expect(report.safe).toBe(true);
        expect(report.matches).toHaveLength(0);
        expect(report.violations).toHaveLength(0);
        expect(report.evasionIndicators).toHaveLength(0);
    });

    it('full pipeline: filesystem + readOnly claim → not safe', () => {
        const source = `import fs from 'fs';\nwriteFileSync('/tmp/x', 'data');`;
        const report = scanAndValidate(source, { readOnly: true });
        expect(report.safe).toBe(false);
        expect(report.entitlements.filesystem).toBe(true);
    });

    it('full pipeline: evasion indicators → not safe', () => {
        const source = `const fn = String.fromCharCode(114, 101, 113, 117, 105, 114, 101);`;
        const report = scanAndValidate(source);
        expect(report.evasionIndicators.length).toBeGreaterThan(0);
        expect(report.safe).toBe(false);
    });

    it('report includes summary string', () => {
        const source = `const resp = await fetch('/api');`;
        const report = scanAndValidate(source);
        expect(report.summary).toBeTruthy();
        expect(typeof report.summary).toBe('string');
    });

    it('report includes all fields', () => {
        const report = scanAndValidate('// safe code');
        expect(report).toHaveProperty('entitlements');
        expect(report).toHaveProperty('matches');
        expect(report).toHaveProperty('violations');
        expect(report).toHaveProperty('evasionIndicators');
        expect(report).toHaveProperty('safe');
        expect(report).toHaveProperty('summary');
    });

    it('multiple categories detected in combined source', () => {
        const source = `
            import fs from 'fs';
            const r = await fetch('/api');
            exec('echo test');
            eval('1+1');
        `;
        const report = scanAndValidate(source);
        expect(report.entitlements.filesystem).toBe(true);
        expect(report.entitlements.network).toBe(true);
        expect(report.entitlements.subprocess).toBe(true);
        expect(report.entitlements.codeEvaluation).toBe(true);
    });
});
