/** Introspection Module — Barrel Export */
export { compileManifest, cloneManifest } from './ManifestCompiler.js';
export { registerIntrospectionResource } from './IntrospectionResource.js';
export type {
    IntrospectionConfig,
    ManifestPayload,
    ManifestCapabilities,
    ManifestTool,
    ManifestAction,
    ManifestPresenter,
} from './types.js';
export type { IntrospectionRegistryDelegate } from './IntrospectionResource.js';

// ── Contract Materialization ─────────────────────────────
export {
    materializeContract,
    compileContracts,
    sha256,
    canonicalize,
} from './ToolContract.js';
export type {
    ToolContract,
    ToolSurface,
    ActionContract,
    ToolBehavior,
    CognitiveGuardrailsContract,
    TokenEconomicsProfile,
    HandlerEntitlements,
} from './ToolContract.js';

// ── Contract Diffing ─────────────────────────────────────
export {
    diffContracts,
    formatDiffReport,
    formatDeltasAsXml,
} from './ContractDiff.js';
export type {
    ContractDelta,
    ContractDiffResult,
    DeltaSeverity,
    DeltaCategory,
} from './ContractDiff.js';

// ── Behavioral Fingerprinting ────────────────────────────
export {
    computeDigest,
    computeServerDigest,
    compareServerDigests,
} from './BehaviorDigest.js';
export type {
    BehaviorDigestResult,
    DigestComponents,
    ServerDigest,
    DigestComparison,
} from './BehaviorDigest.js';

// ── Capability Lockfile ──────────────────────────────────
export {
    generateLockfile,
    serializeLockfile,
    checkLockfile,
    parseLockfile,
    writeLockfile,
    readLockfile,
    LOCKFILE_NAME,
} from './CapabilityLockfile.js';
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
} from './CapabilityLockfile.js';

// ── Zero-Trust Runtime ───────────────────────────────────
export {
    createHmacSigner,
    attestServerDigest,
    verifyAttestation,
    verifyCapabilityPin,
    buildTrustCapability,
    AttestationError,
} from './CryptoAttestation.js';
export type {
    ZeroTrustConfig,
    AttestationSigner,
    AttestationResult,
    FusionTrustCapability,
} from './CryptoAttestation.js';

// ── Token Economics ──────────────────────────────────────
export {
    estimateTokens,
    profileBlock,
    profileResponse,
    computeStaticProfile,
    aggregateProfiles,
} from './TokenEconomics.js';
export type {
    TokenAnalysis,
    BlockTokenProfile,
    TokenRisk,
    TokenThresholds,
    TokenEconomicsConfig,
    StaticTokenProfile,
    FieldTokenEstimate,
    ServerTokenSummary,
} from './TokenEconomics.js';

// ── Entitlement Scanner (Blast Radius) ───────────────────
export {
    scanSource,
    buildEntitlements,
    validateClaims,
    scanAndValidate,
} from './EntitlementScanner.js';
export type {
    EntitlementReport,
    EntitlementMatch,
    EntitlementViolation,
    EntitlementCategory,
    EntitlementClaims,
} from './EntitlementScanner.js';

// ── Semantic Probing (LLM-as-Judge) ──────────────────────
export {
    createProbe,
    buildJudgePrompt,
    parseJudgeResponse,
    evaluateProbe,
    evaluateProbes,
    aggregateResults,
} from './SemanticProbe.js';
export type {
    SemanticProbeConfig,
    SemanticProbeAdapter,
    SemanticThresholds,
    SemanticProbe,
    ProbeContractContext,
    SemanticProbeResult,
    DriftLevel,
    SemanticProbeReport,
} from './SemanticProbe.js';

// ── Self-Healing Context ─────────────────────────────────
export {
    enrichValidationError,
    createToolEnhancer,
} from './ContractAwareSelfHealing.js';
export type {
    SelfHealingConfig,
    SelfHealingResult,
} from './ContractAwareSelfHealing.js';

// ── Governance Observer (Observability Bridge) ───────────
export {
    createGovernanceObserver,
    createNoopObserver,
} from './GovernanceObserver.js';
export type {
    GovernanceObserverConfig,
    GovernanceObserver,
} from './GovernanceObserver.js';
