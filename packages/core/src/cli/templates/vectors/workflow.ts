/**
 * Workflow Vector — n8n connector template
 * @module
 */

/** Generate `src/n8n.ts` — n8n workflow connector */
export function n8nConnectorTs(): string {
    return [
        '/**',
        ' * n8n Connector — Workflow Automation Bridge',
        ' *',
        ' * Auto-discovers webhook workflows from your n8n instance',
        ' * and registers them as MCP tools. The connector infers',
        ' * tool semantics from workflow Notes and maintains',
        ' * live-sync with zero downtime.',
        ' *',
        ' * Configure N8N_BASE_URL and N8N_API_KEY in your .env file.',
        ' */',
        "import { N8nConnector } from 'mcp-fusion-n8n';",
        "import type { ToolRegistry } from '@vinkius-core/mcp-fusion';",
        '',
        'export async function discoverWorkflows<TContext>(',
        '    registry: ToolRegistry<TContext>,',
        '): Promise<number> {',
        "    const baseUrl = process.env['N8N_BASE_URL'];",
        "    const apiKey = process.env['N8N_API_KEY'];",
        '',
        '    if (!baseUrl || !apiKey) {',
        "        console.error('\u26A0\uFE0F  N8N_BASE_URL and N8N_API_KEY are required in .env');",
        '        return 0;',
        '    }',
        '',
        '    const connector = new N8nConnector({',
        '        baseUrl,',
        '        apiKey,',
        '    });',
        '',
        '    const tools = await connector.discover();',
        '',
        '    for (const tool of tools) {',
        '        registry.register(tool);',
        '    }',
        '',
        '    console.error(`\uD83D\uDD17 Discovered ${tools.length} n8n workflow(s)`);',
        '    return tools.length;',
        '}',
        '',
    ].join('\n');
}
