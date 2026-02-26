/**
 * Cursor Template — Zero-click `.cursor/mcp.json` generation
 * @module
 */
import type { ProjectConfig } from '../types.js';

/** Generate `.cursor/mcp.json` — Auto-detected by Cursor Editor */
export function cursorMcpJson(config: ProjectConfig): string {
    const serverEntry = config.transport === 'sse'
        ? { url: 'http://localhost:3001/sse' }
        : { command: 'npx', args: ['tsx', 'src/server.ts'] };

    const serverConfig = {
        mcpServers: {
            [config.name]: serverEntry,
        },
    };

    return JSON.stringify(serverConfig, null, 2) + '\n';
}
