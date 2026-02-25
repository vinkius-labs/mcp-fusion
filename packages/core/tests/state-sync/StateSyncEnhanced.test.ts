import { describe, it, expect, vi } from 'vitest';
import { StateSyncLayer } from '../../src/state-sync/StateSyncLayer.js';
import { detectOverlaps } from '../../src/state-sync/PolicyValidator.js';
import { success, toolError } from '../../src/core/response.js';
import type { InvalidationEvent, ResourceNotification } from '../../src/state-sync/types.js';

// ============================================================================
// StateSyncLayer — Observability Hook (onInvalidation)
// ============================================================================

describe('StateSyncLayer — onInvalidation hook', () => {
    it('should fire onInvalidation when causal invalidation triggers', () => {
        const events: InvalidationEvent[] = [];

        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.invoices.*', 'reports.balance'] },
            ],
            onInvalidation: (event) => events.push(event),
        });

        const result = success('Payment processed');
        layer.decorateResult('billing.pay', result);

        expect(events).toHaveLength(1);
        expect(events[0].causedBy).toBe('billing.pay');
        expect(events[0].patterns).toEqual(['billing.invoices.*', 'reports.balance']);
        expect(events[0].timestamp).toBeDefined();
    });

    it('should NOT fire onInvalidation when tool returns error', () => {
        const events: InvalidationEvent[] = [];

        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.invoices.*'] },
            ],
            onInvalidation: (event) => events.push(event),
        });

        const result = toolError('PAYMENT_FAILED', { message: 'Insufficient funds' });
        layer.decorateResult('billing.pay', result);

        expect(events).toHaveLength(0);
    });

    it('should NOT fire onInvalidation when no policy matches', () => {
        const events: InvalidationEvent[] = [];

        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.invoices.*'] },
            ],
            onInvalidation: (event) => events.push(event),
        });

        const result = success('Listed items');
        layer.decorateResult('billing.list', result);

        expect(events).toHaveLength(0);
    });

    it('should survive observer exceptions without breaking the pipeline', () => {
        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.*'] },
            ],
            onInvalidation: () => { throw new Error('Observer crash'); },
        });

        const result = success('Payment processed');
        const decorated = layer.decorateResult('billing.pay', result);

        // Should still return the decorated result
        expect(decorated.content[0].text).toContain('cache_invalidation');
    });
});

// ============================================================================
// StateSyncLayer — Protocol Notification Sink
// ============================================================================

describe('StateSyncLayer — notificationSink', () => {
    it('should emit notifications/resources/updated for each pattern', () => {
        const notifications: ResourceNotification[] = [];

        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.invoices.*', 'reports.balance'] },
            ],
            notificationSink: (n) => { notifications.push(n); },
        });

        const result = success('OK');
        layer.decorateResult('billing.pay', result);

        expect(notifications).toHaveLength(2);
        expect(notifications[0].method).toBe('notifications/resources/updated');
        expect(notifications[0].params.uri).toBe('fusion://stale/billing.invoices.*');
        expect(notifications[1].params.uri).toBe('fusion://stale/reports.balance');
    });

    it('should NOT emit notifications on error responses', () => {
        const notifications: ResourceNotification[] = [];

        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.*'] },
            ],
            notificationSink: (n) => { notifications.push(n); },
        });

        const result = toolError('ERROR', { message: 'Failed' });
        layer.decorateResult('billing.pay', result);

        expect(notifications).toHaveLength(0);
    });

    it('should survive sink exceptions without breaking the pipeline', () => {
        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.*'] },
            ],
            notificationSink: () => { throw new Error('Sink crash'); },
        });

        const result = success('OK');
        const decorated = layer.decorateResult('billing.pay', result);

        expect(decorated.content[0].text).toContain('cache_invalidation');
    });

    it('should survive async sink rejections without unhandled promise rejection', async () => {
        const layer = new StateSyncLayer({
            policies: [
                { match: 'billing.pay', invalidates: ['billing.*'] },
            ],
            notificationSink: () => Promise.reject(new Error('Async sink crash')),
        });

        const result = success('OK');
        const decorated = layer.decorateResult('billing.pay', result);

        expect(decorated.content[0].text).toContain('cache_invalidation');

        // Give the microtask queue time to process the rejected promise
        await new Promise(resolve => setTimeout(resolve, 10));
        // If the fix is correct, no unhandledRejection crashes the process
    });
});

// ============================================================================
// ResponseDecorator — XML Attribute Escaping
// ============================================================================

describe('ResponseDecorator — XML attribute escaping', () => {
    it('should escape cause and domains attributes', async () => {
        const { decorateResponse } = await import('../../src/state-sync/ResponseDecorator.js');
        const base = success('OK');
        const decorated = decorateResponse(base, ['billing.*'], 'tool<"evil">');

        const text = decorated.content[0].text;
        expect(text).toContain('cause="tool&lt;&quot;evil&quot;&gt;"');
        expect(text).not.toContain('cause="tool<"evil">"');
    });
});

// ============================================================================
// detectOverlaps — Policy Overlap Detection
// ============================================================================

describe('detectOverlaps()', () => {
    it('should detect when a wildcard pattern shadows a specific one', () => {
        const warnings = detectOverlaps([
            { match: 'sprints.*', cacheControl: 'no-store' },
            { match: 'sprints.update', invalidates: ['sprints.*'] },
        ]);

        expect(warnings).toHaveLength(1);
        expect(warnings[0].shadowingIndex).toBe(0);
        expect(warnings[0].shadowedIndex).toBe(1);
        expect(warnings[0].message).toContain('shadows');
    });

    it('should detect when ** shadows everything', () => {
        const warnings = detectOverlaps([
            { match: '**', cacheControl: 'no-store' },
            { match: 'billing.pay', invalidates: ['billing.*'] },
        ]);

        expect(warnings).toHaveLength(1);
        expect(warnings[0].shadowingIndex).toBe(0);
    });

    it('should NOT report non-overlapping policies', () => {
        const warnings = detectOverlaps([
            { match: 'billing.*', cacheControl: 'no-store' },
            { match: 'sprints.*', cacheControl: 'no-store' },
        ]);

        expect(warnings).toHaveLength(0);
    });

    it('should detect multiple overlaps', () => {
        const warnings = detectOverlaps([
            { match: '**' },
            { match: 'billing.*' },
            { match: 'billing.pay' },
        ]);

        // ** shadows both billing.* and billing.pay
        // billing.* shadows billing.pay
        expect(warnings).toHaveLength(3);
    });

    it('should return empty for single policy', () => {
        expect(detectOverlaps([{ match: 'billing.pay' }])).toHaveLength(0);
    });

    it('should return empty for empty array', () => {
        expect(detectOverlaps([])).toHaveLength(0);
    });
});
