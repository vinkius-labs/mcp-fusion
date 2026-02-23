import { describe, it, expect } from 'vitest';
import { Group } from '../../src/domain/Group.js';
import { Tool } from '../../src/domain/Tool.js';
import { Prompt } from '../../src/domain/Prompt.js';
import { Resource } from '../../src/domain/Resource.js';
import { createToolAnnotations } from '../../src/domain/ToolAnnotations.js';
import {
    GroupConverterBase,
    ToolConverterBase,
    PromptConverterBase,
    ResourceConverterBase,
    ToolAnnotationsConverterBase
} from '../../src/converters/index.js';
import type { ToolAnnotations } from '../../src/domain/ToolAnnotations.js';

// --- Concrete converter implementations for testing ---

interface SimpleGroupDTO {
    name: string;
    title?: string;
}

class TestGroupConverter extends GroupConverterBase<SimpleGroupDTO> {
    convertFrom(group: Group): SimpleGroupDTO {
        return { name: group.name, title: group.title };
    }

    convertTo(dto: SimpleGroupDTO): Group {
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
    convertFrom(tool: Tool): SimpleToolDTO {
        return { name: tool.name, schema: tool.inputSchema };
    }

    convertTo(dto: SimpleToolDTO): Tool {
        const tool = new Tool(dto.name);
        if (dto.schema) tool.inputSchema = dto.schema;
        return tool;
    }
}

interface SimplePromptDTO {
    name: string;
}

class TestPromptConverter extends PromptConverterBase<SimplePromptDTO> {
    convertFrom(prompt: Prompt): SimplePromptDTO {
        return { name: prompt.name };
    }

    convertTo(dto: SimplePromptDTO): Prompt {
        return new Prompt(dto.name);
    }
}

interface SimpleResourceDTO {
    name: string;
    uri?: string;
}

class TestResourceConverter extends ResourceConverterBase<SimpleResourceDTO> {
    convertFrom(resource: Resource): SimpleResourceDTO {
        return { name: resource.name, uri: resource.uri };
    }

    convertTo(dto: SimpleResourceDTO): Resource {
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
    convertFrom(ta: ToolAnnotations): SimpleToolAnnotationsDTO {
        return { title: ta.title, readOnly: ta.readOnlyHint };
    }

    convertTo(dto: SimpleToolAnnotationsDTO): ToolAnnotations {
        return createToolAnnotations({
            title: dto.title,
            readOnlyHint: dto.readOnly,
        });
    }
}

// --- Tests ---

describe('GroupConverter', () => {
    const converter = new TestGroupConverter();

    it('should convert group to DTO', () => {
        const group = new Group('ci');
        group.title = 'CI';
        const dto = converter.convertFrom(group);
        expect(dto.name).toBe('ci');
        expect(dto.title).toBe('CI');
    });

    it('should convert DTO to group', () => {
        const group = converter.convertTo({ name: 'deploy', title: 'Deploy' });
        expect(group.name).toBe('deploy');
        expect(group.title).toBe('Deploy');
    });

    it('should batch convert groups to DTOs', () => {
        const groups = [new Group('ci'), new Group('deploy')];
        const dtos = converter.convertFromBatch(groups);
        expect(dtos).toHaveLength(2);
        expect(dtos[0]?.name).toBe('ci');
        expect(dtos[1]?.name).toBe('deploy');
    });

    it('should batch convert DTOs to groups', () => {
        const dtos = [{ name: 'ci' }, { name: 'deploy' }];
        const groups = converter.convertToBatch(dtos);
        expect(groups).toHaveLength(2);
        expect(groups[0]?.name).toBe('ci');
        expect(groups[1]?.name).toBe('deploy');
    });
});

describe('ToolConverter', () => {
    const converter = new TestToolConverter();

    it('should convert tool to DTO', () => {
        const tool = new Tool('build');
        tool.inputSchema = '{"type":"object"}';
        const dto = converter.convertFrom(tool);
        expect(dto.name).toBe('build');
        expect(dto.schema).toBe('{"type":"object"}');
    });

    it('should convert DTO to tool', () => {
        const tool = converter.convertTo({ name: 'deploy', schema: '{}' });
        expect(tool.name).toBe('deploy');
        expect(tool.inputSchema).toBe('{}');
    });

    it('should batch convert tools to DTOs', () => {
        const tools = [new Tool('build'), new Tool('test')];
        const dtos = converter.convertFromBatch(tools);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to tools', () => {
        const dtos = [{ name: 'build' }, { name: 'test' }];
        const tools = converter.convertToBatch(dtos);
        expect(tools).toHaveLength(2);
    });
});

describe('PromptConverter', () => {
    const converter = new TestPromptConverter();

    it('should convert prompt to DTO', () => {
        const prompt = new Prompt('review');
        const dto = converter.convertFrom(prompt);
        expect(dto.name).toBe('review');
    });

    it('should convert DTO to prompt', () => {
        const prompt = converter.convertTo({ name: 'summarize' });
        expect(prompt.name).toBe('summarize');
    });

    it('should batch convert prompts', () => {
        const prompts = [new Prompt('review'), new Prompt('summarize')];
        const dtos = converter.convertFromBatch(prompts);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to prompts', () => {
        const dtos = [{ name: 'review' }, { name: 'summarize' }];
        const prompts = converter.convertToBatch(dtos);
        expect(prompts).toHaveLength(2);
    });
});

describe('ResourceConverter', () => {
    const converter = new TestResourceConverter();

    it('should convert resource to DTO', () => {
        const resource = new Resource('config');
        resource.uri = 'file:///config.yaml';
        const dto = converter.convertFrom(resource);
        expect(dto.name).toBe('config');
        expect(dto.uri).toBe('file:///config.yaml');
    });

    it('should convert DTO to resource', () => {
        const resource = converter.convertTo({ name: 'readme', uri: 'file:///README.md' });
        expect(resource.name).toBe('readme');
        expect(resource.uri).toBe('file:///README.md');
    });

    it('should batch convert resources', () => {
        const resources = [new Resource('a'), new Resource('b')];
        const dtos = converter.convertFromBatch(resources);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to resources', () => {
        const dtos = [{ name: 'a' }, { name: 'b' }];
        const resources = converter.convertToBatch(dtos);
        expect(resources).toHaveLength(2);
    });
});

describe('ToolAnnotationsConverter', () => {
    const converter = new TestToolAnnotationsConverter();

    it('should convert single tool annotations to DTO', () => {
        const ta = createToolAnnotations({ title: 'Deploy', readOnlyHint: false });
        const dto = converter.convertFrom(ta);
        expect(dto.title).toBe('Deploy');
        expect(dto.readOnly).toBe(false);
    });

    it('should convert single DTO to tool annotations', () => {
        const ta = converter.convertTo({ title: 'Build', readOnly: true });
        expect(ta.title).toBe('Build');
        expect(ta.readOnlyHint).toBe(true);
    });

    it('should batch convert tool annotations to DTOs', () => {
        const ta1 = createToolAnnotations({ title: 'A' });
        const ta2 = createToolAnnotations({ title: 'B' });
        const dtos = converter.convertFromBatch([ta1, ta2]);
        expect(dtos).toHaveLength(2);
    });

    it('should batch convert DTOs to tool annotations', () => {
        const dtos = [{ title: 'A' }, { title: 'B' }];
        const tas = converter.convertToBatch(dtos);
        expect(tas).toHaveLength(2);
    });
});
