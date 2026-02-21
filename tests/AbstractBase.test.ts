import { describe, it, expect } from 'vitest';
import { AbstractBase } from '../src/AbstractBase.js';
import { Icon } from '../src/Icon.js';

// Concrete subclass for testing abstract class
class ConcreteBase extends AbstractBase {
    public constructor(name: string, nameSeparator?: string) {
        super(name, nameSeparator);
    }

    public getFullyQualifiedName(): string {
        return this.name;
    }
}

describe('AbstractBase', () => {
    describe('constructor', () => {
        it('should create with name', () => {
            const base = new ConcreteBase('test');
            expect(base.name).toBe('test');
        });

        it('should use default separator', () => {
            expect(AbstractBase.DEFAULT_SEPARATOR).toBe('.');
        });

        it('should throw error when name is null', () => {
            expect(() => new ConcreteBase(null as any)).toThrow('name must not be null');
        });

        it('should throw error when name is undefined', () => {
            expect(() => new ConcreteBase(undefined as any)).toThrow('name must not be null');
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
            const icon = new Icon();
            icon.src = 'icon.png';
            base.icons = [icon];
            expect(base.icons).toHaveLength(1);
            expect(base.icons![0].src).toBe('icon.png');
        });
    });

    describe('meta', () => {
        it('should be undefined by default', () => {
            const base = new ConcreteBase('test');
            expect(base.meta).toBeUndefined();
        });

        it('should set and get meta', () => {
            const base = new ConcreteBase('test');
            const meta = new Map<string, any>();
            meta.set('key', 'value');
            base.meta = meta;
            expect(base.meta!.get('key')).toBe('value');
        });
    });

    describe('hashCode', () => {
        it('should return consistent hash for same name', () => {
            const base1 = new ConcreteBase('test');
            const base2 = new ConcreteBase('test');
            expect(base1.hashCode()).toBe(base2.hashCode());
        });

        it('should return different hash for different names', () => {
            const base1 = new ConcreteBase('test1');
            const base2 = new ConcreteBase('test2');
            expect(base1.hashCode()).not.toBe(base2.hashCode());
        });

        it('should return 0 for empty name', () => {
            const base = new ConcreteBase('');
            expect(base.hashCode()).toBe(0);
        });
    });

    describe('equals', () => {
        it('should be equal to itself', () => {
            const base = new ConcreteBase('test');
            expect(base.equals(base)).toBe(true);
        });

        it('should be equal to another instance with same name', () => {
            const base1 = new ConcreteBase('test');
            const base2 = new ConcreteBase('test');
            expect(base1.equals(base2)).toBe(true);
        });

        it('should not be equal to instance with different name', () => {
            const base1 = new ConcreteBase('test1');
            const base2 = new ConcreteBase('test2');
            expect(base1.equals(base2)).toBe(false);
        });

        it('should not be equal to null', () => {
            const base = new ConcreteBase('test');
            expect(base.equals(null)).toBe(false);
        });

        it('should not be equal to undefined', () => {
            const base = new ConcreteBase('test');
            expect(base.equals(undefined)).toBe(false);
        });

        it('should not be equal to a different subclass with same name', () => {
            class AnotherBase extends AbstractBase {
                constructor(name: string) { super(name); }
                getFullyQualifiedName(): string { return this.name; }
            }
            const original = new ConcreteBase('deploy');
            const different = new AnotherBase('deploy');
            expect(original.equals(different)).toBe(false);
        });
    });
});
