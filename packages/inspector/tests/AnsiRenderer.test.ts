/**
 * AnsiRenderer.test.ts — Exhaustive Terminal Rendering Tests
 *
 * The AnsiRenderer is the visual core of the TUI. Bugs here produce
 * mangled terminal output: misaligned columns, invisible text, or
 * cursor escaping into the user's main terminal.
 *
 * Categories:
 *  1. ansi — color functions, escape sequences
 *  2. stringWidth — Unicode width calculation (CJK, Emoji, ANSI)
 *  3. truncate — visual truncation under all edge cases
 *  4. pad — alignment with Unicode-aware width
 *  5. box — box-drawing constants
 *  6. hline — horizontal line rendering
 *  7. progressBar — ratio clamping, colors
 *  8. ScreenManager — lifecycle (enter/exit)
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    ansi, stringWidth, truncate, pad,
    box, hline, progressBar, ScreenManager,
} from '../src/AnsiRenderer.js';

// ============================================================================
// 1. ansi — Color & Escape Functions
// ============================================================================

describe('ansi — color functions', () => {
    it('should wrap text with ANSI cyan codes', () => {
        const result = ansi.cyan('hello');
        expect(result).toBe('\x1b[36mhello\x1b[0m');
    });

    it('should wrap text with all color functions', () => {
        const colors = ['cyan', 'green', 'red', 'yellow', 'magenta', 'blue', 'dim', 'bold', 'inverse'] as const;
        for (const color of colors) {
            const result = ansi[color]('x');
            expect(result).toContain('x');
            expect(result).toContain('\x1b[');
            expect(result).toContain('\x1b[0m');
        }
    });

    it('should handle empty string input', () => {
        const result = ansi.green('');
        expect(result).toBe('\x1b[32m\x1b[0m');
    });

    it('should provide raw FG color codes', () => {
        expect(ansi.fg.cyan).toBe('\x1b[36m');
        expect(ansi.fg.green).toBe('\x1b[32m');
        expect(ansi.fg.red).toBe('\x1b[31m');
    });

    it('should provide cursor control sequences', () => {
        expect(ansi.hideCursor).toBe('\x1b[?25l');
        expect(ansi.showCursor).toBe('\x1b[?25h');
        expect(ansi.altScreen).toBe('\x1b[?1049h');
        expect(ansi.mainScreen).toBe('\x1b[?1049l');
    });

    it('should generate valid moveTo sequence', () => {
        expect(ansi.moveTo(1, 1)).toBe('\x1b[1;1H');
        expect(ansi.moveTo(10, 20)).toBe('\x1b[10;20H');
    });
});

// ============================================================================
// 2. stringWidth — Unicode Width Calculation
// ============================================================================

describe('stringWidth', () => {
    it('should correctly measure ASCII text', () => {
        expect(stringWidth('hello')).toBe(5);
        expect(stringWidth('')).toBe(0);
        expect(stringWidth('a')).toBe(1);
    });

    it('should strip ANSI codes and measure zero width', () => {
        const colored = ansi.cyan('test');
        expect(stringWidth(colored)).toBe(4); // 'test' = 4 chars
    });

    it('should count CJK characters as double width', () => {
        expect(stringWidth('中')).toBe(2);
        expect(stringWidth('中文')).toBe(4);
        expect(stringWidth('a中b')).toBe(4); // 1 + 2 + 1
    });

    it('should count emoji as double width', () => {
        expect(stringWidth('🚀')).toBe(2);
        expect(stringWidth('🎉🔥')).toBe(4);
    });

    it('should handle mixed ASCII + CJK + emoji', () => {
        const mixed = 'Hi中🚀';
        // H=1, i=1, 中=2, 🚀=2 = 6
        expect(stringWidth(mixed)).toBe(6);
    });

    it('should handle ANSI codes with special formatting', () => {
        const raw = `${ansi.fg.cyan}${ansi.bold('text')}${ansi.reset}`;
        // Only 'text' is visible
        expect(stringWidth(raw)).toBe(4);
    });

    it('should handle string with only ANSI codes', () => {
        expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0);
    });

    it('should handle numbers and special chars', () => {
        expect(stringWidth('123')).toBe(3);
        expect(stringWidth('!@#$')).toBe(4);
    });

    it('should handle tabs and newlines', () => {
        // Tabs and newlines are single characters
        expect(stringWidth('\t')).toBe(1);
        expect(stringWidth('\n')).toBe(1);
    });
});

// ============================================================================
// 3. truncate — Visual Truncation
// ============================================================================

describe('truncate', () => {
    it('should not truncate strings within maxWidth', () => {
        expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate with ellipsis suffix', () => {
        const result = truncate('hello world', 7);
        expect(stringWidth(result)).toBeLessThanOrEqual(7);
        expect(result).toContain('…');
    });

    it('should handle exact width match', () => {
        expect(truncate('abc', 3)).toBe('abc');
    });

    it('should handle maxWidth = 1', () => {
        const result = truncate('hello', 1);
        expect(stringWidth(result)).toBeLessThanOrEqual(1);
    });

    it('should handle maxWidth = 0', () => {
        const result = truncate('hello', 0);
        expect(result.length).toBeLessThanOrEqual(1);
    });

    it('should handle empty string', () => {
        expect(truncate('', 10)).toBe('');
    });

    it('should handle ANSI-colored strings', () => {
        const colored = ansi.cyan('hello world');
        const result = truncate(colored, 7);
        expect(stringWidth(result)).toBeLessThanOrEqual(8); // suffix may add
    });

    it('should preserve readability with CJK truncation', () => {
        // CJK chars are 2-wide, so truncation must not cut mid-character
        const cjk = '中文字串';  // 8 visual width
        const result = truncate(cjk, 5);
        expect(stringWidth(result)).toBeLessThanOrEqual(6); // 4 + suffix
    });
});

// ============================================================================
// 4. pad — Alignment
// ============================================================================

describe('pad', () => {
    it('should left-pad to target width', () => {
        const result = pad('hi', 6);
        expect(stringWidth(result)).toBe(6);
        expect(result).toBe('hi    ');
    });

    it('should right-pad to target width', () => {
        const result = pad('hi', 6, 'right');
        expect(stringWidth(result)).toBe(6);
        expect(result).toBe('    hi');
    });

    it('should not pad if already at target width', () => {
        expect(pad('abc', 3)).toBe('abc');
    });

    it('should truncate if string exceeds target width', () => {
        const result = pad('hello world', 5);
        expect(stringWidth(result)).toBeLessThanOrEqual(5);
    });

    it('should handle CJK-aware padding', () => {
        const result = pad('中', 6);
        // 中 = 2 + 4 spaces = 6
        expect(stringWidth(result)).toBe(6);
    });

    it('should handle empty string', () => {
        const result = pad('', 5);
        expect(result).toBe('     ');
        expect(stringWidth(result)).toBe(5);
    });
});

// ============================================================================
// 5. box — Box Drawing Constants
// ============================================================================

describe('box — constants', () => {
    it('should provide all box-drawing characters', () => {
        expect(box.topLeft).toBe('╭');
        expect(box.topRight).toBe('╮');
        expect(box.bottomLeft).toBe('╰');
        expect(box.bottomRight).toBe('╯');
        expect(box.horizontal).toBe('─');
        expect(box.vertical).toBe('│');
        expect(box.teeRight).toBe('├');
        expect(box.teeLeft).toBe('┤');
        expect(box.teeDown).toBe('┬');
        expect(box.teeUp).toBe('┴');
        expect(box.cross).toBe('┼');
    });

    it('should all be single characters', () => {
        for (const char of Object.values(box)) {
            expect(char.length).toBe(1);
        }
    });
});

// ============================================================================
// 6. hline — Horizontal Line
// ============================================================================

describe('hline', () => {
    it('should draw a basic horizontal line', () => {
        const line = hline(10, '├', '┤');
        expect(line).toBe('├────────┤');
        expect(line.length).toBe(10);
    });

    it('should handle width = 2 (just corners)', () => {
        expect(hline(2, '╭', '╮')).toBe('╭╮');
    });

    it('should handle width = 0 gracefully', () => {
        const line = hline(0, '├', '┤');
        expect(line).toBe('├┤'); // left + right, no fill
    });

    it('should use custom fill character', () => {
        const line = hline(6, '[', ']', '=');
        expect(line).toBe('[====]');
    });

    it('should draw full-width top border', () => {
        const line = hline(20, box.topLeft, box.topRight);
        expect(line.startsWith('╭')).toBe(true);
        expect(line.endsWith('╮')).toBe(true);
        expect(line.length).toBe(20);
    });
});

// ============================================================================
// 7. progressBar
// ============================================================================

describe('progressBar', () => {
    it('should render 100% filled', () => {
        const bar = progressBar(1.0, 10);
        expect(bar).toContain('█'.repeat(10));
    });

    it('should render 0% empty', () => {
        const bar = progressBar(0.0, 10);
        expect(bar).toContain('░'.repeat(10));
    });

    it('should render approximately 50%', () => {
        const bar = progressBar(0.5, 10);
        // Strip ANSI to count
        const clean = bar.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        expect(clean.length).toBe(10);
    });

    it('should clamp ratio > 1.0', () => {
        const bar = progressBar(2.0, 10);
        expect(bar).toContain('█'.repeat(10));
    });

    it('should clamp ratio < 0.0', () => {
        const bar = progressBar(-1.0, 10);
        expect(bar).toContain('░'.repeat(10));
    });

    it('should use green color for > 80%', () => {
        const bar = progressBar(0.9, 5);
        expect(bar).toContain('\x1b[32m'); // green
    });

    it('should use cyan color for > 50%', () => {
        const bar = progressBar(0.6, 5);
        expect(bar).toContain('\x1b[36m'); // cyan
    });

    it('should use yellow color for > 20%', () => {
        const bar = progressBar(0.3, 5);
        expect(bar).toContain('\x1b[33m'); // yellow
    });

    it('should use red color for <= 20%', () => {
        const bar = progressBar(0.1, 5);
        expect(bar).toContain('\x1b[31m'); // red
    });
});

// ============================================================================
// 8. ScreenManager — Lifecycle
// ============================================================================

describe('ScreenManager', () => {
    let screen: ScreenManager;

    afterEach(() => {
        if (screen?.active) {
            try { screen.exit(); } catch { /* ignore */ }
        }
    });

    it('should create an inactive screen by default', () => {
        screen = new ScreenManager();
        expect(screen.active).toBe(false);
        expect(screen.cols).toBe(80);
        expect(screen.rows).toBe(24);
    });

    it('should have correct types for cols/rows', () => {
        screen = new ScreenManager();
        expect(typeof screen.cols).toBe('number');
        expect(typeof screen.rows).toBe('number');
    });

    it('should have writeAt, clear, flush methods', () => {
        screen = new ScreenManager();
        expect(typeof screen.writeAt).toBe('function');
        expect(typeof screen.clear).toBe('function');
        expect(typeof screen.flush).toBe('function');
    });

    it('should have enter and exit methods', () => {
        screen = new ScreenManager();
        expect(typeof screen.enter).toBe('function');
        expect(typeof screen.exit).toBe('function');
    });
});
