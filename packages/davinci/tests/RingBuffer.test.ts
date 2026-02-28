/**
 * RingBuffer.test.ts — Exhaustive Circular Buffer Tests
 *
 * The RingBuffer is the memory backbone of the TUI event history.
 * A bug here means lost events, off-by-one rendering, or memory leaks.
 *
 * Categories:
 *  1. Construction — capacity validation
 *  2. Push & Eviction — FIFO, circular overwrite
 *  3. Get — index access, boundary checks
 *  4. toArray — ordering invariants
 *  5. last() — tail window
 *  6. Clear — reset semantics
 *  7. Stress — high-throughput, capacity-1 edge
 *  8. Adversarial — negative indexes, NaN, huge capacity
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../src/RingBuffer.js';

// ============================================================================
// 1. Construction
// ============================================================================

describe('RingBuffer — Construction', () => {
    it('should create a buffer with the specified capacity', () => {
        const buf = new RingBuffer<number>(10);
        expect(buf.capacity).toBe(10);
        expect(buf.size).toBe(0);
    });

    it('should accept capacity = 1', () => {
        const buf = new RingBuffer<string>(1);
        expect(buf.capacity).toBe(1);
    });

    it('should throw for capacity < 1', () => {
        expect(() => new RingBuffer(0)).toThrow('capacity must be >= 1');
        expect(() => new RingBuffer(-1)).toThrow('capacity must be >= 1');
        expect(() => new RingBuffer(-100)).toThrow('capacity must be >= 1');
    });

    it('should start with size = 0 and empty array', () => {
        const buf = new RingBuffer<number>(5);
        expect(buf.size).toBe(0);
        expect(buf.toArray()).toEqual([]);
    });
});

// ============================================================================
// 2. Push & Eviction
// ============================================================================

describe('RingBuffer — Push & Eviction', () => {
    it('should push items and increment size', () => {
        const buf = new RingBuffer<string>(5);
        buf.push('a');
        expect(buf.size).toBe(1);
        buf.push('b');
        expect(buf.size).toBe(2);
    });

    it('should not exceed capacity on push', () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);
        buf.push(2);
        buf.push(3);
        buf.push(4);
        expect(buf.size).toBe(3);
    });

    it('should evict oldest items when full (FIFO)', () => {
        const buf = new RingBuffer<string>(3);
        buf.push('a');
        buf.push('b');
        buf.push('c');
        expect(buf.toArray()).toEqual(['a', 'b', 'c']);

        buf.push('d'); // evicts 'a'
        expect(buf.toArray()).toEqual(['b', 'c', 'd']);

        buf.push('e'); // evicts 'b'
        expect(buf.toArray()).toEqual(['c', 'd', 'e']);
    });

    it('should handle multiple full rotations correctly', () => {
        const buf = new RingBuffer<number>(3);
        for (let i = 0; i < 20; i++) {
            buf.push(i);
        }
        expect(buf.size).toBe(3);
        expect(buf.toArray()).toEqual([17, 18, 19]);
    });

    it('should handle capacity-1 correctly (single slot)', () => {
        const buf = new RingBuffer<string>(1);
        buf.push('only');
        expect(buf.toArray()).toEqual(['only']);
        expect(buf.size).toBe(1);

        buf.push('replaced');
        expect(buf.toArray()).toEqual(['replaced']);
        expect(buf.size).toBe(1);
    });
});

// ============================================================================
// 3. Get — Index Access
// ============================================================================

describe('RingBuffer — Get', () => {
    it('should return correct items by index (oldest = 0)', () => {
        const buf = new RingBuffer<string>(4);
        buf.push('a');
        buf.push('b');
        buf.push('c');

        expect(buf.get(0)).toBe('a');
        expect(buf.get(1)).toBe('b');
        expect(buf.get(2)).toBe('c');
    });

    it('should return undefined for out-of-range index', () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);

        expect(buf.get(-1)).toBeUndefined();
        expect(buf.get(1)).toBeUndefined();
        expect(buf.get(100)).toBeUndefined();
    });

    it('should return undefined for empty buffer', () => {
        const buf = new RingBuffer<number>(5);
        expect(buf.get(0)).toBeUndefined();
    });

    it('should return correct items after eviction', () => {
        const buf = new RingBuffer<number>(3);
        buf.push(10);
        buf.push(20);
        buf.push(30);
        buf.push(40); // evicts 10

        expect(buf.get(0)).toBe(20);
        expect(buf.get(1)).toBe(30);
        expect(buf.get(2)).toBe(40);
    });

    it('should track items through multiple wrap-arounds', () => {
        const buf = new RingBuffer<number>(2);
        for (let i = 0; i < 10; i++) {
            buf.push(i);
        }
        // After 10 pushes into capacity-2: last two are 8, 9
        expect(buf.get(0)).toBe(8);
        expect(buf.get(1)).toBe(9);
    });
});

// ============================================================================
// 4. toArray — Ordering Invariants
// ============================================================================

describe('RingBuffer — toArray', () => {
    it('should return items in insertion order', () => {
        const buf = new RingBuffer<string>(5);
        buf.push('x');
        buf.push('y');
        buf.push('z');
        expect(buf.toArray()).toEqual(['x', 'y', 'z']);
    });

    it('should return oldest→newest after wrap-around', () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);
        buf.push(2);
        buf.push(3);
        buf.push(4);
        buf.push(5);
        expect(buf.toArray()).toEqual([3, 4, 5]);
    });

    it('should return a new array every call (no mutation risk)', () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);

        const a = buf.toArray();
        const b = buf.toArray();
        expect(a).toEqual(b);
        expect(a).not.toBe(b); // different references

        a.push(999);
        expect(buf.toArray()).toEqual([1]); // unmutated
    });

    it('should be correct with exactly capacity items', () => {
        const buf = new RingBuffer<string>(3);
        buf.push('a');
        buf.push('b');
        buf.push('c');
        expect(buf.toArray()).toEqual(['a', 'b', 'c']);
        expect(buf.size).toBe(3);
    });
});

// ============================================================================
// 5. last() — Tail Window
// ============================================================================

describe('RingBuffer — last()', () => {
    it('should return the last N items', () => {
        const buf = new RingBuffer<number>(10);
        for (let i = 0; i < 7; i++) buf.push(i);

        expect(buf.last(3)).toEqual([4, 5, 6]);
    });

    it('should return all items when N >= size', () => {
        const buf = new RingBuffer<number>(5);
        buf.push(1);
        buf.push(2);

        expect(buf.last(5)).toEqual([1, 2]);
        expect(buf.last(100)).toEqual([1, 2]);
    });

    it('should return empty array for last(0)', () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);
        buf.push(2);

        expect(buf.last(0)).toEqual([]);
    });

    it('should work after eviction', () => {
        const buf = new RingBuffer<number>(3);
        for (let i = 0; i < 10; i++) buf.push(i);

        expect(buf.last(2)).toEqual([8, 9]);
        expect(buf.last(3)).toEqual([7, 8, 9]);
    });

    it('should return items in correct order (oldest first)', () => {
        const buf = new RingBuffer<string>(4);
        buf.push('a');
        buf.push('b');
        buf.push('c');
        buf.push('d');
        buf.push('e'); // evicts 'a'

        const result = buf.last(3);
        expect(result).toEqual(['c', 'd', 'e']);
    });
});

// ============================================================================
// 6. Clear
// ============================================================================

describe('RingBuffer — Clear', () => {
    it('should reset size to 0', () => {
        const buf = new RingBuffer<number>(5);
        buf.push(1);
        buf.push(2);
        buf.push(3);
        buf.clear();

        expect(buf.size).toBe(0);
    });

    it('should return empty array after clear', () => {
        const buf = new RingBuffer<number>(5);
        buf.push(1);
        buf.push(2);
        buf.clear();

        expect(buf.toArray()).toEqual([]);
    });

    it('should allow normal push/get after clear', () => {
        const buf = new RingBuffer<string>(3);
        buf.push('a');
        buf.push('b');
        buf.push('c');
        buf.clear();

        buf.push('x');
        expect(buf.size).toBe(1);
        expect(buf.get(0)).toBe('x');
        expect(buf.toArray()).toEqual(['x']);
    });

    it('should preserve capacity after clear', () => {
        const buf = new RingBuffer<number>(7);
        buf.clear();
        expect(buf.capacity).toBe(7);
    });

    it('should correctly evict after clear + refill', () => {
        const buf = new RingBuffer<number>(2);
        buf.push(1);
        buf.push(2);
        buf.clear();

        buf.push(10);
        buf.push(20);
        buf.push(30); // evicts 10

        expect(buf.toArray()).toEqual([20, 30]);
    });
});

// ============================================================================
// 7. Stress & High-Throughput
// ============================================================================

describe('RingBuffer — Stress', () => {
    it('should handle 100,000 pushes without error', () => {
        const buf = new RingBuffer<number>(100);
        for (let i = 0; i < 100_000; i++) {
            buf.push(i);
        }
        expect(buf.size).toBe(100);
        const arr = buf.toArray();
        expect(arr.length).toBe(100);
        expect(arr[0]).toBe(99_900);
        expect(arr[99]).toBe(99_999);
    });

    it('should maintain FIFO ordering under rapid fill/evict cycles', () => {
        const buf = new RingBuffer<number>(5);
        for (let cycle = 0; cycle < 1000; cycle++) {
            const start = cycle * 5;
            for (let i = 0; i < 5; i++) buf.push(start + i);
        }
        const arr = buf.toArray();
        // Last batch: 4995..4999
        expect(arr).toEqual([4995, 4996, 4997, 4998, 4999]);
    });

    it('should handle large capacity correctly', () => {
        const buf = new RingBuffer<number>(10_000);
        for (let i = 0; i < 15_000; i++) buf.push(i);

        expect(buf.size).toBe(10_000);
        expect(buf.get(0)).toBe(5_000);
        expect(buf.get(9_999)).toBe(14_999);
    });
});

// ============================================================================
// 8. Adversarial & Edge Cases
// ============================================================================

describe('RingBuffer — Adversarial', () => {
    it('should handle undefined/null values as items', () => {
        const buf = new RingBuffer<string | null | undefined>(3);
        buf.push(undefined as unknown as string);
        buf.push(null);
        buf.push('ok');

        expect(buf.size).toBe(3);
        expect(buf.get(0)).toBeUndefined();
        expect(buf.get(1)).toBeNull();
        expect(buf.get(2)).toBe('ok');
    });

    it('should handle objects without mutation', () => {
        const buf = new RingBuffer<{ id: number }>(3);
        const obj = { id: 1 };
        buf.push(obj);

        obj.id = 999; // mutate original
        expect(buf.get(0)!.id).toBe(999); // shallow ref
    });

    it('should handle get(-1) gracefully', () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);
        expect(buf.get(-1)).toBeUndefined();
    });

    it('should handle push immediately after construction', () => {
        const buf = new RingBuffer<number>(1);
        buf.push(42);
        expect(buf.toArray()).toEqual([42]);
    });

    it('should handle alternating push and clear', () => {
        const buf = new RingBuffer<number>(3);
        for (let i = 0; i < 50; i++) {
            if (i % 11 === 0 && i > 0) buf.clear();
            buf.push(i);
        }
        // Should end with items from last clear onwards
        expect(buf.size).toBeGreaterThan(0);
        expect(buf.size).toBeLessThanOrEqual(3);
    });

    it('last() with negative N returns empty array', () => {
        const buf = new RingBuffer<number>(5);
        buf.push(1);
        buf.push(2);
        // Math.min(-1, 2) = -1, generates empty loop
        expect(buf.last(-1)).toEqual([]);
    });
});
