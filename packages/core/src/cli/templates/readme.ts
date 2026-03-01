/**
 * README Template — Quick-start guide with client config snippets
 * @module
 */
import type { ProjectConfig } from '../types.js';

/** Generate `README.md` with Claude/Cursor config snippets */
export function readme(config: ProjectConfig): string {
    const clientEntry = config.transport === 'sse'
        ? { url: 'http://localhost:3001/sse' }
        : { command: 'npx', args: ['tsx', 'src/server.ts'] };

    const clientConfig = JSON.stringify({
        mcpServers: {
            [config.name]: clientEntry,
        },
    }, null, 2);

    const sseNote = config.transport === 'sse'
        ? `\n> **Note:** SSE transport requires the server to be running first. Run \\\`npm start\\\` before connecting.`
        : '';

    return `# ${config.name}

MCP Server built with [MCP Fusion](https://mcp-fusion.vinkius.com/) — the MVA framework for the Model Context Protocol.

## Quick Start

\`\`\`bash
npm install
fusion dev
\`\`\`
${config.testing ? `
## Testing

\`\`\`bash
npm test
\`\`\`
` : ''}
## Project Structure

\`\`\`
src/
├── fusion.ts          # initFusion<AppContext>() — context center
├── context.ts         # AppContext type + factory
├── server.ts          # Bootstrap with autoDiscover
├── tools/             # Drop a file → it's a tool (autoDiscover)
│   └── system/
│       ├── health.ts  # Health check with Presenter
│       └── echo.ts    # Echo for connectivity testing
├── presenters/        # MVA View Layer (Egress Firewall)
│   └── SystemPresenter.ts
├── prompts/           # MCP Prompt Engine
│   └── greet.ts
└── middleware/        # RBAC guards
    └── auth.ts
\`\`\`

## Client Configuration

### Cursor Editor

> **Already configured!** The \`.cursor/mcp.json\` file was generated automatically.
> Just open this folder in Cursor and the server connects instantly.
${sseNote}

### Claude Desktop

Add to your \`claude_desktop_config.json\`:

\`\`\`json
${clientConfig}
\`\`\`
${vectorReadmeSection(config)}
## Adding New Tools

Create a new file in \`src/tools/\`. It's automatically discovered:

\`\`\`typescript
// src/tools/my-domain/my-tool.ts
import { f } from '../../fusion.js';

export default f.query('my_domain.my_tool')
    .describe('What this tool does')
    .withString('query', 'Search query')
    .handle(async (input, ctx) => {
        return { result: input.query };
    });
\`\`\`

No registration needed. The \`autoDiscover()\` system picks it up automatically.

## Documentation

- [MCP Fusion Docs](https://mcp-fusion.vinkius.com/)
- [Presenter — Egress Firewall](https://mcp-fusion.vinkius.com/presenter)
- [DX Guide — initFusion()](https://mcp-fusion.vinkius.com/dx-guide)
- [Testing](https://mcp-fusion.vinkius.com/testing)
`;
}

/** Vector-specific README section */
function vectorReadmeSection(config: ProjectConfig): string {
    switch (config.vector) {
        case 'prisma':
            return `
## Database Setup (Prisma)

1. Configure your database URL in \`.env\`:
   \`\`\`
   DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
   \`\`\`

2. Edit \`prisma/schema.prisma\` to define your models

3. Generate the Prisma client and Fusion tools:
   \`\`\`bash
   npm run db:generate
   \`\`\`

4. Push the schema to your database:
   \`\`\`bash
   npm run db:push
   \`\`\`

Use \`/// @fusion.hide\` on sensitive fields to strip them from the Egress Firewall.
`;
        case 'n8n':
            return `
## n8n Workflow Setup

1. Configure your n8n instance in \`.env\`:
   \`\`\`
   N8N_BASE_URL=http://localhost:5678
   N8N_API_KEY=your-api-key
   \`\`\`

2. The connector in \`src/n8n.ts\` auto-discovers webhook workflows
   and registers them as MCP tools.
`;
        case 'openapi':
            return `
## OpenAPI Generator Setup

1. Replace \`openapi.yaml\` with your actual OpenAPI 3.x spec

2. Generate the MCP server from the spec:
   \`\`\`bash
   npx @vinkius-core/mcp-fusion-openapi-gen ./openapi.yaml --outDir ./src/generated
   \`\`\`

3. Import and register the generated tools in \`src/server.ts\`
`;
        case 'oauth':
            return `
## OAuth Device Flow Setup

1. Configure your OAuth provider in \`.env\`:
   \`\`\`
   OAUTH_CLIENT_ID=your-client-id
   OAUTH_AUTH_ENDPOINT=https://api.example.com/oauth/device/code
   OAUTH_TOKEN_ENDPOINT=https://api.example.com/oauth/device/token
   \`\`\`

2. The auth tool in \`src/auth.ts\` is pre-configured with login, complete, status, and logout actions.

3. Protect any tool with the \`withAuth\` middleware from \`src/middleware/auth.ts\`:
   \`\`\`ts
   import { withAuth } from '../middleware/auth.js';

   export default f.query('protected.action')
       .describe('A protected query')
       .use(withAuth)
       .handle(async (input, ctx) => {
           // ctx is authenticated
       });
   \`\`\`
`;
        default:
            return '';
    }
}
