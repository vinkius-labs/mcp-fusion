/**
 * VurbYamlSpec — The MCP Server Manifest Type System
 *
 * Defines the complete type system for `vurb.yaml` — the declarative
 * format for MCP servers. These types ARE the specification.
 *
 * @example
 * ```yaml
 * version: "1.0"
 * server:
 *   name: "my-server"
 * tools:
 *   - name: get_user
 *     description: "Fetches user data"
 *     instruction: "Use when you need user profile info"
 *     rules:
 *       - "Never expose passwords"
 * ```
 *
 * @module
 */

// ── Root Spec ────────────────────────────────────────────

/** The complete `vurb.yaml` manifest. */
export interface VurbYamlSpec {
    /** Spec version. Currently only "1.0". */
    readonly version: string;

    /** Server identity and capability declaration. */
    readonly server: YamlServerMeta;

    /**
     * Secret declarations — schema only, never values.
     * Maps to {@link McpServer.credential_schema}.
     */
    readonly secrets?: Readonly<Record<string, YamlSecretDef>>;

    /**
     * Named connection pools — reusable across tools and resources.
     * A single server can talk to multiple external APIs.
     */
    readonly connections?: Readonly<Record<string, YamlConnectionDef>>;

    /** MCP Resources — read-only data endpoints for LLM context. */
    readonly resources?: readonly YamlResourceDef[];

    /** MCP Prompts — pre-built conversation templates. */
    readonly prompts?: readonly YamlPromptDef[];

    /** MCP Tools — executable functions the LLM can invoke. */
    readonly tools?: readonly YamlToolDef[];

    /**
     * Platform settings — DLP, FinOps, circuit breaker.
     * Parsed by the open-source parser but ONLY enforced by the
     * Vinkius Engine (proprietary).
     */
    readonly settings?: YamlSettings;
}

// ── Server ───────────────────────────────────────────────

export interface YamlServerMeta {
    /** Unique server name (kebab-case recommended). */
    readonly name: string;

    /** Human-readable description of the server's purpose. */
    readonly description?: string;

    /**
     * MCP capability flags declared during initialization.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
     */
    readonly capabilities?: YamlCapabilities;

    /**
     * System-level instructions injected into the LLM context
     * when this server connects. Sets the behavioral tone.
     */
    readonly instructions?: string;
}

export interface YamlCapabilities {
    readonly tools?: boolean;
    readonly resources?: boolean;
    readonly prompts?: boolean;
    /** Allows the server to request LLM completions from the host. */
    readonly sampling?: boolean;
    /** Allows the server to ask users questions mid-execution. */
    readonly elicitation?: boolean;
}

// ── Secrets ──────────────────────────────────────────────

/** Secret types supported by the credential vault. */
export type YamlSecretType =
    | 'string'
    | 'api_key'
    | 'token'
    | 'email'
    | 'url'
    | 'password';

export interface YamlSecretDef {
    /** Human-readable label shown in the credential form. */
    readonly label: string;

    /** Help text explaining what this credential is for. */
    readonly description?: string;

    /** Semantic type of the credential value. */
    readonly type: YamlSecretType;

    /** Whether this credential is mandatory for deployment. */
    readonly required: boolean;

    /** Whether the value should be masked in logs and UI. */
    readonly sensitive?: boolean;

    /** Input placeholder hint. */
    readonly placeholder?: string;

    /** Link to documentation on how to obtain this credential. */
    readonly docs_url?: string;

    /** UI group label for organizing related credentials. */
    readonly group?: string;
}

// ── Connections ──────────────────────────────────────────

export type YamlConnectionType = 'rest';

export type YamlAuthType = 'none' | 'bearer' | 'basic' | 'custom_header';

export interface YamlAuthDef {
    readonly type: YamlAuthType;
    /** Bearer token value (supports ${SECRETS.KEY} interpolation). */
    readonly token?: string;
    /** Basic auth username. */
    readonly username?: string;
    /** Basic auth password. */
    readonly password?: string;
    /** Custom header name (when type is 'custom_header'). */
    readonly header_name?: string;
    /** Custom header value. */
    readonly header_value?: string;
}

export interface YamlRetryPolicy {
    readonly max_attempts: number;
    readonly backoff_ms: number;
}

export interface YamlConnectionDef {
    /** Connection protocol. Currently only 'rest'. */
    readonly type: YamlConnectionType;

    /** Base URL (supports ${SECRETS.KEY} interpolation). */
    readonly base_url: string;

    /** Authentication configuration. */
    readonly auth?: YamlAuthDef;

    /** Default headers applied to all requests via this connection. */
    readonly headers?: Readonly<Record<string, string>>;

    /**
     * Request timeout in milliseconds.
     * ⚠️ Only enforced by the Vinkius Engine (proprietary).
     */
    readonly timeout_ms?: number;

    /**
     * Retry policy for transient failures.
     * ⚠️ Only enforced by the Vinkius Engine (proprietary).
     */
    readonly retry?: YamlRetryPolicy;
}

// ── Resources ────────────────────────────────────────────

/** How a resource fetches its content. */
export type YamlResourceExecuteType = 'fetch' | 'static' | 'connection';

export interface YamlResourceExecute {
    /** Execution strategy. */
    readonly type: YamlResourceExecuteType;

    /** URL to fetch (when type is 'fetch'). */
    readonly url?: string;

    /** Static inline content (when type is 'static'). */
    readonly content?: string;

    /** Named connection reference (when type is 'connection'). */
    readonly connection?: string;

    /** HTTP method (when type is 'connection'). */
    readonly method?: string;

    /** Request path relative to connection base_url. */
    readonly path?: string;

    /** Additional headers for fetch-type resources. */
    readonly headers?: Readonly<Record<string, string>>;
}

export interface YamlResourceCacheDef {
    /** Time-to-live in seconds. After expiry, the resource is re-fetched. */
    readonly ttl_seconds: number;
}

export interface YamlResourceDef {
    /** Human-readable resource name. */
    readonly name: string;

    /**
     * Resource URI or URI template.
     * Templates use `{param}` syntax: `rh://employees/{id}/profile`
     */
    readonly uri: string;

    /** Description shown to AI agents. */
    readonly description?: string;

    /** MIME type of the resource content. Defaults to 'application/json'. */
    readonly mime_type?: string;

    /** How to fetch or resolve the resource content. */
    readonly execute: YamlResourceExecute;

    /** Response transformation — extract specific fields. */
    readonly response?: YamlResponseTransform;

    /**
     * Caching policy.
     * ⚠️ Only enforced by the Vinkius Engine (proprietary).
     */
    readonly cache?: YamlResourceCacheDef;
}

// ── Prompts ──────────────────────────────────────────────

export interface YamlPromptArgDef {
    /** Argument type. */
    readonly type: 'string' | 'number' | 'boolean';
    /** Whether this argument is mandatory. */
    readonly required: boolean;
    /** Help text for this argument. */
    readonly description?: string;
}

export interface YamlPromptMessage {
    /** Message role per MCP spec. */
    readonly role: 'user' | 'system' | 'assistant';
    /**
     * Message content. Supports `{{arg_name}}` interpolation
     * for prompt arguments.
     */
    readonly content: string;
}

export interface YamlPromptDef {
    /** Unique prompt name (snake_case recommended). */
    readonly name: string;

    /** Human-readable description shown in prompt listings. */
    readonly description?: string;

    /** Typed arguments the user must fill when selecting this prompt. */
    readonly arguments?: Readonly<Record<string, YamlPromptArgDef>>;

    /** Ordered messages composing the prompt template. */
    readonly messages: readonly YamlPromptMessage[];
}

// ── Tools ────────────────────────────────────────────────

/**
 * MCP Tool Annotations — advisory hints for the host.
 * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools
 */
export interface YamlToolAnnotations {
    /** Tool only reads data — no side effects. */
    readonly readOnlyHint?: boolean;
    /** Tool may delete or overwrite data. */
    readonly destructiveHint?: boolean;
    /** Same input always produces same effect (safe to retry). */
    readonly idempotentHint?: boolean;
    /** Tool interacts with external systems (public APIs, etc.). */
    readonly openWorldHint?: boolean;
}

/** YAML parameter definition — converted to JSON Schema at compile time. */
export interface YamlParamDef {
    /** Scalar type. */
    readonly type: 'string' | 'number' | 'boolean';
    /** Whether this parameter is mandatory. */
    readonly required: boolean;
    /** Help text for the LLM. */
    readonly description?: string;
    /** Allowed values (creates an enum constraint). */
    readonly enum?: readonly string[];
    /** Default value when the LLM omits the parameter. */
    readonly default?: string | number | boolean;
}

export interface YamlToolExecute {
    /** Named connection reference. */
    readonly connection: string;
    /** HTTP method. */
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /**
     * Request path relative to the connection's base_url.
     * Supports `{{param}}` interpolation.
     */
    readonly path: string;
    /**
     * Query string parameters.
     * Supports `{{param}}` interpolation in values.
     */
    readonly query?: Readonly<Record<string, string>>;
    /**
     * Request body (for POST/PUT/PATCH).
     * Supports deep `{{param}}` interpolation in any string value.
     */
    readonly body?: unknown;
}

/** Response transformation — shapes API responses before sending to the LLM. */
export interface YamlResponseTransform {
    /**
     * Dot-notation paths to extract from the response.
     * Supports array projection: `"data[].{id, name, email}"`
     */
    readonly extract?: readonly string[];

    /**
     * Field renaming map: `{ "original_name": "new_name" }`
     * ⚠️ Only enforced by the Vinkius Engine (proprietary).
     */
    readonly rename?: Readonly<Record<string, string>>;

    /**
     * Maximum array items to return (per-tool FinOps).
     * ⚠️ Only enforced by the Vinkius Engine (proprietary).
     */
    readonly max_items?: number;
}

/**
 * The tool trichotomy:
 *
 * - `description` → O QUE faz (short, appears in tools/list)
 * - `instruction` → COMO usar (detailed guidance for the LLM)
 * - `rules`       → RESTRIÇÕES (what the tool must NOT do)
 */
export interface YamlToolDef {
    /** Unique tool name (snake_case recommended). */
    readonly name: string;

    /**
     * **O QUE faz** — Short description shown in MCP `tools/list`.
     * The LLM uses this to decide *whether* to call the tool.
     * Maps to: `McpTool.description`
     */
    readonly description: string;

    /**
     * **COMO usar** — Detailed instructions for the LLM on *how* to
     * use the tool correctly. Provides context about when to call,
     * expected input patterns, and usage guidelines.
     * Maps to: `McpTool.custom_description`
     */
    readonly instruction?: string;

    /**
     * **RESTRIÇÕES** — Constraints and guardrails that the LLM must
     * follow when using this tool. Injected via the Presenter layer.
     * Maps to: `McpTool.system_rules` (array of strings)
     */
    readonly rules?: readonly string[];

    /** Grouping tag for tool exposition (GroupedToolBuilder). */
    readonly tag?: string;

    /** MCP tool annotations — advisory hints for the host. */
    readonly annotations?: YamlToolAnnotations;

    /** Tool input parameters — converted to JSON Schema. */
    readonly parameters?: Readonly<Record<string, YamlParamDef>>;

    /** HTTP execution definition. */
    readonly execute: YamlToolExecute;

    /** Response transformation before sending to the LLM. */
    readonly response?: YamlResponseTransform;
}

// ── Settings ─────────────────────────────────────────────
// ⚠️ Parsed by @vurb/yaml but ONLY enforced by the Vinkius Engine.

export interface YamlDlpSettings {
    readonly enabled: boolean;
    /** Glob patterns for PII fields to redact (e.g. "*.cpf", "*.email"). */
    readonly patterns?: readonly string[];
}

export interface YamlFinopsSettings {
    readonly enabled: boolean;
    /** Maximum array elements returned to the LLM. */
    readonly max_array_items?: number;
    /** Maximum response size in bytes. */
    readonly max_payload_bytes?: number;
    /** Enable Toon Compression for large payloads. */
    readonly toon_compression?: boolean;
}

export interface YamlCircuitBreakerSettings {
    readonly enabled: boolean;
    /** Consecutive failures before tripping. */
    readonly threshold?: number;
    /** Seconds before attempting recovery. */
    readonly reset_seconds?: number;
}

export interface YamlLifecycleSettings {
    /** Minutes of inactivity before server hibernation. */
    readonly idle_timeout_minutes?: number;
    /** Maximum concurrent client connections. */
    readonly max_connections?: number;
}

export type YamlExposition = 'flat' | 'grouped' | 'auto';

export interface YamlSettings {
    readonly dlp?: YamlDlpSettings;
    readonly finops?: YamlFinopsSettings;
    readonly exposition?: YamlExposition;
    readonly circuit_breaker?: YamlCircuitBreakerSettings;
    readonly lifecycle?: YamlLifecycleSettings;
}
