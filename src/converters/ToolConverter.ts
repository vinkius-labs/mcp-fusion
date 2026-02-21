import { Tool } from '../Tool.js';
import { ConverterBase } from './ConverterBase.js';

export interface ToolConverter<ToolType> {
    convertFromTools(tools: Tool[]): ToolType[];
    convertFromTool(tool: Tool): ToolType;
    convertToTools(tools: ToolType[]): Tool[];
    convertToTool(tool: ToolType): Tool;
}

export abstract class ToolConverterBase<ToolType>
    extends ConverterBase<Tool, ToolType>
    implements ToolConverter<ToolType>
{
    public convertFromTools(tools: Tool[]): ToolType[] {
        return this.convertFromBatch(tools);
    }

    public abstract convertFromTool(tool: Tool): ToolType;

    public convertToTools(tools: ToolType[]): Tool[] {
        return this.convertToBatch(tools);
    }

    public abstract convertToTool(tool: ToolType): Tool;

    // ── Bridge to ConverterBase ──
    protected convertFromSingle(source: Tool): ToolType {
        return this.convertFromTool(source);
    }

    protected convertToSingle(target: ToolType): Tool {
        return this.convertToTool(target);
    }
}
