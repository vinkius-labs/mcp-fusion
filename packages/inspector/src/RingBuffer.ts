/**
 * RingBuffer — Fixed-Size Circular Buffer
 *
 * Stores the last N items in a fixed-size circular array.
 * When the buffer is full, the oldest item is overwritten.
 * Used for event history in the TUI panels.
 *
 * Performance: O(1) push, O(1) get, O(n) toArray.
 *
 * @module
 */

/**
 * A fixed-size circular buffer that discards the oldest entries.
 *
 * @example
 * ```typescript
 * const buf = new RingBuffer<string>(3);
 * buf.push('a');
 * buf.push('b');
 * buf.push('c');
 * buf.push('d'); // 'a' is evicted
 * buf.toArray(); // ['b', 'c', 'd']
 * ```
 */
export class RingBuffer<T> {
    private readonly _items: (T | undefined)[];
    private readonly _capacity: number;
    private _head = 0;  // next write position
    private _size = 0;

    constructor(capacity: number) {
        if (capacity < 1) throw new Error('RingBuffer capacity must be >= 1');
        this._capacity = capacity;
        this._items = new Array(capacity);
    }

    /** Push a new item. If full, the oldest is evicted. */
    push(item: T): void {
        this._items[this._head] = item;
        this._head = (this._head + 1) % this._capacity;
        if (this._size < this._capacity) this._size++;
    }

    /** Get the item at index (0 = oldest visible). */
    get(index: number): T | undefined {
        if (index < 0 || index >= this._size) return undefined;
        const start = (this._head - this._size + this._capacity) % this._capacity;
        return this._items[(start + index) % this._capacity];
    }

    /** Return all items as an array, oldest first. */
    toArray(): T[] {
        const result: T[] = [];
        const start = (this._head - this._size + this._capacity) % this._capacity;
        for (let i = 0; i < this._size; i++) {
            result.push(this._items[(start + i) % this._capacity]!);
        }
        return result;
    }

    /** Return the last N items, oldest first. */
    last(n: number): T[] {
        const count = Math.min(n, this._size);
        const result: T[] = [];
        const start = (this._head - count + this._capacity) % this._capacity;
        for (let i = 0; i < count; i++) {
            result.push(this._items[(start + i) % this._capacity]!);
        }
        return result;
    }

    /** Current number of items stored. */
    get size(): number { return this._size; }

    /** Maximum capacity. */
    get capacity(): number { return this._capacity; }

    /** Clear all items. */
    clear(): void {
        this._head = 0;
        this._size = 0;
        this._items.fill(undefined);
    }
}
