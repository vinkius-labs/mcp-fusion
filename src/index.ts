// ── Domain Models ────────────────────────────────────────
export { Role } from './domain/Role.js';
export { type Icon, createIcon } from './domain/Icon.js';
export { BaseModel } from './domain/BaseModel.js';
export { Group } from './domain/Group.js';
export { GroupItem } from './domain/GroupItem.js';
export { type Annotations, createAnnotations } from './domain/Annotations.js';
export { type ToolAnnotations, createToolAnnotations } from './domain/ToolAnnotations.js';
export { Tool } from './domain/Tool.js';
export { PromptArgument } from './domain/PromptArgument.js';
export { Prompt } from './domain/Prompt.js';
export { Resource } from './domain/Resource.js';

// ── Converters ───────────────────────────────────────────
export {
    ConverterBase,
    type GroupConverter, GroupConverterBase,
    type ToolConverter, ToolConverterBase,
    type PromptConverter, PromptConverterBase,
    type ResourceConverter, ResourceConverterBase,
    type ToolAnnotationsConverter, ToolAnnotationsConverterBase
} from './converters/index.js';

// ── Framework ────────────────────────────────────────────
export {
    success, error, required, toonSuccess,
    GroupedToolBuilder, ActionGroupBuilder,
    ToolRegistry,
    generateToonDescription,
    succeed, fail,
} from './framework/index.js';
export type {
    ToolResponse,
    ActionConfig, MiddlewareFn, GroupConfigurator,
    ToolFilter,
    ToolBuilder, ActionMetadata, AttachOptions, DetachFn,
    Result, Success, Failure,
} from './framework/index.js';
