import { ToolAnnotations } from '../ToolAnnotations.js';
import { ConverterBase } from './ConverterBase.js';

export interface ToolAnnotationsConverter<ToolAnnotationsType> {
    convertFromToolAnnotations(toolAnnotations: ToolAnnotations[]): ToolAnnotationsType[];
    convertFromToolAnnotation(toolAnnotation: ToolAnnotations): ToolAnnotationsType;
    convertToToolAnnotations(toolAnnotations: ToolAnnotationsType[]): ToolAnnotations[];
    convertToToolAnnotation(toolAnnotation: ToolAnnotationsType): ToolAnnotations;
}

export abstract class ToolAnnotationsConverterBase<ToolAnnotationsType>
    extends ConverterBase<ToolAnnotations, ToolAnnotationsType>
    implements ToolAnnotationsConverter<ToolAnnotationsType>
{
    public convertFromToolAnnotations(toolAnnotations: ToolAnnotations[]): ToolAnnotationsType[] {
        return this.convertFromBatch(toolAnnotations);
    }

    public abstract convertFromToolAnnotation(toolAnnotation: ToolAnnotations): ToolAnnotationsType;

    public convertToToolAnnotations(toolAnnotations: ToolAnnotationsType[]): ToolAnnotations[] {
        return this.convertToBatch(toolAnnotations);
    }

    public abstract convertToToolAnnotation(toolAnnotation: ToolAnnotationsType): ToolAnnotations;

    // ── Bridge to ConverterBase ──
    protected convertFromSingle(source: ToolAnnotations): ToolAnnotationsType {
        return this.convertFromToolAnnotation(source);
    }

    protected convertToSingle(target: ToolAnnotationsType): ToolAnnotations {
        return this.convertToToolAnnotation(target);
    }
}
