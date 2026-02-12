import { ToolAnnotations } from '../ToolAnnotations.js';

export interface ToolAnnotationsConverter<ToolAnnotationsType> {
    convertFromToolAnnotations(toolAnnotations: ToolAnnotations[]): ToolAnnotationsType[];
    convertFromToolAnnotations(tool: ToolAnnotations): ToolAnnotationsType;
    convertToToolAnnotations(toolAnnotations: ToolAnnotationsType[]): ToolAnnotations[];
    convertToToolAnnotations(toolAnnotations: ToolAnnotationsType): ToolAnnotations;
}

export abstract class AbstractToolAnnotationsConverter<ToolAnnotationsType> implements ToolAnnotationsConverter<ToolAnnotationsType> {
    public convertFromToolAnnotations(toolAnnotations: ToolAnnotations[]): ToolAnnotationsType[];
    public convertFromToolAnnotations(tool: ToolAnnotations): ToolAnnotationsType;
    public convertFromToolAnnotations(toolAnnotationsOrArray: ToolAnnotations | ToolAnnotations[]): ToolAnnotationsType | ToolAnnotationsType[] {
        if (Array.isArray(toolAnnotationsOrArray)) {
            return toolAnnotationsOrArray
                .map(tn => this.convertFromToolAnnotationsSingle(tn))
                .filter(item => item !== null && item !== undefined);
        } else {
            return this.convertFromToolAnnotationsSingle(toolAnnotationsOrArray);
        }
    }

    protected abstract convertFromToolAnnotationsSingle(tool: ToolAnnotations): ToolAnnotationsType;

    public convertToToolAnnotations(toolAnnotations: ToolAnnotationsType[]): ToolAnnotations[];
    public convertToToolAnnotations(toolAnnotations: ToolAnnotationsType): ToolAnnotations;
    public convertToToolAnnotations(toolAnnotationsOrArray: ToolAnnotationsType | ToolAnnotationsType[]): ToolAnnotations | ToolAnnotations[] {
        if (Array.isArray(toolAnnotationsOrArray)) {
            return toolAnnotationsOrArray
                .map(t => this.convertToToolAnnotationsSingle(t))
                .filter(item => item !== null && item !== undefined);
        } else {
            return this.convertToToolAnnotationsSingle(toolAnnotationsOrArray);
        }
    }

    protected abstract convertToToolAnnotationsSingle(toolAnnotations: ToolAnnotationsType): ToolAnnotations;
}
