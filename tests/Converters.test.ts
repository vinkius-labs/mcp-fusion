import { describe, it, expect } from 'vitest';
import { Group } from '../src/Group.js';
import { Tool } from '../src/Tool.js';
import { Prompt } from '../src/Prompt.js';
import { Resource } from '../src/Resource.js';
import { ToolAnnotations } from '../src/ToolAnnotations.js';
import {
    AbstractGroupConverter,
    AbstractToolConverter,
    AbstractPromptConverter,
    AbstractResourceConverter,
    AbstractToolAnnotationsConverter
} from '../src/converters/index.js';

// --- Concrete converter implementations for testing ---

interface SimpleGroupDTO {
    name: string;
    title?: string;
}

class TestGroupConverter extends AbstractGroupConverter<SimpleGroupDTO> {
    public convertFromGroup(group: Group): SimpleGroupDTO {
        return { name: group.getName(), title: group.getTitle() };
    }

    public convertToGroup(dto: SimpleGroupDTO): Group {
        const group = new Group(dto.name);
        if (dto.title) group.setTitle(dto.title);
        return group;
    }
}

interface SimpleToolDTO {
    name: string;
    schema?: string;
}

class TestToolConverter extends AbstractToolConverter<SimpleToolDTO> {
    public convertFromTool(tool: Tool): SimpleToolDTO {
        return { name: tool.getName(), schema: tool.getInputSchema() };
    }

    public convertToTool(dto: SimpleToolDTO): Tool {
        const tool = new Tool(dto.name);
        if (dto.schema) tool.setInputSchema(dto.schema);
        return tool;
    }
}

interface SimplePromptDTO {
    name: string;
}

class TestPromptConverter extends AbstractPromptConverter<SimplePromptDTO> {
    public convertFromPrompt(prompt: Prompt): SimplePromptDTO {
        return { name: prompt.getName() };
    }

    public convertToPrompt(dto: SimplePromptDTO): Prompt {
        return new Prompt(dto.name);
    }
}

interface SimpleResourceDTO {
    name: string;
    uri?: string;
}

class TestResourceConverter extends AbstractResourceConverter<SimpleResourceDTO> {
    public convertFromResource(resource: Resource): SimpleResourceDTO {
        return { name: resource.getName(), uri: resource.getUri() };
    }

    public convertToResource(dto: SimpleResourceDTO): Resource {
        const resource = new Resource(dto.name);
        if (dto.uri) resource.setUri(dto.uri);
        return resource;
    }
}

interface SimpleToolAnnotationsDTO {
    title?: string;
    readOnly?: boolean;
}

class TestToolAnnotationsConverter extends AbstractToolAnnotationsConverter<SimpleToolAnnotationsDTO> {
    protected convertFromToolAnnotationsSingle(ta: ToolAnnotations): SimpleToolAnnotationsDTO {
        return { title: ta.getTitle(), readOnly: ta.getReadOnlyHint() };
    }

    protected convertToToolAnnotationsSingle(dto: SimpleToolAnnotationsDTO): ToolAnnotations {
        const ta = new ToolAnnotations();
        if (dto.title) ta.setTitle(dto.title);
        if (dto.readOnly !== undefined) ta.setReadOnlyHint(dto.readOnly);
        return ta;
    }
}

// --- Tests ---

describe('GroupConverter', () => {
    const converter = new TestGroupConverter();

    it('should convert group to DTO', () => {
        const group = new Group('ci');
        group.setTitle('CI');
        const dto = converter.convertFromGroup(group);
        expect(dto.name).toBe('ci');
        expect(dto.title).toBe('CI');
    });

    it('should convert DTO to group', () => {
        const group = converter.convertToGroup({ name: 'deploy', title: 'Deploy' });
        expect(group.getName()).toBe('deploy');
        expect(group.getTitle()).toBe('Deploy');
    });

    it('should batch convert groups to DTOs', () => {
        const groups = [new Group('ci'), new Group('deploy')];
        const dtos = converter.convertFromGroups(groups);
        expect(dtos).toHaveLength(2);
        expect(dtos[0].name).toBe('ci');
        expect(dtos[1].name).toBe('deploy');
    });

    it('should batch convert DTOs to groups', () => {
        const dtos = [{ name: 'ci' }, { name: 'deploy' }];
        const groups = converter.convertToGroups(dtos);
        expect(groups).toHaveLength(2);
        expect(groups[0].getName()).toBe('ci');
        expect(groups[1].getName()).toBe('deploy');
    });
});

describe('ToolConverter', () => {
    const converter = new TestToolConverter();

    it('should convert tool to DTO', () => {
        const tool = new Tool('build');
        tool.setInputSchema('{"type":"object"}');
        const dto = converter.convertFromTool(tool);
        expect(dto.name).toBe('build');
        expect(dto.schema).toBe('{"type":"object"}');
    });

    it('should convert DTO to tool', () => {
        const tool = converter.convertToTool({ name: 'deploy', schema: '{}' });
        expect(tool.getName()).toBe('deploy');
        expect(tool.getInputSchema()).toBe('{}');
    });

    it('should batch convert tools to DTOs', () => {
        const tools = [new Tool('build'), new Tool('test')];
        const dtos = converter.convertFromTools(tools);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to tools', () => {
        const dtos = [{ name: 'build' }, { name: 'test' }];
        const tools = converter.convertToTools(dtos);
        expect(tools).toHaveLength(2);
    });
});

describe('PromptConverter', () => {
    const converter = new TestPromptConverter();

    it('should convert prompt to DTO', () => {
        const prompt = new Prompt('review');
        const dto = converter.convertFromPrompt(prompt);
        expect(dto.name).toBe('review');
    });

    it('should convert DTO to prompt', () => {
        const prompt = converter.convertToPrompt({ name: 'summarize' });
        expect(prompt.getName()).toBe('summarize');
    });

    it('should batch convert prompts', () => {
        const prompts = [new Prompt('review'), new Prompt('summarize')];
        const dtos = converter.convertFromPrompts(prompts);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to prompts', () => {
        const dtos = [{ name: 'review' }, { name: 'summarize' }];
        const prompts = converter.convertToPrompts(dtos);
        expect(prompts).toHaveLength(2);
    });
});

describe('ResourceConverter', () => {
    const converter = new TestResourceConverter();

    it('should convert resource to DTO', () => {
        const resource = new Resource('config');
        resource.setUri('file:///config.yaml');
        const dto = converter.convertFromResource(resource);
        expect(dto.name).toBe('config');
        expect(dto.uri).toBe('file:///config.yaml');
    });

    it('should convert DTO to resource', () => {
        const resource = converter.convertToResource({ name: 'readme', uri: 'file:///README.md' });
        expect(resource.getName()).toBe('readme');
        expect(resource.getUri()).toBe('file:///README.md');
    });

    it('should batch convert resources', () => {
        const resources = [new Resource('a'), new Resource('b')];
        const dtos = converter.convertFromResources(resources);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to resources', () => {
        const dtos = [{ name: 'a' }, { name: 'b' }];
        const resources = converter.convertToResources(dtos);
        expect(resources).toHaveLength(2);
    });
});

describe('ToolAnnotationsConverter', () => {
    const converter = new TestToolAnnotationsConverter();

    it('should convert single tool annotations to DTO', () => {
        const ta = new ToolAnnotations();
        ta.setTitle('Deploy');
        ta.setReadOnlyHint(false);
        const dto = converter.convertFromToolAnnotations(ta);
        expect(dto.title).toBe('Deploy');
        expect(dto.readOnly).toBe(false);
    });

    it('should convert single DTO to tool annotations', () => {
        const ta = converter.convertToToolAnnotations({ title: 'Build', readOnly: true });
        expect(ta.getTitle()).toBe('Build');
        expect(ta.getReadOnlyHint()).toBe(true);
    });

    it('should batch convert tool annotations to DTOs', () => {
        const ta1 = new ToolAnnotations();
        ta1.setTitle('A');
        const ta2 = new ToolAnnotations();
        ta2.setTitle('B');
        const dtos = converter.convertFromToolAnnotations([ta1, ta2]);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to tool annotations', () => {
        const dtos = [{ title: 'A' }, { title: 'B' }];
        const tas = converter.convertToToolAnnotations(dtos);
        expect(tas).toHaveLength(2);
    });
});
