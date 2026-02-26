/**
 * Prompt Template — MCP Prompt Engine example
 * @module
 */

/** Generate `src/prompts/greet.ts` — Prompt Engine example */
export function greetPromptTs(): string {
    return [
        '/**',
        ' * Greet Prompt — Prompt Engine Example',
        ' *',
        ' * Demonstrates:',
        ' * - f.prompt() with automatic context typing',
        ' * - JSON descriptors for args (no Zod needed)',
        ' * - PromptMessage.system() + PromptMessage.user()',
        ' * - MCP prompts/list + prompts/get',
        ' */',
        "import { f } from '../fusion.js';",
        "import { PromptMessage } from '@vinkius-core/mcp-fusion';",
        '',
        "export const GreetPrompt = f.prompt('greet', {",
        "    description: 'Generate a personalized greeting for a user',",
        '    args: {',
        "        name: { type: 'string', description: 'Name of the person to greet' },",
        '        style: {',
        "            enum: ['formal', 'casual', 'pirate'] as const,",
        "            description: 'Greeting style',",
        '        },',
        '    } as const,',
        '    handler: async (_ctx, { name, style }) => ({',
        '        messages: [',
        '            PromptMessage.system(',
        '                `You are a friendly assistant. Greet the user in a ${style} style. ` +',
        '                `Be creative and enthusiastic.`',
        '            ),',
        '            PromptMessage.user(`Please greet ${name}.`),',
        '        ],',
        '    }),',
        '});',
        '',
    ].join('\n');
}
