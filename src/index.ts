/**
 * @module
 * @description
 * Models representing the core structures of MCP Fusion.
 */
// ── Domain Models ────────────────────────────────────────
/** @category Domain Models */
export { Role } from './domain/Role.js';
/** @category Domain Models */
export { type Icon, createIcon } from './domain/Icon.js';
/** @category Domain Models */
export { BaseModel } from './domain/BaseModel.js';
/** @category Domain Models */
export { Group } from './domain/Group.js';
/** @category Domain Models */
export { GroupItem } from './domain/GroupItem.js';
/** @category Domain Models */
export { type Annotations, createAnnotations } from './domain/Annotations.js';
/** @category Domain Models */
export { type ToolAnnotations, createToolAnnotations } from './domain/ToolAnnotations.js';
/** @category Domain Models */
export { Tool } from './domain/Tool.js';
/** @category Domain Models */
export { PromptArgument } from './domain/PromptArgument.js';
/** @category Domain Models */
export { Prompt } from './domain/Prompt.js';
/** @category Domain Models */
export { Resource } from './domain/Resource.js';

/**
 * @module
 * @description
 * Code structure for mapping internal schema representation to Zod.
 */
// ── Converters ───────────────────────────────────────────
/** @category Converters */
export {
    ConverterBase,
    type GroupConverter, GroupConverterBase,
    type ToolConverter, ToolConverterBase,
    type PromptConverter, PromptConverterBase,
    type ResourceConverter, ResourceConverterBase,
    type ToolAnnotationsConverter, ToolAnnotationsConverterBase
} from './converters/index.js';

/**
 * @module
 * @description
 * API for building and composing Actions, Groups, and the Tool Registry.
 */
// ── Framework ────────────────────────────────────────────
/** @category Framework */
export {
    success, error, required, toonSuccess, toolError,
    GroupedToolBuilder, ActionGroupBuilder, createTool, defineTool,
    ToolRegistry,
    generateToonDescription,
    succeed, fail,
    progress,
    defineMiddleware, resolveMiddleware,
    createFusionClient,
} from './framework/index.js';
/** @category Framework */
export type {
    ToolResponse, ToolErrorOptions,
    ActionConfig, MiddlewareFn, GroupConfigurator,
    ToolFilter,
    ToolBuilder, ActionMetadata, AttachOptions, DetachFn,
    Result, Success, Failure,
    ToolConfig, ActionDef, GroupDef,
    ParamDef, ParamsMap, InferParams,
    StringParamDef, NumberParamDef, BooleanParamDef,
    EnumParamDef, ArrayParamDef,
    ProgressEvent, ProgressSink,
    MiddlewareDefinition, MergeContext, InferContextOut,
    FusionClient, FusionTransport, RouterMap,
} from './framework/index.js';
