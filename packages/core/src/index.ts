/**
 * Vurb — Root Barrel Export
 *
 * Public API entry point. Aggregates all bounded-context modules
 * into a single flat namespace for consumers.
 *
 * Architecture:
 *   src/
 *   ├── core/          ← Builder, Registry, Execution, Middleware, Schema
 *   ├── client/        ← tRPC-style VurbClient
 *   ├── observability/ ← Debug Observer, Tracing
 *   ├── presenter/     ← MVA View Layer
 *   ├── prompt/        ← Prompt Engine
 *   ├── sandbox/       ← Zero-Trust V8 Computation Delegation
 *   ├── server/        ← Server Attachment
 *   ├── exposition/    ← Flat/Grouped Topology Compiler
 *   ├── state-sync/    ← Epistemic Cache-Control
 *   ├── introspection/ ← Dynamic Manifest
 *   ├── domain/        ← Domain Models
 *   └── converters/    ← Zod Converters
 */

// ── Model Layer ──────────────────────────────────────────
/** @category Model */
export { defineModel, FieldDef, ModelBuilder } from './model/index.js';
/** @category Model */
export type { Model } from './model/index.js';

// ── Domain Models ────────────────────────────────────────
/** @category Domain Models */
export { Role } from './domain/Role.js';
/** @category Domain Models */
export { type Icon, createIcon } from './domain/Icon.js';
/** @category Domain Models */
export { BaseModel } from './domain/BaseModel.js';
/** @category Domain Models */
export { Group } from './domain/Group.js';
/** @category Domain Models */
export { GroupItem } from './domain/GroupItem.js';
/** @category Domain Models */
export { type Annotations, createAnnotations } from './domain/Annotations.js';
/** @category Domain Models */
export { type ToolAnnotations, createToolAnnotations } from './domain/ToolAnnotations.js';
/** @category Domain Models */
export { Tool } from './domain/Tool.js';
/** @category Domain Models */
export { PromptArgument } from './domain/PromptArgument.js';
/** @category Domain Models */
export { Prompt } from './domain/Prompt.js';
/** @category Domain Models */
export { Resource } from './domain/Resource.js';

// ── Converters ───────────────────────────────────────────
/** @category Converters */
export {
    ConverterBase,
    type GroupConverter, GroupConverterBase,
    type ToolConverter, ToolConverterBase,
    type PromptConverter, PromptConverterBase,
    type ResourceConverter, ResourceConverterBase,
    type ToolAnnotationsConverter, ToolAnnotationsConverterBase
} from './converters/index.js';

// ── Core (Builder, Registry, Execution, Middleware) ──────
/** @category Core */
export {
    success, error, required, toonSuccess, toolError,
    GroupedToolBuilder, ActionGroupBuilder, createTool, defineTool,
    ToolRegistry,
    generateToonDescription,
    succeed, fail,
    progress,
    defineMiddleware, resolveMiddleware,
    initVurb,
    createGroup,
    toStandardValidator, fromZodSchema, isStandardSchema, autoValidator,
    // Fluent API
    FluentToolBuilder, FluentRouter,
} from './core/index.js';
/** @category Core */
export type {
    ToolResponse, ToolErrorOptions, ErrorCode, ErrorSeverity,
    ActionConfig, MiddlewareFn, GroupConfigurator,
    ToolFilter,
    ToolBuilder, ActionMetadata,
    Result, Success, Failure,
    ToolConfig, ActionDef, GroupDef,
    ProgressEvent, ProgressSink,
    MiddlewareDefinition, MergeContext, InferContextOut,
    ConcurrencyConfig, EgressConfig,
    SandboxConfig, SandboxResult, SandboxErrorCode,
    VurbInstance,
    GroupConfig, GroupAction, CompiledGroup,
    StandardSchemaV1, StandardSchemaIssue, InferStandardOutput,
    VurbValidator, ValidationResult,
    SemanticDefaults,
    StateSyncHint,
    // FHP
} from './core/index.js';

// ── Federated Handoff Protocol (FHP) ─────────────────────
/** @category FHP */
export {
    handoff, isHandoffResponse,
    InMemoryHandoffStateStore,
    mintDelegationToken, verifyDelegationToken, HandoffAuthError,
    requireGatewayClearance,
} from './handoff/index.js';
/** @category FHP */
export type {
    HandoffPayload, HandoffResponse, HandoffStateStore,
    DelegationClaims,
    GatewayClearanceContext,
} from './handoff/index.js';

// ── Client (tRPC-style type-safe) ────────────────────────
/** @category Client */
export { createVurbClient, createTypedRegistry, VurbClientError } from './client/index.js';
/** @category Client */
export type { VurbClient, VurbTransport, RouterMap, InferRouter, TypedToolRegistry, ClientMiddleware, VurbClientOptions } from './client/index.js';

// ── Observability (Debug + Tracing) ──────────────────────
/** @category Observability */
export { createDebugObserver, SpanStatusCode } from './observability/index.js';
/** @category Observability */
export { createTelemetryBus, getTelemetryPath, discoverSockets } from './observability/index.js';
/** @category Observability */
export type {
    DebugEvent, DebugObserverFn,
    RouteEvent, ValidateEvent, MiddlewareEvent, ExecuteEvent, ErrorEvent,
    GovernanceEvent, GovernanceOperation,
    VurbSpan, VurbTracer, VurbAttributeValue,
    TelemetryEvent, TelemetrySink,
    TelemetryBusConfig, TelemetryBusInstance,
    DlpRedactEvent, PresenterSliceEvent, PresenterRulesEvent,
    SandboxExecEvent, FsmTransitionEvent,
    TopologyEvent, TopologyTool, HeartbeatEvent,
} from './observability/index.js';

// ── Presenter (MVA View Layer) ───────────────────────────
/** @category Presenter */
export {
    ResponseBuilder, response, isResponseBuilder,
    ui, t, suggest,
    Presenter, createPresenter, isPresenter,
    PresenterValidationError,
    definePresenter, extendPresenter,
    extractZodDescriptions,
    compileRedactor, initRedactEngine,
} from './presenter/index.js';
/** @category Presenter */
export type { UiBlock, UiBlockMeta, ActionSuggestion, PresenterConfig, AgentLimitDef, EmbedDef, RedactConfig, RedactFn } from './presenter/index.js';

// ── Prompt Engine ────────────────────────────────────────
/** @category Prompt */
export { definePrompt, PromptMessage, assertFlatSchema, coercePromptArgs } from './prompt/index.js';
/** @category Prompt */
export { PromptRegistry } from './prompt/PromptRegistry.js';
/** @category Prompt */
export type {
    PromptMessagePayload, PromptResult,
    PromptParamDef, PromptParamsMap,
    PromptBuilder, PromptConfig,
} from './prompt/index.js';
/** @category Prompt */
export type { McpPromptDef, PromptFilter } from './prompt/PromptRegistry.js';

// ── Server Integration ───────────────────────────────────
/** @category Server */
export type { AttachOptions, DetachFn, ISwarmGateway } from './server/index.js';
/** @category Server */
export { autoDiscover } from './server/index.js';
/** @category Server */
export type { AutoDiscoverOptions } from './server/index.js';
/** @category Server */
export { createDevServer, cacheBustUrl } from './server/index.js';
/** @category Server */
export type { DevServerConfig, DevServer, DevServerSetupContext } from './server/index.js';
/** @category Server */
export { startServer } from './server/index.js';
/** @category Server */
export type { StartServerOptions, StartServerResult } from './server/index.js';

// ── Exposition (Topology Compiler) ───────────────────────
/** @category Exposition */
export type { ToolExposition, ExpositionConfig } from './exposition/index.js';

// ── State Sync (Epistemic Cache-Control) ─────────────────
/** @category StateSync */
export { StateSyncLayer, PolicyEngine, matchGlob, detectOverlaps } from './state-sync/index.js';
/** @category StateSync */
export type {
    CacheDirective, SyncPolicy, StateSyncConfig, ResolvedPolicy,
    InvalidationEvent, ResourceNotification, OverlapWarning,
} from './state-sync/index.js';

// ── Resources (Push Subscriptions) ───────────────────────
/** @category Resources */
export { ResourceRegistry, defineResource, SubscriptionManager } from './resource/index.js';
/** @category Resources */
export type {
    ResourceBuilder, ResourceConfig, ResourceContent,
    ResourceHandler, McpResourceDef,
    ResourceListChangedSink, ResourceNotificationSink,
} from './resource/index.js';

// ── Testing (In-Memory MVA Backdoor) ─────────────────────
/** @category Testing */
export { MVA_META_SYMBOL } from './testing/MvaMetaSymbol.js';
/** @category Testing */
export type { MvaMeta } from './testing/MvaMetaSymbol.js';

// ── Governance (Contract + Attestation + Probing) ────────
/** @category Governance */
export {
    materializeContract,
    compileContracts,
    sha256,
    canonicalize,
} from './introspection/ToolContract.js';
/** @category Governance */
export type {
    ToolContract,
    ToolSurface,
    ActionContract,
    ToolBehavior,
    CognitiveGuardrailsContract,
    TokenEconomicsProfile,
    HandlerEntitlements,
} from './introspection/ToolContract.js';
/** @category Governance */
export {
    diffContracts,
    formatDiffReport,
    formatDeltasAsXml,
} from './introspection/ContractDiff.js';
/** @category Governance */
export type {
    ContractDelta,
    ContractDiffResult,
    DeltaSeverity,
    DeltaCategory,
} from './introspection/ContractDiff.js';
/** @category Governance */
export {
    computeDigest,
    computeServerDigest,
    compareServerDigests,
} from './introspection/BehaviorDigest.js';
/** @category Governance */
export type {
    BehaviorDigestResult,
    DigestComponents,
    ServerDigest,
    DigestComparison,
} from './introspection/BehaviorDigest.js';
// ── Capability Lockfile ──────────────────────────────────
/** @category Governance */
export {
    generateLockfile,
    serializeLockfile,
    checkLockfile,
    parseLockfile,
    writeLockfile,
    readLockfile,
    LOCKFILE_NAME,
} from './introspection/CapabilityLockfile.js';
/** @category Governance */
export type {
    CapabilityLockfile,
    LockfileCapabilities,
    LockfileTool,
    LockfileToolSurface,
    LockfileToolBehavior,
    LockfileTokenEconomics,
    LockfileEntitlements,
    LockfileCheckResult,
    LockfilePrompt,
    LockfilePromptArgument,
    PromptBuilderLike,
    GenerateLockfileOptions,
} from './introspection/CapabilityLockfile.js';
/** @category Governance */
export {
    createHmacSigner,
    attestServerDigest,
    verifyAttestation,
    verifyCapabilityPin,
    buildTrustCapability,
    AttestationError,
} from './introspection/CryptoAttestation.js';
/** @category Governance */
export type {
    ZeroTrustConfig,
    AttestationSigner,
    AttestationResult,
    VurbTrustCapability,
} from './introspection/CryptoAttestation.js';
/** @category Governance */
export {
    estimateTokens,
    profileBlock,
    profileResponse,
    computeStaticProfile,
    aggregateProfiles,
} from './introspection/TokenEconomics.js';
/** @category Governance */
export type {
    TokenAnalysis,
    BlockTokenProfile,
    TokenRisk,
    TokenThresholds,
    TokenEconomicsConfig,
    StaticTokenProfile,
    FieldTokenEstimate,
    ServerTokenSummary,
} from './introspection/TokenEconomics.js';
/** @category Governance */
export {
    scanSource,
    buildEntitlements,
    validateClaims,
    scanAndValidate,
} from './introspection/EntitlementScanner.js';
/** @category Governance */
export type {
    EntitlementReport,
    EntitlementMatch,
    EntitlementViolation,
    EntitlementCategory,
    EntitlementClaims,
} from './introspection/EntitlementScanner.js';
/** @category Governance */
export {
    createProbe,
    buildJudgePrompt,
    parseJudgeResponse,
    evaluateProbe,
    evaluateProbes,
    aggregateResults,
} from './introspection/SemanticProbe.js';
/** @category Governance */
export type {
    SemanticProbeConfig,
    SemanticProbeAdapter,
    SemanticProbe,
    SemanticProbeResult,
    DriftLevel,
    SemanticProbeReport,
} from './introspection/SemanticProbe.js';
/** @category Governance */
export {
    enrichValidationError,
    createToolEnhancer,
} from './introspection/ContractAwareSelfHealing.js';
/** @category Governance */
export type {
    SelfHealingConfig,
    SelfHealingResult,
} from './introspection/ContractAwareSelfHealing.js';
/** @category Governance */
export {
    createGovernanceObserver,
    createNoopObserver,
} from './introspection/GovernanceObserver.js';
/** @category Governance */
export type {
    GovernanceObserverConfig,
    GovernanceObserver,
} from './introspection/GovernanceObserver.js';

// ── Sandbox (Zero-Trust V8 Compute Delegation) ──────────
/** @category Sandbox */
export { SandboxEngine, validateSandboxCode, SANDBOX_SYSTEM_INSTRUCTION } from './sandbox/index.js';
/** @category Sandbox */
export type { GuardResult } from './sandbox/index.js';

// ── Serialization (AOT JSON Engine) ─────────────────────
/** @category Serialization */
export { createSerializer, defaultSerializer } from './core/serialization/index.js';
/** @category Serialization */
export type { StringifyFn, JsonSerializer } from './core/serialization/index.js';

// ── FSM State Gate (Temporal Anti-Hallucination) ─────────
/** @category FSM */
export { StateMachineGate, initFsmEngine, resetXStateCache } from './fsm/StateMachineGate.js';
/** @category FSM */
export type {
    FsmConfig, FsmStateStore, FsmSnapshot, TransitionResult,
} from './fsm/StateMachineGate.js';

// ── Credentials (BYOC Marketplace) ──────────────────────────
/** @category Credentials */
export {
    defineCredentials,
    requireCredential,
    CredentialMissingError,
} from './credentials/index.js';
/** @category Credentials */
export type {
    CredentialDef,
    CredentialsMap,
    CredentialType,
} from './credentials/index.js';

// ── Security Layer ──────────────────────────────────────
/** @category Security */
export { createJudgeChain } from './presenter/JudgeChain.js';
/** @category Security */
export type {
    JudgeChain, JudgeChainConfig, JudgeChainResult,
    JudgeResult, JudgeStrategy,
} from './presenter/JudgeChain.js';
/** @category Security */
export { evaluateRules, buildFirewallPrompt, parseFirewallVerdict } from './presenter/PromptFirewall.js';
/** @category Security */
export type {
    PromptFirewallConfig, FirewallVerdict, FirewallRejection,
} from './presenter/PromptFirewall.js';
/** @category Security */
export { inputFirewall } from './core/middleware/InputFirewall.js';
/** @category Security */
export type { InputFirewallConfig } from './core/middleware/InputFirewall.js';
/** @category Security */
export { auditTrail } from './core/middleware/AuditTrail.js';
/** @category Security */
export type { AuditTrailConfig, AuditIdentity, AuditSink } from './core/middleware/AuditTrail.js';
/** @category Security */
export { rateLimit, InMemoryStore } from './core/middleware/RateLimiter.js';
/** @category Security */
export type { RateLimitConfig, RateLimitStore, RateLimitEntry, RateLimitMiddleware } from './core/middleware/RateLimiter.js';
/** @category Security */
export type {
    SecurityFirewallEvent, SecurityAuditEvent, SecurityRateLimitEvent,
} from './observability/TelemetryEvent.js';
