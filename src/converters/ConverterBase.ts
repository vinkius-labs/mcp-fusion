/**
 * ConverterBase — Generic Base for Bidirectional Converters
 *
 * Provides batch conversion with null filtering in both directions.
 * Domain-specific converters extend this class and only implement
 * the single-item abstract methods: `convertFrom` and `convertTo`.
 *
 * @template TSource - The domain model type (e.g. Group, Tool)
 * @template TTarget - The external/DTO type
 */
export abstract class ConverterBase<TSource, TTarget> {
    /**
     * Convert a batch of source items to target items.
     * Null/undefined results from single-item conversion are filtered out.
     */
    convertFromBatch(sources: TSource[]): TTarget[] {
        return sources
            .map(s => this.convertFrom(s))
            .filter((item): item is NonNullable<TTarget> => item != null);
    }

    /** Convert a single source item to a target item. */
    abstract convertFrom(source: TSource): TTarget;

    /**
     * Convert a batch of target items back to source items.
     * Null/undefined results from single-item conversion are filtered out.
     */
    convertToBatch(targets: TTarget[]): TSource[] {
        return targets
            .map(t => this.convertTo(t))
            .filter((item): item is NonNullable<TSource> => item != null);
    }

    /** Convert a single target item back to a source item. */
    abstract convertTo(target: TTarget): TSource;
}
