/**
 * @vurb/yaml — Declarative MCP Server Engine
 *
 * Define MCP servers with zero code. Write a `vurb.yaml` manifest
 * and the engine compiles it into a fully compliant MCP server
 * with tools, resources, and prompts.
 *
 * @example
 * ```typescript
 * import { parseVurbYaml, loadYamlServer } from '@vurb/yaml';
 *
 * // Parse and validate
 * const spec = parseVurbYaml(yamlString);
 *
 * // Compile into a server-ready object
 * const server = await loadYamlServer(yamlString);
 * console.log(server.tools);      // Compiled tools
 * console.log(server.resources);   // Compiled resources
 * console.log(server.prompts);     // Compiled prompts
 * ```
 *
 * @module
 */

// ── Schema — The Specification Types ─────────────────────
export type {
    VurbYamlSpec,
    YamlServerMeta,
    YamlCapabilities,
    YamlSecretDef,
    YamlSecretType,
    YamlConnectionDef,
    YamlConnectionType,
    YamlAuthDef,
    YamlAuthType,
    YamlRetryPolicy,
    YamlResourceDef,
    YamlResourceExecute,
    YamlResourceExecuteType,
    YamlResourceCacheDef,
    YamlPromptDef,
    YamlPromptArgDef,
    YamlPromptMessage,
    YamlToolDef,
    YamlToolAnnotations,
    YamlToolExecute,
    YamlParamDef,
    YamlResponseTransform,
    YamlSettings,
    YamlDlpSettings,
    YamlFinopsSettings,
    YamlCircuitBreakerSettings,
    YamlLifecycleSettings,
    YamlExposition,
} from './schema/VurbYamlSpec.js';

// ── Parser ───────────────────────────────────────────────
export { parseVurbYaml, VurbYamlError } from './parser/VurbYamlParser.js';
export { validateYamlSchema, VurbYamlRootSchema } from './parser/SchemaValidator.js';
export { validateCrossRefs } from './parser/CrossRefValidator.js';

// ── Schema Utilities ─────────────────────────────────────
export {
    interpolateSecrets,
    interpolateSecretsDeep,
    resolveSecretsFromEnv,
} from './schema/SecretInterpolator.js';
export { compileParameters } from './schema/ParameterCompiler.js';
export type { CompiledInputSchema } from './schema/ParameterCompiler.js';

// ── Compilers ────────────────────────────────────────────
export { resolveConnection, resolveAllConnections } from './compiler/ConnectionResolver.js';
export type { ResolvedConnection } from './compiler/ConnectionResolver.js';

export { compileTool, compileAllTools } from './compiler/ToolCompiler.js';
export type { CompiledTool } from './compiler/ToolCompiler.js';

export { compileResource, compileAllResources } from './compiler/ResourceCompiler.js';
export type { CompiledResource, CompiledResourceExecute } from './compiler/ResourceCompiler.js';

export { compilePrompt, compileAllPrompts, interpolatePromptArgs, hydratePromptMessages } from './compiler/PromptCompiler.js';
export type { CompiledPrompt, CompiledPromptArg } from './compiler/PromptCompiler.js';

export { extractPath, applyResponseTransform } from './compiler/ResponseTransformer.js';

// ── Runtime ──────────────────────────────────────────────
export { loadYamlServer } from './runtime/LocalServer.js';
export type { CompiledYamlServer } from './runtime/LocalServer.js';

export { createYamlMcpServer, buildToolsList, buildResourcesList, buildPromptsList, readResourceContent } from './runtime/YamlMcpServer.js';
export type { YamlServerOptions, YamlServerResult, YamlServerTransport } from './runtime/YamlMcpServer.js';

export { executeYamlTool, interpolateParams, interpolateDeep } from './runtime/BasicToolExecutor.js';
export type { ToolCallResult } from './runtime/BasicToolExecutor.js';

// ── CLI Plugin ───────────────────────────────────────────
export { commandYaml, YAML_HELP } from './cli/yaml.js';
