/**
 * Presenter Module — Barrel Export
 *
 * Public API for the MVA (Model-View-Agent) presenter system.
 */

// ── Response Builder ─────────────────────────────────────
export { ResponseBuilder, response, isResponseBuilder } from './ResponseBuilder.js';
export type { ActionSuggestion } from './ResponseBuilder.js';

// ── UI Helpers ───────────────────────────────────────────
export { ui } from './ui.js';
export type { UiBlock } from './ui.js';

// ── Presenter ────────────────────────────────────────────
export { Presenter, createPresenter, isPresenter } from './Presenter.js';

// ── Validation Error ─────────────────────────────────────
export { PresenterValidationError } from './PresenterValidationError.js';

// ── Post-Processing ──────────────────────────────────────
export { postProcessResult, isToolResponse } from './PostProcessor.js';
