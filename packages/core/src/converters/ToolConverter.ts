import { type Tool } from '../domain/Tool.js';
import { ConverterBase } from './ConverterBase.js';

/**
 * Type-safe Tool converter contract.
 *
 * @typeParam T - The target DTO type
 * @see {@link ToolConverterBase} for the base implementation class
 */
export type ToolConverter<T> = ConverterBase<Tool, T>;

/**
 * Base class for Tool converters.
 *
 * Extend this and implement `convertFrom(tool)` and `convertTo(dto)`.
 *
 * @typeParam T - The target DTO type
 *
 * @example
 * ```typescript
 * class McpToolConverter extends ToolConverterBase<McpTool> {
 *     convertFrom(tool: Tool): McpTool {
 *         return { name: tool.name, description: tool.description ?? '' };
 *     }
 *     convertTo(mcp: McpTool): Tool {
 *         const tool = new Tool(mcp.name);
 *         tool.description = mcp.description;
 *         return tool;
 *     }
 * }
 * ```
 *
 * @see {@link ConverterBase} for batch conversion methods
 */
export abstract class ToolConverterBase<T> extends ConverterBase<Tool, T> {}
