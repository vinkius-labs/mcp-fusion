/**
 * OpenAPI Vector — Spec + setup templates
 * @module
 */
import type { ProjectConfig } from '../../types.js';

/** Generate `openapi.yaml` — Sample OpenAPI spec */
export function openapiYaml(config: ProjectConfig): string {
    return `# OpenAPI 3.0 Specification — Sample
#
# Replace this with your actual API spec, then run:
#   npx mcp-fusion-openapi-gen ./openapi.yaml --outDir ./src/generated
#
# The generator creates Presenters, Tools, Registry, and server
# bootstrap — all configurable via YAML annotations.

openapi: '3.0.3'
info:
  title: '${config.name} API'
  version: '0.1.0'
  description: Sample API for MCP Fusion OpenAPI generation

servers:
  - url: http://localhost:3000/api

paths:
  /health:
    get:
      operationId: getHealth
      summary: Health check endpoint
      responses:
        '200':
          description: Server health status
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: healthy
                  uptime:
                    type: number
                    example: 12345.67

  /users:
    get:
      operationId: listUsers
      summary: List all users
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 10
      responses:
        '200':
          description: List of users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
`;
}

/** Generate `SETUP.md` — OpenAPI generation instructions */
export function openapiSetupMd(): string {
    return `# OpenAPI Generator Setup

This project is configured for the **Legacy API Proxy** ingestion vector.

## Steps

1. Replace \`openapi.yaml\` with your actual OpenAPI 3.x spec

2. Generate the MCP server from the spec:
   \`\`\`bash
   npx mcp-fusion-openapi-gen ./openapi.yaml --outDir ./src/generated
   \`\`\`

3. The generator creates:
   - Presenters with Zod schemas (Egress Firewall)
   - Tool builders with typed handlers
   - Registry setup with all endpoints

4. Import and register in \`src/server.ts\`:
   \`\`\`typescript
   import { generatedTools } from './generated/registry.js';
   registry.registerAll(...generatedTools);
   \`\`\`

## Documentation

See: [OpenAPI Generator](https://mcp-fusion.vinkius.com/openapi-gen)
`;
}
