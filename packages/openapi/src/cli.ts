#!/usr/bin/env node
/**
 * CLI Entry Point — openapi-gen
 *
 * Usage:
 *   openapi-gen generate -i <spec> -o <outDir> [--config <config.yaml>] [--base-url <url>]
 *
 * @module
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseOpenAPI } from './parser/OpenApiParser.js';
import { mapEndpoints } from './mapper/EndpointMapper.js';
import { emitFiles } from './emitter/CodeEmitter.js';
import { loadConfig, applyCliOverrides, type CliOverrides } from './config/ConfigLoader.js';
import type { GeneratorConfig } from './config/GeneratorConfig.js';

// ── Arg Parsing ──────────────────────────────────────────

interface RawCliArgs {
    command: string;
    input?: string;
    output?: string;
    baseUrl?: string;
    context?: string;
    config?: string;
    serverName?: string;
}

function parseArgs(argv: string[]): RawCliArgs {
    const args = argv.slice(2);
    const command = args[0] ?? '';

    const result: Record<string, string | undefined> = {};

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '-i':
            case '--input':
                result['input'] = args[++i];
                break;
            case '-o':
            case '--output':
                result['output'] = args[++i];
                break;
            case '--base-url':
                result['baseUrl'] = args[++i];
                break;
            case '--context':
                result['context'] = args[++i];
                break;
            case '-c':
            case '--config':
                result['config'] = args[++i];
                break;
            case '--server-name':
                result['serverName'] = args[++i];
                break;
        }
    }

    return {
        command,
        ...(result['input'] !== undefined ? { input: result['input'] } : {}),
        ...(result['output'] !== undefined ? { output: result['output'] } : {}),
        ...(result['baseUrl'] !== undefined ? { baseUrl: result['baseUrl'] } : {}),
        ...(result['context'] !== undefined ? { context: result['context'] } : {}),
        ...(result['config'] !== undefined ? { config: result['config'] } : {}),
        ...(result['serverName'] !== undefined ? { serverName: result['serverName'] } : {}),
    };
}

// ── Commands ─────────────────────────────────────────────

function runGenerate(rawArgs: RawCliArgs): void {
    // Load config (YAML file → defaults → CLI overrides)
    const baseConfig = loadConfig(rawArgs.config);

    const overrides: CliOverrides = {
        ...(rawArgs.input !== undefined ? { input: rawArgs.input } : {}),
        ...(rawArgs.output !== undefined ? { output: rawArgs.output } : {}),
        ...(rawArgs.baseUrl !== undefined ? { baseUrl: rawArgs.baseUrl } : {}),
        ...(rawArgs.context !== undefined ? { contextImport: rawArgs.context } : {}),
        ...(rawArgs.serverName !== undefined ? { serverName: rawArgs.serverName } : {}),
    };

    const config: GeneratorConfig = applyCliOverrides(baseConfig, overrides);

    // Resolve input
    const inputPath = config.input ?? rawArgs.input;
    if (!inputPath) {
        console.error('Error: --input (-i) is required (or set `input` in config file).');
        console.error('Usage: openapi-gen generate -i <spec.yaml> -o <outDir>');
        process.exit(1);
    }

    const specPath = resolve(inputPath);
    let specContent: string;
    try {
        specContent = readFileSync(specPath, 'utf-8');
    } catch {
        console.error(`Error: Cannot read file "${specPath}".`);
        process.exit(1);
    }

    console.log(`📂 Parsing: ${specPath}`);

    // Parse + Map
    const spec = parseOpenAPI(specContent);
    const mapped = mapEndpoints(spec);

    console.log(`✅ Parsed: ${spec.title} v${spec.version}`);
    console.log(`📋 Groups: ${mapped.groups.length}`);

    const totalActions = mapped.groups.reduce((sum, g) => sum + g.actions.length, 0);
    console.log(`🔧 Actions: ${totalActions}`);

    // Show active features
    console.log(`\n⚙️  Features:`);
    console.log(`   Tags: ${config.features.tags ? '✅' : '❌'}`);
    console.log(`   Annotations: ${config.features.annotations ? '✅' : '❌'}`);
    console.log(`   Presenters: ${config.features.presenters ? '✅' : '❌'}`);
    console.log(`   Descriptions: ${config.features.descriptions ? '✅' : '❌'}`);
    console.log(`   Server file: ${config.features.serverFile ? '✅' : '❌'}`);
    console.log(`   toonDescription: ${config.features.toonDescription ? '✅' : '❌'}`);

    // Emit
    const files = emitFiles(mapped, config);

    // Write output
    const outDir = resolve(config.output ?? './generated');
    mkdirSync(outDir, { recursive: true });

    for (const file of files) {
        const filePath = join(outDir, file.path);
        writeFileSync(filePath, file.content, 'utf-8');
        console.log(`  📄 ${file.path}`);
    }

    console.log(`\n🎉 Generated ${files.length} files in ${outDir}`);

    if (config.features.serverFile) {
        console.log(`\n🚀 Run your MCP server:`);
        console.log(`   API_BASE_URL=https://api.example.com npx tsx ${outDir}/server.ts`);
    }
}

function printHelp(): void {
    console.log(`
openapi-gen — OpenAPI → MCP Fusion Server Generator

USAGE:
  openapi-gen generate -i <spec> -o <outDir> [options]

COMMANDS:
  generate    Parse OpenAPI spec and generate a complete MCP Server

OPTIONS:
  -i, --input <file>         OpenAPI spec file (YAML or JSON)
  -o, --output <dir>         Output directory (default: ./generated)
  -c, --config <file>        Config file (default: auto-detect openapi-gen.yaml)
  --base-url <url>           Base URL expression for fetch calls
  --context <path#Type>      Custom context type import
  --server-name <name>       MCP Server name
  --help                     Show this help message

CONFIG FILE (openapi-gen.yaml):
  input: ./petstore.yaml
  output: ./src/generated
  features:
    tags: true
    annotations: true
    presenters: true
    descriptions: true
    deprecated: comment       # skip | comment | include
    toonDescription: false
    serverFile: true
  context:
    import: '../types.js#AppCtx'
  server:
    name: my-api-server
    version: 1.0.0
    transport: stdio
  includeTags: []
  excludeTags: []

EXAMPLES:
  openapi-gen generate -i petstore.yaml -o ./src/mcp
  openapi-gen generate -i api.json -o ./mcp --config project.yaml
  openapi-gen generate -i spec.yaml -o ./tools --server-name "my-tools"
`);
}

// ── Main ─────────────────────────────────────────────────

const cliArgs = parseArgs(process.argv);

switch (cliArgs.command) {
    case 'generate':
        runGenerate(cliArgs);
        break;
    case '--help':
    case 'help':
    case '':
        printHelp();
        break;
    default:
        console.error(`Unknown command: "${cliArgs.command}". Use --help for usage.`);
        process.exit(1);
}
