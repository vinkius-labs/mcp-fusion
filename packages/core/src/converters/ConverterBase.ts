/**
 * ConverterBase — Generic Base for Bidirectional Converters
 *
 * Provides batch conversion with null filtering in both directions.
 * Domain-specific converters extend this class and only implement
 * the single-item abstract methods: {@link convertFrom} and {@link convertTo}.
 *
 * @typeParam TSource - The domain model type (e.g. Group, Tool)
 * @typeParam TTarget - The external/DTO type
 *
 * @example
 * ```typescript
 * import { ToolConverterBase, Tool } from '@vinkius-core/mcp-fusion';
 *
 * interface ToolDto { id: string; label: string }
 *
 * class MyToolConverter extends ToolConverterBase<ToolDto> {
 *     convertFrom(tool: Tool): ToolDto {
 *         return { id: tool.name, label: tool.title ?? tool.name };
 *     }
 *     convertTo(dto: ToolDto): Tool {
 *         const tool = new Tool(dto.id);
 *         tool.title = dto.label;
 *         return tool;
 *     }
 * }
 *
 * const converter = new MyToolConverter();
 * const dtos = converter.convertFromBatch(tools);  // Tool[] → ToolDto[]
 * const tools = converter.convertToBatch(dtos);     // ToolDto[] → Tool[]
 * ```
 *
 * @see {@link ToolConverterBase} for tool-specific converters
 * @see {@link GroupConverterBase} for group-specific converters
 */
export abstract class ConverterBase<TSource, TTarget> {
    /**
     * Convert a batch of source items to target items.
     * Null/undefined results from single-item conversion are filtered out.
     *
     * @param sources - Array of domain model instances
     * @returns Array of converted DTOs (nulls removed)
     */
    convertFromBatch(sources: TSource[]): TTarget[] {
        return sources
            .map(s => this.convertFrom(s))
            .filter((item): item is NonNullable<TTarget> => item != null);
    }

    /**
     * Convert a single source item to a target item.
     *
     * @param source - Domain model instance
     * @returns The converted DTO
     */
    abstract convertFrom(source: TSource): TTarget;

    /**
     * Convert a batch of target items back to source items.
     * Null/undefined results from single-item conversion are filtered out.
     *
     * @param targets - Array of DTOs
     * @returns Array of domain model instances (nulls removed)
     */
    convertToBatch(targets: TTarget[]): TSource[] {
        return targets
            .map(t => this.convertTo(t))
            .filter((item): item is NonNullable<TSource> => item != null);
    }

    /**
     * Convert a single target item back to a source item.
     *
     * @param target - DTO instance
     * @returns The domain model instance
     */
    abstract convertTo(target: TTarget): TSource;
}
