/**
 * PresenterValidationError — Domain-Aware Validation Errors
 *
 * Wraps raw Zod validation errors with the Presenter's domain name,
 * producing human-readable error messages that identify WHICH domain
 * failed and WHAT fields were invalid.
 *
 * This is critical for DX: instead of seeing `"Expected string, received number"`,
 * developers and LLMs see `"[Invoice Presenter] Field 'id': Expected string, received number"`.
 *
 * @example
 * ```typescript
 * try {
 *     InvoicePresenter.make({ id: 123 }); // ❌ invalid
 * } catch (e) {
 *     if (e instanceof PresenterValidationError) {
 *         console.log(e.presenterName); // "Invoice"
 *         console.log(e.message);       // "[Invoice Presenter] ..."
 *         console.log(e.cause);         // Original ZodError
 *     }
 * }
 * ```
 *
 * @module
 */
import { ZodError } from 'zod';

/**
 * Error thrown when a Presenter's Zod schema validation fails.
 *
 * Provides:
 * - `presenterName`: Which domain Presenter failed
 * - `message`: Human-readable summary with field paths
 * - `cause`: The original `ZodError` for programmatic access
 *
 * @see {@link Presenter} for where this error is thrown
 */
export class PresenterValidationError extends Error {
    /** The domain name of the Presenter that failed validation */
    readonly presenterName: string;

    constructor(presenterName: string, zodError: ZodError) {
        const fieldErrors = zodError.issues
            .map(issue => {
                const path = issue.path.length > 0
                    ? `'${issue.path.join('.')}'`
                    : '(root)';
                return `  • ${path}: ${issue.message}`;
            })
            .join('\n');

        const message =
            `[${presenterName} Presenter] Validation failed:\n${fieldErrors}`;

        super(message, { cause: zodError });
        this.name = 'PresenterValidationError';
        this.presenterName = presenterName;
    }
}
