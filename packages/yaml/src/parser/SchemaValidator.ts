/**
 * SchemaValidator — Zod-based YAML Schema Validation
 *
 * Validates the raw parsed YAML object against the vinkius.yaml spec
 * using Zod schemas. Returns a typed {@link VinkiusYamlSpec} on success.
 *
 * @internal
 * @module
 */
import { z } from 'zod';
import type { VurbYamlSpec } from '../schema/VurbYamlSpec.js';
import { VurbYamlError } from './VurbYamlParser.js';

// ── Zod Sub-Schemas ──────────────────────────────────────

const SecretDefSchema = z.object({
    label: z.string(),
    description: z.string().optional(),
    type: z.enum(['string', 'api_key', 'token', 'email', 'url', 'password']),
    required: z.boolean(),
    sensitive: z.boolean().optional(),
    placeholder: z.string().optional(),
    docs_url: z.string().url().optional(),
    group: z.string().optional(),
});

const AuthDefSchema = z.object({
    type: z.enum(['none', 'bearer', 'basic', 'custom_header']),
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    header_name: z.string().optional(),
    header_value: z.string().optional(),
});

const RetryPolicySchema = z.object({
    max_attempts: z.number().int().min(1).max(10),
    backoff_ms: z.number().int().min(100),
});

const ConnectionDefSchema = z.object({
    type: z.literal('rest'),
    base_url: z.string(),
    auth: AuthDefSchema.optional(),
    headers: z.record(z.string()).optional(),
    timeout_ms: z.number().int().min(1000).optional(),
    retry: RetryPolicySchema.optional(),
});

const ResourceExecuteSchema = z.object({
    type: z.enum(['fetch', 'static', 'connection']),
    url: z.string().optional(),
    content: z.string().optional(),
    connection: z.string().optional(),
    method: z.string().optional(),
    path: z.string().optional(),
    headers: z.record(z.string()).optional(),
});

const ResponseTransformSchema = z.object({
    extract: z.array(z.string()).optional(),
    rename: z.record(z.string()).optional(),
    max_items: z.number().int().min(1).optional(),
});

const ResourceCacheSchema = z.object({
    ttl_seconds: z.number().int().min(1),
});

const ResourceDefSchema = z.object({
    name: z.string(),
    uri: z.string(),
    description: z.string().optional(),
    mime_type: z.string().optional(),
    execute: ResourceExecuteSchema,
    response: ResponseTransformSchema.optional(),
    cache: ResourceCacheSchema.optional(),
});

const PromptArgDefSchema = z.object({
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean(),
    description: z.string().optional(),
});

const PromptMessageSchema = z.object({
    role: z.enum(['user', 'system', 'assistant']),
    content: z.string(),
});

const PromptDefSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    arguments: z.record(PromptArgDefSchema).optional(),
    messages: z.array(PromptMessageSchema).min(1),
});

const ToolAnnotationsSchema = z.object({
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
});

const ParamDefSchema = z.object({
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean(),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const ToolExecuteSchema = z.object({
    connection: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string(),
    query: z.record(z.string()).optional(),
    body: z.unknown().optional(),
});

const ToolDefSchema = z.object({
    name: z.string(),
    description: z.string(),
    instruction: z.string().optional(),
    rules: z.array(z.string()).optional(),
    tag: z.string().optional(),
    annotations: ToolAnnotationsSchema.optional(),
    parameters: z.record(ParamDefSchema).optional(),
    execute: ToolExecuteSchema,
    response: ResponseTransformSchema.optional(),
});

const CapabilitiesSchema = z.object({
    tools: z.boolean().optional(),
    resources: z.boolean().optional(),
    prompts: z.boolean().optional(),
    sampling: z.boolean().optional(),
    elicitation: z.boolean().optional(),
});

const ServerMetaSchema = z.object({
    name: z.string().min(1).max(128),
    description: z.string().optional(),
    capabilities: CapabilitiesSchema.optional(),
    instructions: z.string().optional(),
});

const DlpSettingsSchema = z.object({
    enabled: z.boolean(),
    patterns: z.array(z.string()).optional(),
});

const FinopsSettingsSchema = z.object({
    enabled: z.boolean(),
    max_array_items: z.number().int().min(1).optional(),
    max_payload_bytes: z.number().int().min(1024).optional(),
    toon_compression: z.boolean().optional(),
});

const CircuitBreakerSchema = z.object({
    enabled: z.boolean(),
    threshold: z.number().int().min(1).optional(),
    reset_seconds: z.number().int().min(1).optional(),
});

const LifecycleSchema = z.object({
    idle_timeout_minutes: z.number().int().min(1).optional(),
    max_connections: z.number().int().min(1).optional(),
});

const SettingsSchema = z.object({
    dlp: DlpSettingsSchema.optional(),
    finops: FinopsSettingsSchema.optional(),
    exposition: z.enum(['flat', 'grouped', 'auto']).optional(),
    circuit_breaker: CircuitBreakerSchema.optional(),
    lifecycle: LifecycleSchema.optional(),
});

// ── Root Schema ──────────────────────────────────────────

const VurbYamlRootSchema = z.object({
    version: z.literal('1.0'),
    server: ServerMetaSchema,
    secrets: z.record(SecretDefSchema).optional(),
    connections: z.record(ConnectionDefSchema).optional(),
    resources: z.array(ResourceDefSchema).optional(),
    prompts: z.array(PromptDefSchema).optional(),
    tools: z.array(ToolDefSchema).optional(),
    settings: SettingsSchema.optional(),
});

// ── Public API ───────────────────────────────────────────

/**
 * Validate a raw parsed object against the vinkius.yaml Zod schema.
 *
 * @param raw - The raw object from YAML parsing
 * @returns Typed {@link VinkiusYamlSpec}
 * @throws {@link VinkiusYamlError} on validation failures
 *
 * @internal
 */
export function validateYamlSchema(raw: Record<string, unknown>): VurbYamlSpec {
    const result = VurbYamlRootSchema.safeParse(raw);

    if (!result.success) {
        const messages = result.error.issues.map(
            (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
        );
        throw new VurbYamlError(
            `vurb.yaml schema validation failed:\n${messages.join('\n')}`,
            undefined,
            messages,
        );
    }

    return result.data as unknown as VurbYamlSpec;
}

/** Re-export for advanced use (e.g. IDE integrations). */
export { VurbYamlRootSchema };
