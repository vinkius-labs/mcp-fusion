/**
 * PromptCompiler — YAML Prompt Definitions → Compiled Prompts
 *
 * Converts declarative YAML prompt definitions into MCP-compliant
 * prompt objects with typed arguments and message interpolation.
 *
 * @module
 */
import type { YamlPromptDef, YamlPromptMessage } from '../schema/VurbYamlSpec.js';

/** Compiled prompt argument for MCP `prompts/list`. */
export interface CompiledPromptArg {
    readonly name: string;
    readonly description?: string;
    readonly required: boolean;
}

/** A compiled prompt ready for MCP registration. */
export interface CompiledPrompt {
    /** Prompt name. */
    readonly name: string;

    /** Description shown in prompt listings. */
    readonly description?: string;

    /** Typed arguments for this prompt. */
    readonly arguments: readonly CompiledPromptArg[];

    /** Message templates (with `{{arg}}` placeholders). */
    readonly messageTemplates: readonly YamlPromptMessage[];
}

/** Regex matching {{argument}} placeholders. */
const ARG_PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Interpolate `{{arg}}` placeholders in a message template.
 *
 * @param template - Message content with placeholders
 * @param args - Map of argument name → value
 * @returns Interpolated string
 */
export function interpolatePromptArgs(
    template: string,
    args: Readonly<Record<string, string>>,
): string {
    return template.replace(ARG_PLACEHOLDER, (match, key: string) => {
        return args[key] ?? match;
    });
}

/**
 * Hydrate a prompt's messages with user-provided argument values.
 *
 * @param prompt - Compiled prompt definition
 * @param args - User-provided argument values
 * @returns Array of MCP messages with interpolated content
 */
export function hydratePromptMessages(
    prompt: CompiledPrompt,
    args: Readonly<Record<string, string>>,
): readonly { role: string; content: { type: 'text'; text: string } }[] {
    return prompt.messageTemplates.map(msg => ({
        role: msg.role,
        content: {
            type: 'text' as const,
            text: interpolatePromptArgs(msg.content, args),
        },
    }));
}

/**
 * Compile a single YAML prompt definition.
 *
 * @param def - YAML prompt definition
 * @returns Compiled prompt
 */
export function compilePrompt(def: YamlPromptDef): CompiledPrompt {
    const args: CompiledPromptArg[] = [];

    if (def.arguments) {
        for (const [name, argDef] of Object.entries(def.arguments)) {
            const arg: CompiledPromptArg = {
                name,
                required: argDef.required,
            };
            if (argDef.description !== undefined) {
                (arg as { description: string }).description = argDef.description;
            }
            args.push(arg);
        }
    }

    const result: CompiledPrompt = {
        name: def.name,
        arguments: args,
        messageTemplates: def.messages,
    };
    if (def.description !== undefined) {
        (result as { description: string }).description = def.description;
    }
    return result;
}

/**
 * Compile all YAML prompt definitions.
 */
export function compileAllPrompts(
    prompts: readonly YamlPromptDef[] | undefined,
): readonly CompiledPrompt[] {
    if (!prompts) return [];
    return prompts.map(def => compilePrompt(def));
}
