/**
 * LocalServer — Development-Mode YAML Server
 *
 * Compiles a `vurb.yaml` manifest and exposes it as a local MCP server.
 * Used by `vurb yaml dev` for local development and testing.
 *
 * **Open-source**: No DLP, no FinOps, no SSRF protection.
 * Secrets resolved from `process.env`. Good enough for dev — NOT for production.
 *
 * @example
 * ```typescript
 * import { loadYamlServer } from '@vurb/yaml';
 *
 * const server = await loadYamlServer(
 *   fs.readFileSync('vurb.yaml', 'utf-8'),
 * );
 * ```
 *
 * @module
 */
import type { VurbYamlSpec } from '../schema/VurbYamlSpec.js';
import { parseVurbYaml, VurbYamlError } from '../parser/VurbYamlParser.js';
import { resolveSecretsFromEnv } from '../schema/SecretInterpolator.js';
import { resolveAllConnections, type ResolvedConnection } from '../compiler/ConnectionResolver.js';
import { compileAllTools, type CompiledTool } from '../compiler/ToolCompiler.js';
import { compileAllResources, type CompiledResource } from '../compiler/ResourceCompiler.js';
import { compileAllPrompts, type CompiledPrompt } from '../compiler/PromptCompiler.js';

/** A fully compiled YAML server — ready for MCP registration. */
export interface CompiledYamlServer {
    /** Parsed and validated spec. */
    readonly spec: VurbYamlSpec;

    /** Server metadata. */
    readonly serverMeta: VurbYamlSpec['server'];

    /** Resolved connections. */
    readonly connections: ReadonlyMap<string, ResolvedConnection>;

    /** Compiled tools with JSON Schema and execution config. */
    readonly tools: readonly CompiledTool[];

    /** Compiled resources with execution strategy. */
    readonly resources: readonly CompiledResource[];

    /** Compiled prompts with argument definitions. */
    readonly prompts: readonly CompiledPrompt[];

    /** Platform settings (parsed but NOT enforced by open-source). */
    readonly settings: VurbYamlSpec['settings'];
}

/**
 * Load and compile a `vurb.yaml` manifest into a server-ready object.
 *
 * Each pipeline step is wrapped with context-rich error messages so
 * developers always know WHICH step failed and WHY.
 *
 * @param yamlString - Raw `vurb.yaml` content
 * @param secrets - Pre-resolved secrets (if not provided, falls back to process.env)
 * @returns Compiled server ready for MCP registration
 * @throws {@link VurbYamlError} with actionable details on failure
 */
export async function loadYamlServer(
    yamlString: string,
    secrets?: Readonly<Record<string, string>>,
): Promise<CompiledYamlServer> {
    // ── 1. Parse and validate ────────────────────────────
    // VurbYamlError with .details already provides good DX
    let spec: VurbYamlSpec;
    try {
        spec = parseVurbYaml(yamlString);
    } catch (e) {
        if (e instanceof VurbYamlError) throw e;
        throw new VurbYamlError(
            `Failed to parse vurb.yaml: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    // ── 2. Resolve secrets ───────────────────────────────
    let resolvedSecrets: Record<string, string>;
    try {
        resolvedSecrets = secrets
            ? { ...secrets }
            : resolveSecretsFromEnv(Object.keys(spec.secrets ?? {}));
    } catch (e) {
        throw new VurbYamlError(
            `Secret resolution failed: ${e instanceof Error ? e.message : String(e)}`,
            undefined,
            [
                e instanceof Error ? e.message : String(e),
                'Ensure all secrets are set as environment variables.',
                'Example: export MY_SECRET="value" or set it in your .env file.',
            ],
        );
    }

    // ── 2b. Warn about missing secrets (DX) ──────────────
    if (!secrets && spec.secrets) {
        const declared = Object.keys(spec.secrets);
        const missing = declared.filter(key => !(key in resolvedSecrets));
        if (missing.length > 0) {
            const requiredMissing = missing.filter(key => spec.secrets![key]?.required);
            if (requiredMissing.length > 0) {
                throw new VurbYamlError(
                    `Missing required secrets: ${requiredMissing.join(', ')}`,
                    undefined,
                    requiredMissing.map(key =>
                        `Secret "${key}" is required but not found in environment. Set: export ${key}="your-value"`,
                    ),
                );
            }
            // Optional secrets — just warn
            for (const key of missing) {
                process.stderr.write(
                    `\x1b[33m⚠\x1b[0m Secret "${key}" is declared but not set in environment.\n`,
                );
            }
        }
    }
    return loadFromParsedSpec(spec, resolvedSecrets);
}

/**
 * Load and compile from an already parsed and validated VurbYamlSpec.
 * Use this in production runtimes to avoid double-serialization overhead.
 *
 * @param spec - Parsed and validated YAML spec
 * @param secrets - Pre-resolved secrets
 * @returns Compiled server ready for MCP registration
 * @throws {@link VurbYamlError} with actionable details on failure
 */
export function loadFromParsedSpec(
    spec: VurbYamlSpec,
    secrets: Readonly<Record<string, string>>,
): CompiledYamlServer {
    const resolvedSecrets = { ...secrets };

    // ── 3. Resolve connections ───────────────────────────
    let connections: ReadonlyMap<string, ResolvedConnection>;
    try {
        connections = resolveAllConnections(spec.connections, resolvedSecrets);
    } catch (e) {
        throw new VurbYamlError(
            `Failed to resolve connections: ${e instanceof Error ? e.message : String(e)}`,
            undefined,
            [
                e instanceof Error ? e.message : String(e),
                'Check that all ${SECRETS.KEY} references in your connections have matching env vars.',
                `Declared connections: ${Object.keys(spec.connections ?? {}).join(', ') || '(none)'}`,
            ],
        );
    }

    // ── 4. Compile tools ─────────────────────────────────
    let tools: readonly CompiledTool[];
    try {
        tools = compileAllTools(spec.tools, connections);
    } catch (e) {
        throw new VurbYamlError(
            `Failed to compile tools: ${e instanceof Error ? e.message : String(e)}`,
            undefined,
            [
                e instanceof Error ? e.message : String(e),
                `Available connections: ${[...connections.keys()].join(', ') || '(none)'}`,
                'Ensure each tool.execute.connection references a declared connection.',
            ],
        );
    }

    // ── 5. Compile resources ─────────────────────────────
    let resources: readonly CompiledResource[];
    try {
        resources = compileAllResources(spec.resources, connections, resolvedSecrets);
    } catch (e) {
        throw new VurbYamlError(
            `Failed to compile resources: ${e instanceof Error ? e.message : String(e)}`,
            undefined,
            [
                e instanceof Error ? e.message : String(e),
                'Check resource execute blocks — static, fetch, and connection types require specific fields.',
            ],
        );
    }

    // ── 6. Compile prompts ───────────────────────────────
    let prompts: readonly CompiledPrompt[];
    try {
        prompts = compileAllPrompts(spec.prompts);
    } catch (e) {
        throw new VurbYamlError(
            `Failed to compile prompts: ${e instanceof Error ? e.message : String(e)}`,
            undefined,
            [
                e instanceof Error ? e.message : String(e),
                'Ensure all prompts have valid messages with role and content fields.',
            ],
        );
    }

    return {
        spec,
        serverMeta: spec.server,
        connections,
        tools,
        resources,
        prompts,
        settings: spec.settings,
    };
}
