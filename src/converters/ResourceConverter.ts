import { Resource } from '../Resource.js';
import { ConverterBase } from './ConverterBase.js';

export interface ResourceConverter<ResourceType> {
    convertFromResources(resources: Resource[]): ResourceType[];
    convertFromResource(resource: Resource): ResourceType;
    convertToResources(resources: ResourceType[]): Resource[];
    convertToResource(resource: ResourceType): Resource;
}

export abstract class ResourceConverterBase<ResourceType>
    extends ConverterBase<Resource, ResourceType>
    implements ResourceConverter<ResourceType>
{
    public convertFromResources(resources: Resource[]): ResourceType[] {
        return this.convertFromBatch(resources);
    }

    public abstract convertFromResource(resource: Resource): ResourceType;

    public convertToResources(resources: ResourceType[]): Resource[] {
        return this.convertToBatch(resources);
    }

    public abstract convertToResource(resource: ResourceType): Resource;

    // ── Bridge to ConverterBase ──
    protected convertFromSingle(source: Resource): ResourceType {
        return this.convertFromResource(source);
    }

    protected convertToSingle(target: ResourceType): Resource {
        return this.convertToResource(target);
    }
}
