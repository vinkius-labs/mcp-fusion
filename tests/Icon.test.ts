import { describe, it, expect } from 'vitest';
import { Icon } from '../src/Icon.js';

describe('Icon', () => {
    it('should initialize with undefined values', () => {
        const icon = new Icon();
        expect(icon.src).toBeUndefined();
        expect(icon.mimeType).toBeUndefined();
        expect(icon.sizes).toBeUndefined();
        expect(icon.theme).toBeUndefined();
    });

    it('should set and get src', () => {
        const icon = new Icon();
        icon.src = 'https://example.com/icon.png';
        expect(icon.src).toBe('https://example.com/icon.png');
    });

    it('should set and get mimeType', () => {
        const icon = new Icon();
        icon.mimeType = 'image/png';
        expect(icon.mimeType).toBe('image/png');
    });

    it('should set and get sizes', () => {
        const icon = new Icon();
        icon.sizes = ['16x16', '32x32', '64x64'];
        expect(icon.sizes).toEqual(['16x16', '32x32', '64x64']);
    });

    it('should set and get theme', () => {
        const icon = new Icon();
        icon.theme = 'dark';
        expect(icon.theme).toBe('dark');
    });

    it('should produce correct toString', () => {
        const icon = new Icon();
        icon.src = 'icon.png';
        icon.mimeType = 'image/png';
        icon.sizes = ['32x32'];
        icon.theme = 'light';
        const str = icon.toString();
        expect(str).toContain('icon.png');
        expect(str).toContain('image/png');
        expect(str).toContain('32x32');
        expect(str).toContain('light');
    });
});
