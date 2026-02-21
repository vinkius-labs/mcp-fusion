import { describe, it, expect } from 'vitest';
import { type Icon, createIcon } from '../src/domain/Icon.js';

describe('Icon', () => {
    it('should create with default undefined values', () => {
        const icon = createIcon();
        expect(icon.src).toBeUndefined();
        expect(icon.mimeType).toBeUndefined();
        expect(icon.sizes).toBeUndefined();
        expect(icon.theme).toBeUndefined();
    });

    it('should create with src', () => {
        const icon = createIcon({ src: 'https://example.com/icon.png' });
        expect(icon.src).toBe('https://example.com/icon.png');
    });

    it('should create with mimeType', () => {
        const icon = createIcon({ mimeType: 'image/png' });
        expect(icon.mimeType).toBe('image/png');
    });

    it('should create with sizes', () => {
        const icon = createIcon({ sizes: ['16x16', '32x32', '64x64'] });
        expect(icon.sizes).toEqual(['16x16', '32x32', '64x64']);
    });

    it('should create with theme', () => {
        const icon = createIcon({ theme: 'dark' });
        expect(icon.theme).toBe('dark');
    });

    it('should create with all properties', () => {
        const icon: Icon = createIcon({
            src: 'icon.png',
            mimeType: 'image/png',
            sizes: ['32x32'],
            theme: 'light',
        });
        expect(icon.src).toBe('icon.png');
        expect(icon.mimeType).toBe('image/png');
        expect(icon.sizes).toEqual(['32x32']);
        expect(icon.theme).toBe('light');
    });
});
