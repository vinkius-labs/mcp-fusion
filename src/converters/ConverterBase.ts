/**
 * ConverterBase — Generic Base for Bidirectional Converters
 *
 * Provides batch conversion with null filtering in both directions.
 * Domain-specific converters (Group, Tool, Prompt, Resource, ToolAnnotations)
 * extend this class and only implement the single-item abstract methods.
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
            .map(s => this.convertFromSingle(s))
            .filter(item => item !== null && item !== undefined);
    }

    /** Convert a single source item to a target item. */
    protected abstract convertFromSingle(source: TSource): TTarget;

    /**
     * Convert a batch of target items back to source items.
     * Null/undefined results from single-item conversion are filtered out.
     */
    convertToBatch(targets: TTarget[]): TSource[] {
        return targets
            .map(t => this.convertToSingle(t))
            .filter(item => item !== null && item !== undefined);
    }

    /** Convert a single target item back to a source item. */
    protected abstract convertToSingle(target: TTarget): TSource;
}
