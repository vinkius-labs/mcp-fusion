/**
 * ConfigLoader — YAML Configuration File Reader
 *
 * Loads `openapi-gen.yaml` from cwd or a specified path, validates
 * the structure, and merges with defaults. CLI args override file values.
 *
 * @module
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { mergeConfig, type GeneratorConfig, type PartialConfig } from './GeneratorConfig.js';

// ── Filename Conventions ─────────────────────────────────

const CONFIG_FILENAMES = [
    'openapi-gen.yaml',
    'openapi-gen.yml',
    'openapi-gen.json',
];

// ── Public API ───────────────────────────────────────────

/**
 * Load configuration from a YAML/JSON file.
 *
 * Priority:
 *   1. Explicit `configPath` argument
 *   2. Auto-detect `openapi-gen.yaml` in `cwd`
 *   3. Fall back to all defaults
 *
 * @param configPath - Explicit path to config file (optional)
 * @param cwd - Working directory for auto-detection (default: process.cwd())
 * @returns Fully merged GeneratorConfig
 */
export function loadConfig(configPath?: string, cwd?: string): GeneratorConfig {
    const workDir = cwd ?? process.cwd();

    // 1. Explicit path
    if (configPath) {
        const absPath = resolve(workDir, configPath);
        if (!existsSync(absPath)) {
            throw new Error(`Config file not found: "${absPath}"`);
        }
        return parseConfigFile(absPath);
    }

    // 2. Auto-detect
    for (const filename of CONFIG_FILENAMES) {
        const candidate = join(workDir, filename);
        if (existsSync(candidate)) {
            return parseConfigFile(candidate);
        }
    }

    // 3. All defaults
    return mergeConfig({});
}

/**
 * Merge a loaded config with CLI argument overrides.
 *
 * CLI args take precedence over file values.
 */
export function applyCliOverrides(config: GeneratorConfig, cli: CliOverrides): GeneratorConfig {
    return {
        ...config,
        ...(cli.input !== undefined ? { input: cli.input } : {}),
        ...(cli.output !== undefined ? { output: cli.output } : {}),
        ...(cli.baseUrl !== undefined ? { baseUrl: cli.baseUrl } : {}),
        context: {
            ...config.context,
            ...(cli.contextImport !== undefined ? { import: cli.contextImport } : {}),
        },
        server: {
            ...config.server,
            ...(cli.serverName !== undefined ? { name: cli.serverName } : {}),
        },
    };
}

/** CLI arguments that can override config file values */
export interface CliOverrides {
    readonly input?: string;
    readonly output?: string;
    readonly baseUrl?: string;
    readonly contextImport?: string;
    readonly serverName?: string;
}

// ── Internal ─────────────────────────────────────────────

function parseConfigFile(filePath: string): GeneratorConfig {
    const content = readFileSync(filePath, 'utf-8');
    const raw = filePath.endsWith('.json')
        ? JSON.parse(content) as PartialConfig
        : parseYaml(content) as PartialConfig;

    return mergeConfig(raw);
}
