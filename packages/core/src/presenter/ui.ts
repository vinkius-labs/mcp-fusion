/**
 * UI Block Helpers — Server-Side Rendering for AI Agents
 *
 * Deterministic helpers that wrap structured content into fenced
 * code blocks (or raw markup) for LLM pass-through rendering.
 *
 * Today these produce `text` blocks with fenced syntax.
 * If MCP adds native UI content types in the future, only
 * the internal `fence()` wrapper needs to change — all Presenters
 * and consumers stay intact.
 *
 * @example
 * ```typescript
 * import { ui } from '@vurb/core';
 *
 * ui.echarts({ title: { text: 'Burndown' }, series: [...] });
 * ui.mermaid('graph TD; A-->B');
 * ui.markdown('| Col | Val |');
 * ui.table(['ID', 'Status'], [['INV-1', '✅ Paid']]);
 * ui.list(['Deploy', 'Migrate', 'Verify']);
 * ui.json({ key: 'value' });
 * ui.summary('3 items found. 2 active, 1 archived.');
 * ```
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────

/**
 * Optional metadata for a UI block — layout hints and presentation context.
 *
 * Metadata is rendered as XML attributes on the `<ui_passthrough>` wrapper,
 * providing downstream clients and AI agents with structured display hints
 * without altering the content payload.
 *
 * @example
 * ```typescript
 * ui.echarts(chartConfig, { title: 'Revenue', width: 'half' });
 * ui.table(headers, rows, { title: 'Invoices', priority: 1 });
 * ```
 */
export interface UiBlockMeta {
    /** Human-readable label for the block (e.g. chart title, section name) */
    readonly title?: string;
    /** Layout width hint for rendering clients */
    readonly width?: 'full' | 'half' | 'third';
    /** Rendering priority (lower = rendered first). Default: insertion order */
    readonly priority?: number;
}

/**
 * A structured UI block produced by a Presenter's SSR layer.
 *
 * Each block carries a semantic `type` for future protocol
 * evolution and the `content` string ready for MCP transport.
 */
export interface UiBlock {
    /** Semantic type identifier (e.g. `'echarts'`, `'mermaid'`, `'markdown'`) */
    readonly type: string;
    /** Ready-to-transport content string */
    readonly content: string;
    /** Optional layout and presentation metadata */
    readonly meta?: UiBlockMeta;
}

// ── Internal Helpers ─────────────────────────────────────

/**
 * Wrap content in a fenced code block.
 *
 * Single point of change for the fencing format. If MCP adds
 * native block types in the future, only this function needs updating.
 *
 * @internal
 */
function fence(lang: string, body: string): string {
    return `\`\`\`${lang}\n${body}\n\`\`\``;
}

// ── Core 4 Helpers ───────────────────────────────────────

/**
 * Generate an ECharts UI block from a configuration object.
 *
 * The config is serialized with `JSON.stringify(config, null, 2)` for
 * deterministic, hallucination-free chart rendering.
 *
 * @param config - A valid ECharts option object
 * @returns A {@link UiBlock} with fenced `echarts` code block
 *
 * @example
 * ```typescript
 * ui.echarts({
 *     title: { text: 'Sprint Burndown' },
 *     xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
 *     series: [{ type: 'line', data: [5, 3, 1] }]
 * });
 * ```
 */
function echarts(config: Record<string, unknown>, meta?: UiBlockMeta): UiBlock {
    return { type: 'echarts', content: fence('echarts', JSON.stringify(config, null, 2)), ...(meta ? { meta } : {}) };
}

/**
 * Generate a Mermaid diagram UI block.
 *
 * @param diagram - Raw Mermaid diagram syntax
 * @returns A {@link UiBlock} with fenced `mermaid` code block
 *
 * @example
 * ```typescript
 * ui.mermaid('graph TD; A["Start"] --> B["Process"] --> C["End"]');
 * ```
 */
function mermaid(diagram: string, meta?: UiBlockMeta): UiBlock {
    return { type: 'mermaid', content: fence('mermaid', diagram), ...(meta ? { meta } : {}) };
}

/**
 * Generate a raw Markdown UI block.
 *
 * Unlike other helpers, markdown content is **not** fenced —
 * it's returned as-is for direct rendering.
 *
 * @param md - Raw Markdown string
 * @returns A {@link UiBlock} with raw markdown content
 *
 * @example
 * ```typescript
 * ui.markdown('| Task | Status |\n|---|---|\n| Deploy | ✅ Done |');
 * ```
 */
function markdown(md: string, meta?: UiBlockMeta): UiBlock {
    return { type: 'markdown', content: md, ...(meta ? { meta } : {}) };
}

/**
 * Generate a generic fenced code block UI block.
 *
 * Fallback helper for structured content (logs, XML, raw JSON)
 * that needs explicit language tagging.
 *
 * @param lang - Language identifier for syntax highlighting
 * @param code - Code content
 * @returns A {@link UiBlock} with fenced code block
 *
 * @example
 * ```typescript
 * ui.codeBlock('json', JSON.stringify(config, null, 2));
 * ui.codeBlock('xml', '<root><item>value</item></root>');
 * ```
 */
function codeBlock(lang: string, code: string, meta?: UiBlockMeta): UiBlock {
    return { type: lang, content: fence(lang, code), ...(meta ? { meta } : {}) };
}

// ── DX Helpers ───────────────────────────────────────────

/**
 * Generate a Markdown table UI block from headers and row data.
 *
 * The **#1 most common pattern** in data tools. Automatically
 * generates a fully formatted markdown table with alignment
 * separators — zero manual string concatenation needed.
 *
 * @param headers - Column header labels
 * @param rows - Array of row arrays (each inner array = one row)
 * @returns A {@link UiBlock} with formatted markdown table
 *
 * @example
 * ```typescript
 * ui.table(
 *     ['Invoice', 'Amount', 'Status'],
 *     [
 *         ['INV-001', '$4,500.00', '✅ Paid'],
 *         ['INV-002', '$1,200.00', '⚠️ Pending'],
 *     ],
 * );
 * ```
 */
function table(headers: readonly string[], rows: readonly (readonly string[])[], meta?: UiBlockMeta): UiBlock {
    const headerRow = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const bodyRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
    return { type: 'markdown', content: `${headerRow}\n${separator}\n${bodyRows}`, ...(meta ? { meta } : {}) };
}

/**
 * Generate a Markdown bullet list UI block.
 *
 * Perfect for action items, checklists, or enumerated results.
 *
 * @param items - Array of list items (strings)
 * @returns A {@link UiBlock} with markdown list content
 *
 * @example
 * ```typescript
 * ui.list(['Deploy API server', 'Run database migrations', 'Verify health checks']);
 * // → "- Deploy API server\n- Run database migrations\n- Verify health checks"
 * ```
 */
function list(items: readonly string[], meta?: UiBlockMeta): UiBlock {
    return { type: 'markdown', content: items.map(item => `- ${item}`).join('\n'), ...(meta ? { meta } : {}) };
}

/**
 * Generate a fenced JSON code block UI block.
 *
 * Shorthand for `ui.codeBlock('json', JSON.stringify(data, null, 2))`.
 * Most developers reach for this pattern constantly.
 *
 * @param data - Any JSON-serializable value
 * @returns A {@link UiBlock} with fenced `json` code block
 *
 * @example
 * ```typescript
 * ui.json({ host: 'api.example.com', port: 3000, ssl: true });
 * ```
 */
function json(data: unknown, meta?: UiBlockMeta): UiBlock {
    return { type: 'json', content: fence('json', JSON.stringify(data, null, 2)), ...(meta ? { meta } : {}) };
}

/**
 * Generate a summary UI block for collection overviews.
 *
 * Placed at the top of collection responses to give the LLM
 * quick context about the dataset without parsing the full array.
 *
 * @param text - Human-readable summary of the collection
 * @returns A {@link UiBlock} with summary content
 *
 * @example
 * ```typescript
 * ui.summary('3 invoices totaling $5,700.00. 2 paid, 1 pending.');
 * ```
 */
function summary(text: string, meta?: UiBlockMeta): UiBlock {
    return { type: 'summary', content: `📊 **Summary**: ${text}`, ...(meta ? { meta } : {}) };
}

// ── Public Namespace ─────────────────────────────────────

/**
 * UI block helpers for Server-Side Rendering (SSR) in Presenters.
 *
 * **Core helpers**: `echarts`, `mermaid`, `markdown`, `codeBlock`
 * **DX helpers**: `table`, `list`, `json`, `summary`
 *
 * @example
 * ```typescript
 * import { ui } from '@vurb/core';
 *
 * // Quick table from arrays
 * ui.table(['Name', 'Status'], [['Alice', 'Active'], ['Bob', 'Inactive']]);
 *
 * // Quick list
 * ui.list(['Step 1: Deploy', 'Step 2: Verify']);
 *
 * // Quick JSON viewer
 * ui.json({ config: { debug: true } });
 *
 * // Charts and diagrams
 * ui.echarts(chartConfig);
 * ui.mermaid('graph TD; A-->B');
 * ```
 */
export const ui = {
    // Core 4
    echarts, mermaid, markdown, codeBlock,
    // DX helpers
    table, list, json, summary,
} as const;
