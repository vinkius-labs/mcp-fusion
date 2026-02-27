/** Builder Bounded Context — Barrel Export */
export { GroupedToolBuilder, ActionGroupBuilder, createTool } from './GroupedToolBuilder.js';
export type { GroupConfigurator } from './ActionGroupBuilder.js';
export { compileToolDefinition } from './ToolDefinitionCompiler.js';
export { defineTool } from './defineTool.js';
export type { ToolConfig, ActionDef, GroupDef } from './defineTool.js';
export { convertParamsToZod } from './ParamDescriptors.js';
export type {
    ParamDef, ParamsMap, InferParams,
    StringParamDef, NumberParamDef, BooleanParamDef,
    EnumParamDef, ArrayParamDef,
} from './ParamDescriptors.js';

// ── Fluent API ───────────────────────────────────────────
export { FluentToolBuilder } from './FluentToolBuilder.js';
export type { SemanticDefaults, InferInputSchema } from './FluentToolBuilder.js';
export { FluentRouter } from './FluentRouter.js';
export { ErrorBuilder } from './ErrorBuilder.js';
export {
    FluentString, FluentNumber, FluentBoolean, FluentEnum, FluentArray,
    isFluentDescriptor, resolveFluentParams,
} from './FluentSchemaHelpers.js';
export type {
    FluentDescriptor, FluentParamsMap, InferFluentParams,
} from './FluentSchemaHelpers.js';
