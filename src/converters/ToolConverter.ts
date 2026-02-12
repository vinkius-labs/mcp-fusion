import { Tool } from '../Tool.js';

export interface ToolConverter<ToolType> {
    convertFromTools(tools: Tool[]): ToolType[];
    convertFromTool(tool: Tool): ToolType;
    convertToTools(tools: ToolType[]): Tool[];
    convertToTool(tool: ToolType): Tool;
}

export abstract class AbstractToolConverter<ToolType> implements ToolConverter<ToolType> {
    public convertFromTools(tools: Tool[]): ToolType[] {
        return tools
            .map(tn => this.convertFromTool(tn))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertFromTool(tool: Tool): ToolType;

    public convertToTools(tools: ToolType[]): Tool[] {
        return tools
            .map(t => this.convertToTool(t))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertToTool(tool: ToolType): Tool;
}
