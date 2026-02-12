import { Resource } from '../Resource.js';

export interface ResourceConverter<ResourceType> {
    convertFromResources(resources: Resource[]): ResourceType[];
    convertFromResource(resource: Resource): ResourceType;
    convertToResources(resources: ResourceType[]): Resource[];
    convertToResource(resource: ResourceType): Resource;
}

export abstract class AbstractResourceConverter<ResourceType> implements ResourceConverter<ResourceType> {
    public convertFromResources(resources: Resource[]): ResourceType[] {
        return resources
            .map(rn => this.convertFromResource(rn))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertFromResource(resource: Resource): ResourceType;

    public convertToResources(resources: ResourceType[]): Resource[] {
        return resources
            .map(rn => this.convertToResource(rn))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertToResource(resource: ResourceType): Resource;
}
