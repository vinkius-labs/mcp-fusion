import { describe, it, expect } from 'vitest';
import { Group } from '../src/Group.js';
import { Tool } from '../src/Tool.js';
import { Prompt } from '../src/Prompt.js';
import { Resource } from '../src/Resource.js';
import { ToolAnnotations } from '../src/ToolAnnotations.js';
import {
    GroupConverterBase,
    ToolConverterBase,
    PromptConverterBase,
    ResourceConverterBase,
    ToolAnnotationsConverterBase
} from '../src/converters/index.js';

// --- Concrete converter implementations for testing ---

interface SimpleGroupDTO {
    name: string;
    title?: string;
}

class TestGroupConverter extends GroupConverterBase<SimpleGroupDTO> {
    public convertFromGroup(group: Group): SimpleGroupDTO {
        return { name: group.name, title: group.title };
    }

    public convertToGroup(dto: SimpleGroupDTO): Group {
        const group = new Group(dto.name);
        if (dto.title) group.title = dto.title;
        return group;
    }
}

interface SimpleToolDTO {
    name: string;
    schema?: string;
}

class TestToolConverter extends ToolConverterBase<SimpleToolDTO> {
    public convertFromTool(tool: Tool): SimpleToolDTO {
        return { name: tool.name, schema: tool.inputSchema };
    }

    public convertToTool(dto: SimpleToolDTO): Tool {
        const tool = new Tool(dto.name);
        if (dto.schema) tool.inputSchema = dto.schema;
        return tool;
    }
}

interface SimplePromptDTO {
    name: string;
}

class TestPromptConverter extends PromptConverterBase<SimplePromptDTO> {
    public convertFromPrompt(prompt: Prompt): SimplePromptDTO {
        return { name: prompt.name };
    }

    public convertToPrompt(dto: SimplePromptDTO): Prompt {
        return new Prompt(dto.name);
    }
}

interface SimpleResourceDTO {
    name: string;
    uri?: string;
}

class TestResourceConverter extends ResourceConverterBase<SimpleResourceDTO> {
    public convertFromResource(resource: Resource): SimpleResourceDTO {
        return { name: resource.name, uri: resource.uri };
    }

    public convertToResource(dto: SimpleResourceDTO): Resource {
        const resource = new Resource(dto.name);
        if (dto.uri) resource.uri = dto.uri;
        return resource;
    }
}

interface SimpleToolAnnotationsDTO {
    title?: string;
    readOnly?: boolean;
}

class TestToolAnnotationsConverter extends ToolAnnotationsConverterBase<SimpleToolAnnotationsDTO> {
    protected convertFromToolAnnotation(ta: ToolAnnotations): SimpleToolAnnotationsDTO {
        return { title: ta.title, readOnly: ta.readOnlyHint };
    }

    protected convertToToolAnnotation(dto: SimpleToolAnnotationsDTO): ToolAnnotations {
        const ta = new ToolAnnotations();
        if (dto.title) ta.title = dto.title;
        if (dto.readOnly !== undefined) ta.readOnlyHint = dto.readOnly;
        return ta;
    }
}

// --- Tests ---

describe('GroupConverter', () => {
    const converter = new TestGroupConverter();

    it('should convert group to DTO', () => {
        const group = new Group('ci');
        group.title = 'CI';
        const dto = converter.convertFromGroup(group);
        expect(dto.name).toBe('ci');
        expect(dto.title).toBe('CI');
    });

    it('should convert DTO to group', () => {
        const group = converter.convertToGroup({ name: 'deploy', title: 'Deploy' });
        expect(group.name).toBe('deploy');
        expect(group.title).toBe('Deploy');
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
        expect(groups[0].name).toBe('ci');
        expect(groups[1].name).toBe('deploy');
    });
});

describe('ToolConverter', () => {
    const converter = new TestToolConverter();

    it('should convert tool to DTO', () => {
        const tool = new Tool('build');
        tool.inputSchema = '{"type":"object"}';
        const dto = converter.convertFromTool(tool);
        expect(dto.name).toBe('build');
        expect(dto.schema).toBe('{"type":"object"}');
    });

    it('should convert DTO to tool', () => {
        const tool = converter.convertToTool({ name: 'deploy', schema: '{}' });
        expect(tool.name).toBe('deploy');
        expect(tool.inputSchema).toBe('{}');
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
        expect(prompt.name).toBe('summarize');
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
        resource.uri = 'file:///config.yaml';
        const dto = converter.convertFromResource(resource);
        expect(dto.name).toBe('config');
        expect(dto.uri).toBe('file:///config.yaml');
    });

    it('should convert DTO to resource', () => {
        const resource = converter.convertToResource({ name: 'readme', uri: 'file:///README.md' });
        expect(resource.name).toBe('readme');
        expect(resource.uri).toBe('file:///README.md');
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
        ta.title = 'Deploy';
        ta.readOnlyHint = false;
        const dto = converter.convertFromToolAnnotation(ta);
        expect(dto.title).toBe('Deploy');
        expect(dto.readOnly).toBe(false);
    });

    it('should convert single DTO to tool annotations', () => {
        const ta = converter.convertToToolAnnotation({ title: 'Build', readOnly: true });
        expect(ta.title).toBe('Build');
        expect(ta.readOnlyHint).toBe(true);
    });

    it('should batch convert tool annotations to DTOs', () => {
        const ta1 = new ToolAnnotations();
        ta1.title = 'A';
        const ta2 = new ToolAnnotations();
        ta2.title = 'B';
        const dtos = converter.convertFromToolAnnotations([ta1, ta2]);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to tool annotations', () => {
        const dtos = [{ title: 'A' }, { title: 'B' }];
        const tas = converter.convertToToolAnnotations(dtos);
        expect(tas).toHaveLength(2);
    });
});
