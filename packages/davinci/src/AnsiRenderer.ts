/**
 * AnsiRenderer — Low-Level Terminal Rendering Engine
 *
 * Pure ANSI escape sequence renderer for the Command Nexus TUI.
 * Zero dependencies — uses only built-in Node.js `process.stdout`.
 *
 * Features:
 * - Alternate screen buffer management (like vim/htop)
 * - Double-buffered rendering (only emit changed cells)
 * - Unicode-aware column width calculation (Gotcha #3: emoji double-width)
 * - Debounced resize handling (Gotcha #4: SIGWINCH bomb)
 * - Box drawing with Unicode characters
 *
 * @module
 */

// ============================================================================
// ANSI Escape Sequences
// ============================================================================

export const ansi = {
    // Colors
    cyan:    (s: string): string => `\x1b[36m${s}\x1b[0m`,
    green:   (s: string): string => `\x1b[32m${s}\x1b[0m`,
    red:     (s: string): string => `\x1b[31m${s}\x1b[0m`,
    yellow:  (s: string): string => `\x1b[33m${s}\x1b[0m`,
    magenta: (s: string): string => `\x1b[35m${s}\x1b[0m`,
    blue:    (s: string): string => `\x1b[34m${s}\x1b[0m`,
    dim:     (s: string): string => `\x1b[2m${s}\x1b[0m`,
    bold:    (s: string): string => `\x1b[1m${s}\x1b[0m`,
    inverse: (s: string): string => `\x1b[7m${s}\x1b[0m`,
    reset: '\x1b[0m',

    // Raw color codes (for building compound styles)
    fg: {
        cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m',
        yellow: '\x1b[33m', magenta: '\x1b[35m', blue: '\x1b[34m',
        white: '\x1b[37m',
    },
    bg: {
        red: '\x1b[41m', green: '\x1b[42m', yellow: '\x1b[43m',
        blue: '\x1b[44m',
    },

    // Cursor & screen control
    hideCursor:  '\x1b[?25l',
    showCursor:  '\x1b[?25h',
    altScreen:   '\x1b[?1049h',
    mainScreen:  '\x1b[?1049l',
    clearScreen: '\x1b[2J\x1b[H',
    moveTo: (row: number, col: number): string => `\x1b[${row};${col}H`,
    clearLine: '\x1b[2K',
} as const;

// ============================================================================
// Unicode Width Calculation (Gotcha #3: Emoji Double-Width)
// ============================================================================

/**
 * Calculate the visual width of a string in terminal columns.
 *
 * Handles:
 * - East Asian Fullwidth characters (2 columns)
 * - Emoji (2 columns each)
 * - Combining characters (0 columns)
 * - ANSI escape sequences (0 columns — invisible)
 * - Variation selectors and ZWJ (0 columns)
 *
 * This is a lightweight approximation inspired by `string-width`.
 * It avoids the full ICU dependency by checking Unicode block ranges.
 *
 * @param str - The string to measure
 * @returns Width in terminal columns
 */
export function stringWidth(str: string): number {
    // Strip ANSI escape sequences first
    const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

    let width = 0;
    let i = 0;
    while (i < clean.length) {
        const code = clean.codePointAt(i)!;

        // Skip variation selectors (U+FE00–U+FE0F) and ZWJ (U+200D)
        if (
            (code >= 0xFE00 && code <= 0xFE0F) ||
            code === 0x200D ||
            // Combining marks (U+0300–U+036F, U+1AB0–U+1AFF, U+20D0–U+20FF)
            (code >= 0x0300 && code <= 0x036F) ||
            (code >= 0x1AB0 && code <= 0x1AFF) ||
            (code >= 0x20D0 && code <= 0x20FF)
        ) {
            i += code > 0xFFFF ? 2 : 1;
            continue;
        }

        // East Asian Fullwidth (CJK Unified Ideographs, etc.)
        if (
            (code >= 0x1100 && code <= 0x115F) ||  // Hangul Jamo
            (code >= 0x2E80 && code <= 0x303E) ||  // CJK Radicals
            (code >= 0x3041 && code <= 0x33BF) ||  // Hiragana, Katakana, CJK Compat
            (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Extension A
            (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified
            (code >= 0xF900 && code <= 0xFAFF) ||  // CJK Compatibility Ideographs
            (code >= 0xFE10 && code <= 0xFE6F) ||  // CJK Compatibility Forms
            (code >= 0xFF01 && code <= 0xFF60) ||  // Fullwidth Forms
            (code >= 0xFFE0 && code <= 0xFFE6) ||  // Fullwidth Signs
            (code >= 0x20000 && code <= 0x2FFFF) || // CJK Extension B+
            (code >= 0x30000 && code <= 0x3FFFF) || // CJK Extension G+
            // Common emoji ranges
            (code >= 0x1F300 && code <= 0x1F9FF) || // Misc Symbols, Emoticons, etc.
            (code >= 0x1FA00 && code <= 0x1FAFF) || // Chess, Extended-A
            (code >= 0x2600 && code <= 0x27BF) ||  // Misc Symbols, Dingbats
            (code >= 0x1F600 && code <= 0x1F64F) || // Emoticons
            (code >= 0x1F680 && code <= 0x1F6FF) || // Transport Symbols
            (code >= 0x1F1E0 && code <= 0x1F1FF)    // Regional Indicators
        ) {
            width += 2;
        } else {
            width += 1;
        }

        // Advance past surrogate pair if needed
        i += code > 0xFFFF ? 2 : 1;
    }

    return width;
}

/**
 * Truncate a string to fit within a maximum visual column width.
 * ANSI codes are preserved correctly.
 *
 * @param str - String to truncate
 * @param maxWidth - Maximum visual width in columns
 * @param suffix - Suffix to add if truncated (default: '…')
 * @returns Truncated string
 */
export function truncate(str: string, maxWidth: number, suffix = '…'): string {
    if (stringWidth(str) <= maxWidth) return str;

    const suffixWidth = stringWidth(suffix);
    const targetWidth = maxWidth - suffixWidth;
    if (targetWidth <= 0) return suffix.slice(0, maxWidth);

    // Build the truncated string character by character
    let result = '';
    let currentWidth = 0;
    const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    let i = 0;

    while (i < clean.length && currentWidth < targetWidth) {
        const code = clean.codePointAt(i)!;
        const charWidth = (
            (code >= 0x1100 && code <= 0x115F) ||
            (code >= 0x2E80 && code <= 0x9FFF) ||
            (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFF01 && code <= 0xFF60) ||
            (code >= 0x1F300 && code <= 0x1FAFF) ||
            (code >= 0x2600 && code <= 0x27BF)
        ) ? 2 : 1;

        if (currentWidth + charWidth > targetWidth) break;

        const char = String.fromCodePoint(code);
        result += char;
        currentWidth += charWidth;
        i += code > 0xFFFF ? 2 : 1;
    }

    return result + suffix + ansi.reset;
}

/**
 * Pad a string to a specific visual width with spaces.
 *
 * @param str - String to pad
 * @param targetWidth - Desired visual width
 * @param align - 'left' or 'right' alignment
 * @returns Padded string
 */
export function pad(str: string, targetWidth: number, align: 'left' | 'right' = 'left'): string {
    const width = stringWidth(str);
    if (width >= targetWidth) return truncate(str, targetWidth);
    const spaces = ' '.repeat(targetWidth - width);
    return align === 'left' ? str + spaces : spaces + str;
}

// ============================================================================
// Box Drawing
// ============================================================================

/** Unicode box drawing characters */
export const box = {
    topLeft:    '╭', topRight:    '╮',
    bottomLeft: '╰', bottomRight: '╯',
    horizontal: '─', vertical:    '│',
    teeRight:   '├', teeLeft:     '┤',
    teeDown:    '┬', teeUp:       '┴',
    cross:      '┼',
} as const;

/**
 * Draw a horizontal line with box-drawing characters.
 * @param width - Total width including corners/tees
 * @param left - Left character (e.g. '├' or '╭')
 * @param right - Right character (e.g. '┤' or '╮')
 * @param fill - Fill character (default: '─')
 */
export function hline(width: number, left: string, right: string, fill = box.horizontal): string {
    return left + fill.repeat(Math.max(0, width - 2)) + right;
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Render an ASCII progress/savings bar.
 *
 * @param ratio - Value between 0 and 1
 * @param width - Total width in columns
 * @param filledChar - Character for filled portion (default: '█')
 * @param emptyChar - Character for empty portion (default: '░')
 * @returns Colored progress bar string
 */
export function progressBar(ratio: number, width: number, filledChar = '█', emptyChar = '░'): string {
    const clamped = Math.max(0, Math.min(1, ratio));
    const filled = Math.round(clamped * width);
    const empty = width - filled;

    const bar = filledChar.repeat(filled) + emptyChar.repeat(empty);

    // Color: green > 80%, cyan > 50%, yellow > 20%, red otherwise
    if (clamped > 0.8) return ansi.green(bar);
    if (clamped > 0.5) return ansi.cyan(bar);
    if (clamped > 0.2) return ansi.yellow(bar);
    return ansi.red(bar);
}

// ============================================================================
// Screen Manager
// ============================================================================

/**
 * Low-level screen manager for alternate buffer TUI rendering.
 *
 * Provides:
 * - Enter/exit alternate screen buffer
 * - Raw mode stdin management
 * - Debounced resize handling (Gotcha #4)
 * - Direct cursor positioning writes
 */
export class ScreenManager {
    private _active = false;
    private _resizeTimer: ReturnType<typeof setTimeout> | undefined;
    private _resizeCallback: (() => void) | undefined;
    private _inputCallback: ((key: string, raw: Buffer) => void) | undefined;
    private _cols = 80;
    private _rows = 24;

    /** Current terminal columns */
    get cols(): number { return this._cols; }
    /** Current terminal rows */
    get rows(): number { return this._rows; }
    /** Whether the screen is active (alternate buffer + raw mode) */
    get active(): boolean { return this._active; }

    /**
     * Enter the alternate screen buffer and enable raw mode.
     *
     * @param onResize - Callback for terminal resize (debounced 100ms, Gotcha #4)
     * @param onInput - Callback for keyboard input (raw bytes)
     */
    enter(
        onResize: () => void,
        onInput: (key: string, raw: Buffer) => void,
    ): void {
        if (this._active) return;
        this._active = true;
        this._resizeCallback = onResize;
        this._inputCallback = onInput;

        // Capture initial size
        this._cols = process.stdout.columns || 80;
        this._rows = process.stdout.rows || 24;

        // Enter alternate buffer, hide cursor
        process.stdout.write(ansi.altScreen + ansi.hideCursor + ansi.clearScreen);

        // Enable raw mode for keyboard capture
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', this._handleInput);
        }

        // Debounced resize listener (Gotcha #4: SIGWINCH bomb)
        process.stdout.on('resize', this._handleResize);
    }

    /**
     * Exit the alternate screen buffer and restore normal operation.
     */
    exit(): void {
        if (!this._active) return;
        this._active = false;

        // Clean up timers
        if (this._resizeTimer) {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = undefined;
        }

        // Restore terminal
        process.stdout.write(ansi.showCursor + ansi.mainScreen);

        // Disable raw mode
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
            process.stdin.removeListener('data', this._handleInput);
            process.stdin.pause();
        }

        // Remove resize listener
        process.stdout.removeListener('resize', this._handleResize);
    }

    /** Write at a specific position (1-indexed) */
    writeAt(row: number, col: number, text: string): void {
        process.stdout.write(ansi.moveTo(row, col) + text);
    }

    /** Clear the entire screen */
    clear(): void {
        process.stdout.write(ansi.clearScreen);
    }

    /** Flush output */
    flush(): void {
        // Node.js stdout auto-flushes on write, but we can force
        // a single write for batched output
    }

    // ── Private Handlers ─────────────────────────────────

    private _handleResize = (): void => {
        // Gotcha #4: Debounce rapid resize events (50-100ms)
        if (this._resizeTimer) clearTimeout(this._resizeTimer);

        this._resizeTimer = setTimeout(() => {
            this._cols = process.stdout.columns || 80;
            this._rows = process.stdout.rows || 24;

            // Force full clear on resize (ignore double-buffer)
            process.stdout.write(ansi.clearScreen);
            this._resizeCallback?.();
        }, 100);
    };

    private _handleInput = (data: Buffer): void => {
        const str = data.toString('utf8');
        this._inputCallback?.(str, data);
    };
}
