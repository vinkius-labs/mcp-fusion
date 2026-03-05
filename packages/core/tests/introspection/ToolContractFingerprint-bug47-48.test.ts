/**
 * Bugs #47 & #48 Regression: ToolContract fingerprint issues
 *
 * Bug #47: `materializeBehavior` condition gate includes `presenterSchemaKeys.size > 0`
 * which causes fingerprint to change from 'none' to 'static:e3b0c44...' (hash of
 * empty string) when Presenter has schema keys but zero static rules.
 * Adding/removing schema keys changes the fingerprint without any rules changing.
 *
 * Bug #48: When any action has `presenterHasContextualRules: true`, fingerprint
 * becomes 'dynamic' and the hash of static rules is skipped. A tool with 2 static
 * actions + 1 dynamic action loses cryptographic coverage of its static rules.
 * Changes to static rules go undetected when dynamic rules coexist.
 *
 * WHY EXISTING TESTS MISSED IT:
 * Bug #20 regression tests (MediumBugs-17-18-19-20-21-22.test.ts) always provide
 * BOTH presenterSchemaKeys AND presenterStaticRules together. Zero tests:
 * - Test schema keys WITHOUT static rules (triggers #47 false positive)
 * - Test `presenterHasContextualRules: true` (dynamic) scenario (triggers #48)
 * - Test mixed static + dynamic actions
 *
 * FIX #47: Condition changed to `staticRuleStrings.length > 0` only.
 * FIX #48: Composite fingerprint `'dynamic:' + hash` preserves static rule
 * coverage alongside the dynamic indicator.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { materializeContract, sha256 } from '../../src/introspection/ToolContract.js';
import type { ActionMetadata, ToolBuilder } from '../../src/core/types.js';

// ── Helpers ──────────────────────────────────────────────

function makeBuilder(metadata: ActionMetadata[]): ToolBuilder<unknown> {
    return {
        getName: () => 'test-tool',
        getTags: () => [],
        getActionNames: () => metadata.map(m => m.key),
        getActionMetadata: () => metadata,
        buildToolDefinition: () => ({
            name: 'test-tool',
            description: 'Test tool',
            inputSchema: { type: 'object' as const, properties: {} },
        }),
    };
}

function makeMetadata(overrides: Partial<ActionMetadata> = {}): ActionMetadata {
    return {
        key: 'get',
        actionName: 'get',
        groupName: undefined,
        description: 'Get items',
        destructive: false,
        idempotent: true,
        readOnly: true,
        requiredFields: [],
        hasMiddleware: false,
        presenterName: undefined,
        presenterSchemaKeys: undefined,
        presenterUiBlockTypes: undefined,
        presenterHasContextualRules: undefined,
        presenterStaticRules: undefined,
        ...overrides,
    };
}

// ── Bug #47 Tests ────────────────────────────────────────

describe('Bug #47 Regression: fingerprint should not include schema keys in condition', () => {

    it('schema keys WITHOUT static rules → fingerprint stays "none"', async () => {
        const meta = [makeMetadata({
            presenterSchemaKeys: ['id', 'name', 'email'],
            // No presenterStaticRules → should stay 'none'
        })];

        const contract = await materializeContract(makeBuilder(meta));

        // CRITICAL: before fix, this was 'static:e3b0c44...' (hash of empty string)
        expect(contract.behavior.systemRulesFingerprint).toBe('none');
    });

    it('adding/removing schema keys does NOT change fingerprint when no rules', async () => {
        const meta1 = [makeMetadata({
            presenterSchemaKeys: ['id', 'name'],
        })];
        const meta2 = [makeMetadata({
            presenterSchemaKeys: ['id', 'name', 'email', 'phone', 'address'],
        })];

        const c1 = await materializeContract(makeBuilder(meta1));
        const c2 = await materializeContract(makeBuilder(meta2));

        // Both should be 'none' since there are no static rules
        expect(c1.behavior.systemRulesFingerprint).toBe('none');
        expect(c2.behavior.systemRulesFingerprint).toBe('none');
    });

    it('schema keys WITH static rules → fingerprint reflects rules only', async () => {
        const meta = [makeMetadata({
            presenterSchemaKeys: ['id', 'name'],
            presenterStaticRules: ['Always use ISO dates'],
        })];

        const contract = await materializeContract(makeBuilder(meta));
        const expected = 'static:' + await sha256('Always use ISO dates');

        expect(contract.behavior.systemRulesFingerprint).toBe(expected);
    });

    it('changing schema keys does NOT change fingerprint when rules are same', async () => {
        const meta1 = [makeMetadata({
            presenterSchemaKeys: ['id', 'name'],
            presenterStaticRules: ['Rule A'],
        })];
        const meta2 = [makeMetadata({
            presenterSchemaKeys: ['id', 'name', 'email', 'phone'],
            presenterStaticRules: ['Rule A'],
        })];

        const c1 = await materializeContract(makeBuilder(meta1));
        const c2 = await materializeContract(makeBuilder(meta2));

        expect(c1.behavior.systemRulesFingerprint).toBe(c2.behavior.systemRulesFingerprint);
    });
});

// ── Bug #48 Tests ────────────────────────────────────────

describe('Bug #48 Regression: static rules preserved when dynamic rules coexist', () => {

    it('dynamic-only actions → fingerprint stays "dynamic"', async () => {
        const meta = [makeMetadata({
            key: 'contextual-action',
            presenterHasContextualRules: true,
            // No static rules
        })];

        const contract = await materializeContract(makeBuilder(meta));

        expect(contract.behavior.systemRulesFingerprint).toBe('dynamic');
    });

    it('mixed static + dynamic → composite fingerprint "dynamic:<hash>"', async () => {
        const meta = [
            makeMetadata({
                key: 'static-action-1',
                presenterStaticRules: ['Rule A', 'Rule B'],
            }),
            makeMetadata({
                key: 'static-action-2',
                presenterStaticRules: ['Rule C'],
            }),
            makeMetadata({
                key: 'dynamic-action',
                presenterHasContextualRules: true,
            }),
        ];

        const contract = await materializeContract(makeBuilder(meta));

        // CRITICAL: before fix, this was just 'dynamic' — static rules were LOST
        const sortedRules = ['Rule A', 'Rule B', 'Rule C'].sort();
        const expectedHash = await sha256(sortedRules.join(','));

        expect(contract.behavior.systemRulesFingerprint).toBe('dynamic:' + expectedHash);
    });

    it('changing static rules in mixed mode changes the fingerprint', async () => {
        const meta1 = [
            makeMetadata({ key: 'a', presenterStaticRules: ['Rule X'] }),
            makeMetadata({ key: 'b', presenterHasContextualRules: true }),
        ];
        const meta2 = [
            makeMetadata({ key: 'a', presenterStaticRules: ['Rule Y'] }), // Changed rule
            makeMetadata({ key: 'b', presenterHasContextualRules: true }),
        ];

        const c1 = await materializeContract(makeBuilder(meta1));
        const c2 = await materializeContract(makeBuilder(meta2));

        // Fingerprints should differ because static rules changed
        expect(c1.behavior.systemRulesFingerprint).not.toBe(
            c2.behavior.systemRulesFingerprint,
        );
        // Both should have 'dynamic:' prefix
        expect(c1.behavior.systemRulesFingerprint).toMatch(/^dynamic:/);
        expect(c2.behavior.systemRulesFingerprint).toMatch(/^dynamic:/);
    });

    it('static-only actions → fingerprint uses "static:" prefix (unchanged behavior)', async () => {
        const meta = [
            makeMetadata({ key: 'a', presenterStaticRules: ['Rule 1'] }),
            makeMetadata({ key: 'b', presenterStaticRules: ['Rule 2'] }),
        ];

        const contract = await materializeContract(makeBuilder(meta));

        expect(contract.behavior.systemRulesFingerprint).toMatch(/^static:/);
        const sortedRules = ['Rule 1', 'Rule 2'].sort();
        const expectedHash = await sha256(sortedRules.join(','));
        expect(contract.behavior.systemRulesFingerprint).toBe('static:' + expectedHash);
    });

    it('duplicate static rules across actions are deduplicated before hashing', async () => {
        const meta1 = [
            makeMetadata({ key: 'a', presenterStaticRules: ['Rule A', 'Rule B'] }),
            makeMetadata({ key: 'b', presenterStaticRules: ['Rule A'] }), // duplicate
        ];
        // Same rules but no duplicate
        const meta2 = [
            makeMetadata({ key: 'a', presenterStaticRules: ['Rule A', 'Rule B'] }),
        ];

        const c1 = await materializeContract(makeBuilder(meta1));
        const c2 = await materializeContract(makeBuilder(meta2));

        // Should produce the same fingerprint since deduplication applies
        expect(c1.behavior.systemRulesFingerprint).toBe(c2.behavior.systemRulesFingerprint);
    });
});
