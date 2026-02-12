import { describe, it, expect } from 'vitest';
import { Icon } from '../src/Icon.js';

describe('Icon', () => {
    it('should initialize with undefined values', () => {
        const icon = new Icon();
        expect(icon.getSrc()).toBeUndefined();
        expect(icon.getMimeType()).toBeUndefined();
        expect(icon.getSizes()).toBeUndefined();
        expect(icon.getTheme()).toBeUndefined();
    });

    it('should set and get src', () => {
        const icon = new Icon();
        icon.setSrc('https://example.com/icon.png');
        expect(icon.getSrc()).toBe('https://example.com/icon.png');
    });

    it('should set and get mimeType', () => {
        const icon = new Icon();
        icon.setMimeType('image/png');
        expect(icon.getMimeType()).toBe('image/png');
    });

    it('should set and get sizes', () => {
        const icon = new Icon();
        icon.setSizes(['16x16', '32x32', '64x64']);
        expect(icon.getSizes()).toEqual(['16x16', '32x32', '64x64']);
    });

    it('should set and get theme', () => {
        const icon = new Icon();
        icon.setTheme('dark');
        expect(icon.getTheme()).toBe('dark');
    });

    it('should produce correct toString', () => {
        const icon = new Icon();
        icon.setSrc('icon.png');
        icon.setMimeType('image/png');
        icon.setSizes(['32x32']);
        icon.setTheme('light');
        const str = icon.toString();
        expect(str).toContain('icon.png');
        expect(str).toContain('image/png');
        expect(str).toContain('32x32');
        expect(str).toContain('light');
    });
});
