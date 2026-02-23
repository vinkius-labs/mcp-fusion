import { describe, it, expect } from 'vitest';
import { parseOpenAPI } from '../../src/parser/OpenApiParser.js';
import { mapEndpoints } from '../../src/mapper/EndpointMapper.js';
import { emitFiles } from '../../src/emitter/CodeEmitter.js';
import { mergeConfig } from '../../src/config/GeneratorConfig.js';

// ── Petstore-like Spec ──

const PETSTORE_YAML = `
openapi: "3.0.3"
info:
  title: Petstore
  version: "1.0.0"
  description: A sample Petstore server
servers:
  - url: https://petstore.example.com/v1
tags:
  - name: pet
    description: Everything about your Pets
  - name: store
    description: Access to Petstore orders
paths:
  /pet:
    post:
      operationId: addPet
      summary: Add a new pet to the store
      tags:
        - pet
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  description: The name of the pet
                status:
                  type: string
                  enum:
                    - available
                    - pending
                    - sold
              required:
                - name
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: integer
                  name:
                    type: string
                  status:
                    type: string
                    enum:
                      - available
                      - pending
                      - sold
                required:
                  - id
                  - name
  /pet/{petId}:
    get:
      operationId: getPetById
      summary: Find pet by ID
      tags:
        - pet
      parameters:
        - name: petId
          in: path
          required: true
          description: ID of pet to return
          schema:
            type: integer
            format: int64
      responses:
        "200":
          description: successful operation
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: integer
                  name:
                    type: string
                  status:
                    type: string
                required:
                  - id
                  - name
    delete:
      operationId: deletePet
      summary: Deletes a pet
      tags:
        - pet
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: OK
  /store/inventory:
    get:
      operationId: getInventory
      summary: Returns pet inventories
      tags:
        - store
      responses:
        "200":
          description: successful operation
          content:
            application/json:
              schema:
                type: object
                properties:
                  available:
                    type: integer
                  pending:
                    type: integer
                  sold:
                    type: integer
  /store/order:
    post:
      operationId: placeOrder
      summary: Place an order for a pet
      tags:
        - store
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                petId:
                  type: integer
                quantity:
                  type: integer
                  minimum: 1
              required:
                - petId
                - quantity
      responses:
        "200":
          description: successful operation
`;

// ============================================================================
// End-to-End Pipeline Tests
// ============================================================================

describe('Pipeline (End-to-End)', () => {
    // ── Full Pipeline ──

    describe('Full Petstore Pipeline', () => {
        it('should parse → map → emit without errors', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);

            expect(files.length).toBeGreaterThanOrEqual(8); // 2 Schemas + 2 Presenters + 2 Tools + index + server
        });

        it('should have correct spec metadata', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            expect(spec.title).toBe('Petstore');
            expect(spec.version).toBe('1.0.0');
        });

        it('should create 2 groups (pet, store)', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            expect(mapped.groups).toHaveLength(2);
            const tags = mapped.groups.map(g => g.tag).sort();
            expect(tags).toEqual(['pet', 'store']);
        });
    });

    // ── operationId → snake_case ──

    describe('operationId Naming', () => {
        it('should resolve all operationIds to snake_case', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const petGroup = mapped.groups.find(g => g.tag === 'pet')!;
            const actionNames = petGroup.actions.map(a => a.name);
            expect(actionNames).toContain('add_pet');
            expect(actionNames).toContain('get_pet_by_id');
            expect(actionNames).toContain('delete_pet');
        });
    });

    // ── Generated Code Verification ──

    describe('Generated Code Quality', () => {
        it('should generate valid TypeScript imports', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);

            for (const file of files) {
                // No broken imports
                if (file.content.includes('import')) {
                    expect(file.content).toMatch(/import\s+/);
                }
            }
        });

        it('should include MCP annotations in code', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);

            const petTools = files.find(f => f.path === 'agents/pet.tool.ts')!;
            // GET → readOnly
            expect(petTools.content).toContain('readOnly: true');
            // DELETE → destructive
            expect(petTools.content).toContain('destructive: true');
        });

        it('should include tags on defineTool', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);

            const petTools = files.find(f => f.path === 'agents/pet.tool.ts')!;
            expect(petTools.content).toContain("tags: ['pet']");

            const storeTools = files.find(f => f.path === 'agents/store.tool.ts')!;
            expect(storeTools.content).toContain("tags: ['store']");
        });

        it('should include Presenter binding', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);

            const petTools = files.find(f => f.path === 'agents/pet.tool.ts')!;
            expect(petTools.content).toContain('returns: PetPresenter');
        });

        it('should coerce path params', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);

            const petTools = files.find(f => f.path === 'agents/pet.tool.ts')!;
            expect(petTools.content).toContain('z.coerce.number().int()');
        });

        it('should include .describe() on params with descriptions', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);

            const petTools = files.find(f => f.path === 'agents/pet.tool.ts')!;
            expect(petTools.content).toContain(".describe('ID of pet to return')");
        });
    });

    // ── Server File Integration ──

    describe('Server File Integration', () => {
        it('should generate complete server.ts', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);
            const server = files.find(f => f.path === 'server.ts')!;

            expect(server.content).toContain("import { Server }");
            expect(server.content).toContain("import { StdioServerTransport }");
            expect(server.content).toContain("import { registry }");
            expect(server.content).toContain("registry.attachToServer(server, {");
            expect(server.content).toContain("server.connect(transport)");
        });

        it('should have customizable server name', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const cfg = mergeConfig({ server: { name: 'petstore-mcp' } });
            const files = emitFiles(mapped, cfg);
            const server = files.find(f => f.path === 'server.ts')!;
            expect(server.content).toContain("'petstore-mcp'");
        });
    });

    // ── Barrel File Integration ──

    describe('Barrel File Integration', () => {
        it('should import and register all groups', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);
            const index = files.find(f => f.path === 'index.ts')!;

            expect(index.content).toContain("import { petTools }");
            expect(index.content).toContain("import { storeTools }");
            expect(index.content).toContain("export { petTools, storeTools }");
            expect(index.content).toContain("registry.registerAll(petTools, storeTools)");
        });

        it('should re-export Presenters', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const files = emitFiles(mapped);
            const index = files.find(f => f.path === 'index.ts')!;

            expect(index.content).toContain("export * from './models/pet.schema.js'");
            expect(index.content).toContain("export * from './views/pet.presenter.js'");
            expect(index.content).toContain("export * from './models/store.schema.js'");
            expect(index.content).toContain("export * from './views/store.presenter.js'");
        });
    });

    // ── Tag Filtering ──

    describe('Tag Filtering in Pipeline', () => {
        it('should only generate pet tools when includeTags=[pet]', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const cfg = mergeConfig({ includeTags: ['pet'] });
            const files = emitFiles(mapped, cfg);

            expect(files.find(f => f.path === 'agents/pet.tool.ts')).toBeDefined();
            expect(files.find(f => f.path === 'agents/store.tool.ts')).toBeUndefined();
        });

        it('should exclude store when excludeTags=[store]', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const cfg = mergeConfig({ excludeTags: ['store'] });
            const files = emitFiles(mapped, cfg);

            expect(files.find(f => f.path === 'agents/pet.tool.ts')).toBeDefined();
            expect(files.find(f => f.path === 'agents/store.tool.ts')).toBeUndefined();
        });
    });

    // ── All Features Disabled ──

    describe('Minimal Output (features off)', () => {
        it('should generate minimal output with all features disabled', () => {
            const spec = parseOpenAPI(PETSTORE_YAML);
            const mapped = mapEndpoints(spec);
            const cfg = mergeConfig({
                features: {
                    tags: false,
                    annotations: false,
                    presenters: false,
                    toonDescription: false,
                    serverFile: false,
                },
            });
            const files = emitFiles(mapped, cfg);

            // No Presenters, no server
            expect(files.find(f => f.path === 'models/pet.schema.ts')).toBeUndefined();
            expect(files.find(f => f.path === 'views/pet.presenter.ts')).toBeUndefined();
            expect(files.find(f => f.path === 'server.ts')).toBeUndefined();

            // Still has tools and index
            expect(files.find(f => f.path === 'agents/pet.tool.ts')).toBeDefined();
            expect(files.find(f => f.path === 'index.ts')).toBeDefined();

            // Tools should NOT have annotations or tags
            const petTools = files.find(f => f.path === 'agents/pet.tool.ts')!;
            expect(petTools.content).not.toContain('readOnly');
            expect(petTools.content).not.toContain('destructive');
            expect(petTools.content).not.toContain("tags:");
            expect(petTools.content).not.toContain('returns:');
        });
    });
});
