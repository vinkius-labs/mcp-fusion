import { describe, it, expect } from 'vitest';
import { BaseModel } from '../src/domain/BaseModel.js';
import { createIcon } from '../src/domain/Icon.js';

// Concrete subclass for testing abstract class
class ConcreteBase extends BaseModel {
    public constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator);
    }

    public getFullyQualifiedName(): string {
        return this.name;
    }
}

describe('BaseModel', () => {
    describe('constructor', () => {
        it('should create with name', () => {
            const base = new ConcreteBase('test');
            expect(base.name).toBe('test');
        });

        it('should use default separator', () => {
            expect(BaseModel.DEFAULT_SEPARATOR).toBe('.');
        });

        it('should accept custom separator', () => {
            const base = new ConcreteBase('test', '/');
            expect(base.nameSeparator).toBe('/');
        });
    });

    describe('title', () => {
        it('should be undefined by default', () => {
            const base = new ConcreteBase('test');
            expect(base.title).toBeUndefined();
        });

        it('should set and get title', () => {
            const base = new ConcreteBase('test');
            base.title = 'Test Title';
            expect(base.title).toBe('Test Title');
        });
    });

    describe('description', () => {
        it('should be undefined by default', () => {
            const base = new ConcreteBase('test');
            expect(base.description).toBeUndefined();
        });

        it('should set and get description', () => {
            const base = new ConcreteBase('test');
            base.description = 'A description';
            expect(base.description).toBe('A description');
        });
    });

    describe('icons', () => {
        it('should be undefined by default', () => {
            const base = new ConcreteBase('test');
            expect(base.icons).toBeUndefined();
        });

        it('should set and get icons', () => {
            const base = new ConcreteBase('test');
            const icon = createIcon({ src: 'icon.png' });
            base.icons = [icon];
            expect(base.icons).toHaveLength(1);
            expect(base.icons?.[0]?.src).toBe('icon.png');
        });
    });

    describe('meta', () => {
        it('should be undefined by default', () => {
            const base = new ConcreteBase('test');
            expect(base.meta).toBeUndefined();
        });

        it('should set and get meta', () => {
            const base = new ConcreteBase('test');
            const meta = new Map<string, unknown>();
            meta.set('key', 'value');
            base.meta = meta;
            expect(base.meta?.get('key')).toBe('value');
        });
    });
});
