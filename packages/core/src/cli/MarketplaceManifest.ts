/**
 * MarketplaceManifest — Listing Metadata from Code
 *
 * Reads `vurb.marketplace.json` from the project root and normalizes
 * the data into a snake_case payload ready for the Vinkius Cloud API.
 *
 * Features:
 *   - `file:` references — resolve local file contents (e.g. `"file:README.md"`)
 *   - i18n support — `string | Record<locale, string>` for descriptions & FAQs
 *   - Changelog extraction — parses CHANGELOG.md for latest version section
 *   - Publisher type — `official | partner | community` (admin-confirmed)
 *
 * @module
 */
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// ============================================================================
// Constants
// ============================================================================

/** Default manifest filename, committed alongside code (not gitignored). */
export const MARKETPLACE_MANIFEST_FILE = 'vurb.marketplace.json' as const;

// ============================================================================
// Types
// ============================================================================

/** A string value or an i18n map keyed by ISO 639-1 locale (`en` required). */
export type I18nString = string | Record<string, string>;

/** A single FAQ entry with i18n-capable question and answer. */
export interface MarketplaceFaq {
    readonly question: I18nString;
    readonly answer: I18nString;
}

/** Pricing configuration for paid listings. */
export interface MarketplacePricing {
    readonly priceCents: number;
    readonly subscriberRequestLimit: number;
    readonly trialRequests?: number;
    readonly maxSubscribers?: number;
}

/**
 * Marketplace manifest — listing metadata declared in code.
 *
 * Every field maps to a column or relation on the `MarketplaceListing` model.
 * The `en` locale is always required as the canonical fallback.
 */
export interface MarketplaceManifest {
    /** Listing title (max 120 chars). */
    readonly title: string;

    /** Short description — plain string or i18n map (max 300 chars per locale). */
    readonly shortDescription: I18nString;

    /**
     * Long description (markdown) — plain string, i18n map, or `file:` reference.
     * Supports `"file:README.md"` per locale.
     */
    readonly longDescription?: I18nString;

    /** Category slugs (max 3). */
    readonly categories?: readonly string[];

    /** Tags (max 10, each max 40 chars). */
    readonly tags?: readonly string[];

    /** Icon URL. */
    readonly iconUrl?: string;

    /** Cover image URL. */
    readonly coverImageUrl?: string;

    /** Preview video URL. */
    readonly previewVideoUrl?: string;

    /** Listing type. */
    readonly listingType?: 'paid' | 'free';

    /** Visibility. */
    readonly visibility?: 'public' | 'invite_only';

    /** Publisher classification (admin confirms during moderation review). */
    readonly publisherType?: 'official' | 'partner' | 'community';

    /** Pricing config (required when listingType is 'paid'). */
    readonly pricing?: MarketplacePricing;

    /**
     * FAQs — auto-synced to `listing_faqs` table.
     * Each entry supports i18n for question and answer.
     */
    readonly faqs?: readonly MarketplaceFaq[];

    /**
     * Changelog — `"file:CHANGELOG.md"` or inline markdown.
     * The CLI extracts the latest version section and sends it as `changelog_excerpt`.
     */
    readonly changelog?: string;

    /**
     * SaaS/platform this MCP server integrates with.
     * Displayed as the integration identity card on the listing page.
     */
    readonly integration?: {
        /** Name of the SaaS platform (e.g. "Acuity Scheduling"). */
        readonly name: string;
        /** URL of the SaaS platform (e.g. "https://acuityscheduling.com"). */
        readonly url: string;
        /** Short description of what the SaaS does — plain string or i18n map. */
        readonly description?: I18nString;
        /** URL to the SaaS's official logo. */
        readonly logoUrl?: string;
    };

    /** Link to integration documentation. */
    readonly documentationUrl?: string;

    /** Link to support channel. */
    readonly supportUrl?: string;

    /** Link to source code repository (e.g. GitHub). */
    readonly sourceCodeUrl?: string;

    /** MCP clients this server is tested/compatible with. */
    readonly compatibility?: readonly string[];
}

// ============================================================================
// Reader
// ============================================================================

/**
 * Read `vurb.marketplace.json` from the project root.
 *
 * - Returns `null` if the file doesn't exist (marketplace is optional).
 * - Resolves all `file:` references to actual file contents.
 * - Throws on malformed JSON or unresolvable file references.
 *
 * @param cwd - Project root directory
 */
export function readMarketplaceManifest(cwd: string): MarketplaceManifest | null {
    const manifestPath = resolve(cwd, MARKETPLACE_MANIFEST_FILE);
    if (!existsSync(manifestPath)) return null;

    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as MarketplaceManifest;

    // Validate required fields
    if (!parsed.title || typeof parsed.title !== 'string') {
        throw new Error(`${MARKETPLACE_MANIFEST_FILE}: "title" is required and must be a string.`);
    }
    if (!parsed.shortDescription) {
        throw new Error(`${MARKETPLACE_MANIFEST_FILE}: "shortDescription" is required.`);
    }

    // Resolve file: references in i18n fields
    const resolved: Record<string, unknown> = { ...parsed };

    if (parsed.longDescription) {
        resolved['longDescription'] = resolveI18nFileRefs(parsed.longDescription, cwd);
    }
    if (parsed.changelog) {
        try {
            resolved['changelog'] = resolveFileRef(parsed.changelog, cwd);
        } catch {
            // Changelog is optional — skip silently when the referenced file is missing.
            delete resolved['changelog'];
        }
    }

    // Resolve file: references in FAQ answers
    if (parsed.faqs && Array.isArray(parsed.faqs)) {
        resolved['faqs'] = (parsed.faqs as MarketplaceFaq[]).map(faq => ({
            question: faq.question,
            answer: resolveI18nFileRefs(faq.answer, cwd),
        }));
    }

    return resolved as unknown as MarketplaceManifest;
}

// ============================================================================
// Normalizer (camelCase → snake_case API payload)
// ============================================================================

/**
 * Normalize a `MarketplaceManifest` into the snake_case payload
 * expected by the Vinkius Cloud `EdgeDeployController`.
 *
 * - Extracts canonical `en` value for non-i18n columns.
 * - Builds `_i18n` maps for multilingual fields.
 * - Extracts latest changelog section.
 */
export function normalizeMarketplacePayload(
    manifest: MarketplaceManifest,
): Record<string, unknown> {
    const { canonical: shortDesc, i18n: shortDescI18n } = extractI18n(manifest.shortDescription);
    const { canonical: longDesc, i18n: longDescI18n } = manifest.longDescription
        ? extractI18n(manifest.longDescription)
        : { canonical: null, i18n: null };

    const payload: Record<string, unknown> = {
        title: manifest.title,
        short_description: shortDesc,
        long_description: longDesc,
    };

    // Only include i18n maps when they have more than just `en`
    if (shortDescI18n && Object.keys(shortDescI18n).length > 1) {
        payload['short_description_i18n'] = shortDescI18n;
    }
    if (longDescI18n && Object.keys(longDescI18n).length > 1) {
        payload['long_description_i18n'] = longDescI18n;
    }

    if (manifest.categories) payload['categories'] = manifest.categories;
    if (manifest.tags) payload['tags'] = manifest.tags;
    if (manifest.iconUrl) payload['icon_url'] = manifest.iconUrl;
    if (manifest.coverImageUrl) payload['cover_image_url'] = manifest.coverImageUrl;
    if (manifest.previewVideoUrl) payload['preview_video_url'] = manifest.previewVideoUrl;
    if (manifest.listingType) payload['listing_type'] = manifest.listingType;
    if (manifest.visibility) payload['visibility'] = manifest.visibility;
    if (manifest.publisherType) payload['publisher_type'] = manifest.publisherType;

    // Pricing
    if (manifest.pricing) {
        payload['price_cents'] = manifest.pricing.priceCents;
        payload['subscriber_request_limit'] = manifest.pricing.subscriberRequestLimit;
        if (manifest.pricing.trialRequests !== undefined) {
            payload['trial_requests'] = manifest.pricing.trialRequests;
        }
        if (manifest.pricing.maxSubscribers !== undefined) {
            payload['max_subscribers'] = manifest.pricing.maxSubscribers;
        }
    }

    // FAQs
    if (manifest.faqs && manifest.faqs.length > 0) {
        payload['faqs'] = manifest.faqs.map(faq => {
            const { canonical: q, i18n: qI18n } = extractI18n(faq.question);
            const { canonical: a, i18n: aI18n } = extractI18n(faq.answer);
            const entry: Record<string, unknown> = { question: q, answer: a };
            if (qI18n && Object.keys(qI18n).length > 1) entry['question_i18n'] = qI18n;
            if (aI18n && Object.keys(aI18n).length > 1) entry['answer_i18n'] = aI18n;
            return entry;
        });
    }

    // Changelog — extract latest version section
    if (manifest.changelog) {
        payload['changelog_excerpt'] = extractLatestChangelog(manifest.changelog);
    }

    // SaaS integration identity
    if (manifest.integration) {
        const integration: Record<string, unknown> = {
            name: manifest.integration.name,
            url: manifest.integration.url,
        };
        if (manifest.integration.logoUrl) {
            integration['logo_url'] = manifest.integration.logoUrl;
        }
        if (manifest.integration.description) {
            const { canonical: desc } = extractI18n(manifest.integration.description);
            integration['description'] = desc;
        }
        payload['integration'] = integration;
    }

    if (manifest.documentationUrl) payload['documentation_url'] = manifest.documentationUrl;
    if (manifest.supportUrl) payload['support_url'] = manifest.supportUrl;
    if (manifest.sourceCodeUrl) payload['source_code_url'] = manifest.sourceCodeUrl;
    if (manifest.compatibility) payload['compatibility'] = manifest.compatibility;

    return payload;
}

// ============================================================================
// Changelog Parser
// ============================================================================

/**
 * Extract the most recent version section from a CHANGELOG.md string.
 *
 * Looks for `## [x.y.z]` or `## x.y.z` headings and returns everything
 * from the first heading to the start of the next heading (or EOF).
 *
 * @returns The latest changelog section, or the full text if no headings found.
 */
export function extractLatestChangelog(content: string): string {
    const lines = content.split('\n');
    let start = -1;
    let end = lines.length;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // Match: ## [1.0.0], ## 1.0.0, ## [1.0.0] - 2026-03-27
        if (/^##\s+(\[?\d+\.\d+)/.test(line)) {
            if (start === -1) {
                start = i;
            } else {
                end = i;
                break;
            }
        }
    }

    if (start === -1) {
        // No version headings found — return first 500 chars
        return content.slice(0, 500).trim();
    }

    return lines.slice(start, end).join('\n').trim();
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Resolve a single `file:` reference to file contents.
 * If the value doesn't start with `file:`, returns it unchanged.
 * @internal
 */
function resolveFileRef(value: string, cwd: string): string {
    if (!value.startsWith('file:')) return value;

    const filePath = resolve(cwd, value.slice(5));
    if (!existsSync(filePath)) {
        throw new Error(
            `${MARKETPLACE_MANIFEST_FILE}: file reference "${value}" not found at ${filePath}`,
        );
    }
    return readFileSync(filePath, 'utf-8');
}

/**
 * Resolve `file:` references in an I18nString (string or locale map).
 * @internal
 */
function resolveI18nFileRefs(value: I18nString, cwd: string): I18nString {
    if (typeof value === 'string') {
        return resolveFileRef(value, cwd);
    }
    const resolved: Record<string, string> = {};
    for (const [locale, text] of Object.entries(value)) {
        resolved[locale] = resolveFileRef(text, cwd);
    }
    return resolved;
}

/**
 * Extract the canonical `en` value and the full i18n map from an I18nString.
 *
 * - Plain string → `{ canonical: value, i18n: null }`
 * - Locale map → `{ canonical: map.en, i18n: map }`
 *
 * @internal
 */
function extractI18n(value: I18nString): { canonical: string; i18n: Record<string, string> | null } {
    if (typeof value === 'string') {
        return { canonical: value, i18n: null };
    }

    const en = value['en'];
    if (!en) {
        throw new Error(
            `${MARKETPLACE_MANIFEST_FILE}: i18n object must include an "en" locale as canonical fallback.`,
        );
    }

    return { canonical: en, i18n: value };
}
