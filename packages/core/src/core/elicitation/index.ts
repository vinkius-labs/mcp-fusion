/**
 * Elicitation — Barrel Export
 *
 * @module
 */
export { ask, compileAskFields } from './ask.js';
export type { AskNamespace } from './ask.js';
export {
    AskStringField,
    AskNumberField,
    AskBooleanField,
    AskEnumField,
    ElicitationUnsupportedError,
    ElicitationDeclinedError,
    createAskResponse,
} from './types.js';
export type {
    AskField,
    AskResponse,
    InferAskFields,
    ElicitationAction,
    ElicitSink,
    JsonSchemaProperty,
} from './types.js';

// ── Return-Based Elicitation (2026-07-28 native model) ───
export {
    requireInput,
    isInputRequiredResponse,
    inputResponse,
    readInput,
    readRequestState,
    _inputResponsesStore,
} from './requireInput.js';
export type {
    InputRequiredResponse,
    RequireInputSpec,
    RequireInputFunction,
    InputRequest,
    ElicitationInputRequest,
    UrlInputRequest,
    ElicitationSchema,
    InputResponseView,
    RawInputResult,
    InputRuntimeContext,
} from './requireInput.js';
export { runWithElicitation } from './runtime.js';
export type { ElicitationRuntimeOptions } from './runtime.js';
