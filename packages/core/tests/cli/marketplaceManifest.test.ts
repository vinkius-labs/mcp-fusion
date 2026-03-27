/**
 * Marketplace Manifest — Unit Tests
 *
 * Tests for `readMarketplaceManifest()`, `normalizeMarketplacePayload()`,
 * and `extractLatestChangelog()`.
 *
 * @module
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    readMarketplaceManifest,
    normalizeMarketplacePayload,
    extractLatestChangelog,
    MARKETPLACE_MANIFEST_FILE,
} from '../../src/cli/MarketplaceManifest.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vurb-mkt-test-'));
});

afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(data: Record<string, unknown>): void {
    writeFileSync(resolve(tmpDir, MARKETPLACE_MANIFEST_FILE), JSON.stringify(data));
}

// ── readMarketplaceManifest ──────────────────────────────────────────────────

describe('readMarketplaceManifest', () => {
    it('returns null when file does not exist', () => {
        expect(readMarketplaceManifest(tmpDir)).toBeNull();
    });

    it('parses a valid minimal manifest', () => {
        writeManifest({
            title: 'Test Server',
            shortDescription: 'A test server for unit tests.',
        });
        const result = readMarketplaceManifest(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.title).toBe('Test Server');
        expect(result!.shortDescription).toBe('A test server for unit tests.');
    });

    it('parses i18n shortDescription', () => {
        writeManifest({
            title: 'Test',
            shortDescription: {
                en: 'English desc',
                pt: 'Descrição em português',
            },
        });
        const result = readMarketplaceManifest(tmpDir);
        expect(result!.shortDescription).toEqual({
            en: 'English desc',
            pt: 'Descrição em português',
        });
    });

    it('resolves file: references in longDescription', () => {
        writeFileSync(resolve(tmpDir, 'README.md'), '# Hello World\n\nThis is the readme.');
        writeManifest({
            title: 'Test',
            shortDescription: 'Short',
            longDescription: 'file:README.md',
        });
        const result = readMarketplaceManifest(tmpDir);
        expect(result!.longDescription).toBe('# Hello World\n\nThis is the readme.');
    });

    it('resolves file: references in i18n longDescription', () => {
        writeFileSync(resolve(tmpDir, 'README.md'), 'English readme');
        writeFileSync(resolve(tmpDir, 'README.pt.md'), 'Readme em português');
        writeManifest({
            title: 'Test',
            shortDescription: 'Short',
            longDescription: {
                en: 'file:README.md',
                pt: 'file:README.pt.md',
            },
        });
        const result = readMarketplaceManifest(tmpDir);
        expect(result!.longDescription).toEqual({
            en: 'English readme',
            pt: 'Readme em português',
        });
    });

    it('throws on missing file: reference', () => {
        writeManifest({
            title: 'Test',
            shortDescription: 'Short',
            longDescription: 'file:NONEXISTENT.md',
        });
        expect(() => readMarketplaceManifest(tmpDir)).toThrow('not found');
    });

    it('throws when title is missing', () => {
        writeManifest({ shortDescription: 'Short' });
        expect(() => readMarketplaceManifest(tmpDir)).toThrow('"title" is required');
    });

    it('throws when shortDescription is missing', () => {
        writeManifest({ title: 'Test' });
        expect(() => readMarketplaceManifest(tmpDir)).toThrow('"shortDescription" is required');
    });

    it('parses publisherType', () => {
        writeManifest({
            title: 'Test',
            shortDescription: 'Short',
            publisherType: 'official',
        });
        const result = readMarketplaceManifest(tmpDir);
        expect(result!.publisherType).toBe('official');
    });

    it('resolves changelog file: reference', () => {
        writeFileSync(resolve(tmpDir, 'CHANGELOG.md'), '## [1.0.0]\n\n- Initial release');
        writeManifest({
            title: 'Test',
            shortDescription: 'Short',
            changelog: 'file:CHANGELOG.md',
        });
        const result = readMarketplaceManifest(tmpDir);
        expect(result!.changelog).toBe('## [1.0.0]\n\n- Initial release');
    });
});

// ── normalizeMarketplacePayload ──────────────────────────────────────────────

describe('normalizeMarketplacePayload', () => {
    it('converts camelCase to snake_case', () => {
        const payload = normalizeMarketplacePayload({
            title: 'My Server',
            shortDescription: 'A great server.',
            listingType: 'free',
            visibility: 'public',
            iconUrl: 'https://example.com/icon.png',
            coverImageUrl: 'https://example.com/cover.png',
        });
        expect(payload['title']).toBe('My Server');
        expect(payload['short_description']).toBe('A great server.');
        expect(payload['listing_type']).toBe('free');
        expect(payload['visibility']).toBe('public');
        expect(payload['icon_url']).toBe('https://example.com/icon.png');
        expect(payload['cover_image_url']).toBe('https://example.com/cover.png');
    });

    it('extracts canonical en from i18n shortDescription', () => {
        const payload = normalizeMarketplacePayload({
            title: 'Test',
            shortDescription: {
                en: 'English desc',
                pt: 'Descrição',
            },
        });
        expect(payload['short_description']).toBe('English desc');
        expect(payload['short_description_i18n']).toEqual({
            en: 'English desc',
            pt: 'Descrição',
        });
    });

    it('omits i18n map when only en locale present', () => {
        const payload = normalizeMarketplacePayload({
            title: 'Test',
            shortDescription: { en: 'English only' },
        });
        expect(payload['short_description']).toBe('English only');
        expect(payload['short_description_i18n']).toBeUndefined();
    });

    it('normalizes pricing to snake_case', () => {
        const payload = normalizeMarketplacePayload({
            title: 'Test',
            shortDescription: 'Short',
            listingType: 'paid',
            pricing: {
                priceCents: 999,
                subscriberRequestLimit: 1000,
                trialRequests: 50,
                maxSubscribers: 100,
            },
        });
        expect(payload['price_cents']).toBe(999);
        expect(payload['subscriber_request_limit']).toBe(1000);
        expect(payload['trial_requests']).toBe(50);
        expect(payload['max_subscribers']).toBe(100);
    });

    it('normalizes FAQs with i18n', () => {
        const payload = normalizeMarketplacePayload({
            title: 'Test',
            shortDescription: 'Short',
            faqs: [{
                question: { en: 'What?', pt: 'O quê?' },
                answer: { en: 'This.', pt: 'Isto.' },
            }],
        });
        const faqs = payload['faqs'] as Array<Record<string, unknown>>;
        expect(faqs).toHaveLength(1);
        expect(faqs[0]!['question']).toBe('What?');
        expect(faqs[0]!['answer']).toBe('This.');
        expect(faqs[0]!['question_i18n']).toEqual({ en: 'What?', pt: 'O quê?' });
        expect(faqs[0]!['answer_i18n']).toEqual({ en: 'This.', pt: 'Isto.' });
    });

    it('includes publisher_type', () => {
        const payload = normalizeMarketplacePayload({
            title: 'Test',
            shortDescription: 'Short',
            publisherType: 'partner',
        });
        expect(payload['publisher_type']).toBe('partner');
    });

    it('extracts changelog excerpt', () => {
        const payload = normalizeMarketplacePayload({
            title: 'Test',
            shortDescription: 'Short',
            changelog: '## [2.0.0]\n\n- Breaking change\n\n## [1.0.0]\n\n- Initial',
        });
        expect(payload['changelog_excerpt']).toBe('## [2.0.0]\n\n- Breaking change');
    });
});

// ── extractLatestChangelog ────────────────────────────────────────────────────

describe('extractLatestChangelog', () => {
    it('extracts the latest version section', () => {
        const changelog = [
            '# Changelog',
            '',
            '## [2.1.0] - 2026-03-27',
            '',
            '- Added marketplace manifest',
            '- Added trust score',
            '',
            '## [2.0.0] - 2026-03-20',
            '',
            '- Breaking change',
        ].join('\n');

        const result = extractLatestChangelog(changelog);
        expect(result).toBe('## [2.1.0] - 2026-03-27\n\n- Added marketplace manifest\n- Added trust score');
    });

    it('handles single version', () => {
        const changelog = '## [1.0.0]\n\n- Initial release\n- Feature A';
        expect(extractLatestChangelog(changelog)).toBe('## [1.0.0]\n\n- Initial release\n- Feature A');
    });

    it('handles no version headings', () => {
        const changelog = 'Just some text without version headings.';
        expect(extractLatestChangelog(changelog)).toBe('Just some text without version headings.');
    });

    it('handles unbracketed versions', () => {
        const changelog = '## 3.0.0\n\n- New stuff\n\n## 2.0.0\n\n- Old stuff';
        expect(extractLatestChangelog(changelog)).toBe('## 3.0.0\n\n- New stuff');
    });
});
