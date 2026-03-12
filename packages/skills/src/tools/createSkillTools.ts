/**
 * createSkillTools — MCP Tool Factory for Agent Skills
 *
 * Generates a single grouped MCP tool with three actions for progressive disclosure:
 *   1. `search` — Find skills by description (Layer 1: metadata)
 *   2. `load`   — Load full instructions (Layer 2: instructions)
 *   3. `read_file` — Read auxiliary files (Layer 3: resources)
 *
 * Built using Vurb's `defineTool()` grouped builder to ensure a single
 * `ToolRegistry` entry (avoids duplicate-name registration errors).
 *
 * @module
 */

import { type SkillRegistry } from '../registry/SkillRegistry.js';

// ── Types ────────────────────────────────────────────────

/**
 * Duck-typed `defineTool()` factory — avoids hard coupling to `@vurb/core` internals.
 */
type DefineToolFn = (name: string, config: DefineToolConfig) => ToolBuilderResult;

/**
 * Minimal subset of ToolConfig used by createSkillTools.
 */
interface DefineToolConfig {
    description?: string;
    actions: Record<string, {
        readOnly?: boolean;
        params?: Record<string, string | { type: string; description?: string }>;
        description?: string;
        handler: (ctx: unknown, args: Record<string, unknown>) => unknown | Promise<unknown>;
    }>;
}

/**
 * Duck-typed result from `defineTool()`.
 */
interface ToolBuilderResult {
    getName(): string;
    buildToolDefinition(): unknown;
}

// ── Options ──────────────────────────────────────────────

/**
 * Options for skill tool creation.
 */
export interface CreateSkillToolsOptions {
    /**
     * Maximum search results per query.
     * @default 10
     */
    readonly searchLimit?: number | undefined;

    /**
     * Tool name (the grouped tool will be registered under this name).
     * Actions: `search`, `load`, `read_file`.
     * @default 'skills'
     */
    readonly prefix?: string | undefined;
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a single grouped MCP tool for serving Agent Skills.
 *
 * Returns ONE `GroupedToolBuilder` with three actions (`search`, `load`, `read_file`).
 * Register it once with `registry.register(skillsTool)`.
 *
 * @param defineTool - The `defineTool` factory from `@vurb/core`
 * @param registry - SkillRegistry with skills already loaded
 * @param options - Tool configuration
 * @returns A single tool builder with all skill actions
 *
 * @example
 * ```typescript
 * import { initVurb, ToolRegistry, defineTool } from '@vurb/core';
 * import { SkillRegistry, autoDiscoverSkills, createSkillTools } from '@vurb/skills';
 *
 * const f = initVurb<AppContext>();
 * const skills = new SkillRegistry();
 * await autoDiscoverSkills(skills, './skills');
 *
 * const skillsTool = createSkillTools(defineTool, skills);
 * const registry = f.registry();
 * registry.register(skillsTool);
 * ```
 */
export function createSkillTools(
    defineTool: DefineToolFn,
    registry: SkillRegistry,
    options: CreateSkillToolsOptions = {},
): ToolBuilderResult {
    const name = options.prefix ?? 'skills';
    const limit = options.searchLimit ?? 10;

    return defineTool(name, {
        description:
            '[INSTRUCTIONS] When this tool is available you MUST follow this workflow for EVERY user request: ' +
            '1) Call "search" to find relevant skills. ' +
            '2) Call "load" with the skill_id to get FULL instructions. ' +
            '3) FOLLOW the loaded instructions exactly. ' +
            'NEVER skip step 2 — search results are metadata only, not the actual instructions. ' +
            'Skills provide specialized behavior instructions for specific tasks.',
        actions: {
            search: {
                readOnly: true,
                description:
                    'Find skills matching the user request. ' +
                    'Returns metadata ONLY (IDs and descriptions) — NOT the actual instructions. ' +
                    'After calling search, you MUST call "load" with the returned skill_id to get the full instructions. ' +
                    'Use "*" to list all available skills.',
                params: {
                    query: { type: 'string', description: 'Describe the task you need help with (e.g. "extract PDF text"). Use "*" to list all.' },
                },
                handler: (_ctx: unknown, args: Record<string, unknown>) => {
                    const query = String(args['query'] ?? '*');
                    const result = registry.search(query, limit);
                    return {
                        skills: result.skills.map(s => ({
                            id: s.id,
                            description: s.description,
                            score: s.score,
                            ...(s.name !== s.id ? { name: s.name } : {}),
                        })),
                        total: result.total,
                    };
                },
            },

            load: {
                readOnly: true,
                description:
                    'Load complete instructions for a skill. MANDATORY after search. ' +
                    'Pass the skill_id obtained from search results. ' +
                    'Returns full step-by-step instructions that you MUST follow to handle the user request. ' +
                    'The returned instructions define your behavior — follow them exactly.',
                params: {
                    skill_id: { type: 'string', description: 'Skill ID returned by search (e.g. "pdf-processing")' },
                },
                handler: (_ctx: unknown, args: Record<string, unknown>) => {
                    const skillId = String(args['skill_id'] ?? '');
                    const skill = registry.load(skillId);

                    if (!skill) {
                        return {
                            error: `Skill "${skillId}" not found`,
                            hint: `Use ${name}.search to find valid skill IDs`,
                        };
                    }

                    return {
                        id: skill.id,
                        name: skill.name,
                        description: skill.description,
                        instructions: skill.instructions,
                        files: skill.files,
                    };
                },
            },

            read_file: {
                readOnly: true,
                description:
                    'Read a file from a skill\'s files list. ' +
                    'Pass the skill_id and file_path from the load result. ' +
                    'Example: skill_id="pdf-processing", file_path="scripts/extract.sh". ' +
                    'Returns text (utf-8) or binary (base64) content.',
                params: {
                    skill_id: { type: 'string', description: 'Skill ID from load result' },
                    file_path: { type: 'string', description: 'File path from the skill files list (e.g. "scripts/deploy.sh")' },
                },
                handler: async (_ctx: unknown, args: Record<string, unknown>) => {
                    const skillId = String(args['skill_id'] ?? '');
                    const filePath = String(args['file_path'] ?? '');

                    try {
                        const result = await registry.readFile(skillId, filePath);
                        return {
                            content: result.content,
                            size: result.size,
                            encoding: result.encoding,
                            mime_type: result.mimeType,
                        };
                    } catch (err) {
                        // Sanitize: fs errors often contain absolute paths
                        const rawMsg = err instanceof Error ? err.message : String(err);
                        const safeMsg = rawMsg.includes(filePath)
                            ? rawMsg.replace(/[A-Z]:[\\\/][^"'\s]+/gi, '<path>').replace(/\/[\w/.-]+\/[\w.-]+/g, '<path>')
                            : `Cannot read file "${filePath}"`;
                        return {
                            error: safeMsg,
                            hint: `Use ${name}.load to see available files for this skill`,
                        };
                    }
                },
            },
        },
    });
}
