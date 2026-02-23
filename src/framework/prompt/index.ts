/**
 * Prompt Engine — Barrel Export
 *
 * Public API for the MCP Prompt Engine.
 * All exports are re-exported from bounded context modules.
 */

// ── Types ────────────────────────────────────────────────
export type {
    PromptMessagePayload,
    PromptResult,
    PromptParamDef,
    PromptParamsMap,
    PromptBuilder,
    PromptConfig,
} from './PromptTypes.js';

// ── Factories ────────────────────────────────────────────
export { PromptMessage } from './PromptMessage.js';
export { definePrompt } from './definePrompt.js';

// ── Pipeline (advanced / testing) ────────────────────────
export {
    assertFlatSchema,
    coercePromptArgs,
} from './PromptExecutionPipeline.js';
