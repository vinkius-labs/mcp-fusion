/**
 * GCF vs TOON Benchmark for mcpfusion
 *
 * Compares Graph Compact Format (GCF) against TOON for the payload
 * shapes actually used inside mcpfusion: tool responses (arrays of
 * objects), description metadata (action rows), and nested config.
 *
 * Token estimation: Math.max(1, Math.floor(text.length / 4))
 */
import { encodeGeneric, decodeGeneric } from '@blackwell-systems/gcf';
import { encode as toonEncode, decode as toonDecode } from '@toon-format/toon';
import { writeFileSync } from 'node:fs';

// ── Token estimator ─────────────────────────────────────────
function estimateTokens(text: string): number {
    return Math.max(1, Math.floor(text.length / 4));
}

// ── Payload generators (realistic mcpfusion shapes) ─────────

function makeUsers(n: number) {
    return Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@company.com`,
        role: ['admin', 'editor', 'viewer'][i % 3],
        status: i % 2 === 0 ? 'active' : 'inactive',
        created_at: `2025-0${(i % 9) + 1}-15T10:00:00Z`,
    }));
}

function makeActionMetadata(n: number) {
    return Array.from({ length: n }, (_, i) => ({
        action: `action_${i}`,
        desc: `Perform action ${i} on the resource`,
        required: i % 2 === 0 ? 'id,workspace_id' : 'id',
        destructive: i % 5 === 0,
    }));
}

function makeToolResponses(n: number) {
    return Array.from({ length: n }, (_, i) => ({
        id: `proj_${i}`,
        name: `Project ${i}`,
        owner: `user_${i % 10}`,
        status: ['active', 'archived', 'draft'][i % 3],
        tool_count: Math.floor(Math.random() * 50),
        last_deployed: i % 3 === 0 ? null : `2025-06-${(i % 28) + 1}`,
    }));
}

function makeNestedConfig() {
    return {
        server: {
            name: 'production-api',
            version: '4.2.0',
            features: {
                gcfDescription: true,
                presenter: true,
                sandbox: false,
                fsm: true,
            },
        },
        tools: [
            { name: 'projects.list', readOnly: true, cached: true },
            { name: 'projects.create', readOnly: false, destructive: false },
            { name: 'projects.delete', readOnly: false, destructive: true },
        ],
        middleware: ['auth', 'rateLimit', 'audit'],
    };
}

// ── Benchmark runner ────────────────────────────────────────

interface BenchmarkResult {
    label: string;
    size: number;
    jsonBytes: number;
    jsonTokens: number;
    toonBytes: number;
    toonTokens: number;
    gcfBytes: number;
    gcfTokens: number;
    gcfVsJsonSavings: string;
    gcfVsToonSavings: string;
    gcfEncodeMs: number;
    toonEncodeMs: number;
    gcfDecodeMs: number;
    toonDecodeMs: number;
}

function benchmark(label: string, data: unknown, iterations = 1000): BenchmarkResult {
    const jsonStr = JSON.stringify(data, null, 2);
    const gcfStr = encodeGeneric(data);
    const toonStr = toonEncode(data);

    // Warm up
    for (let i = 0; i < 100; i++) {
        encodeGeneric(data);
        toonEncode(data);
    }

    // Encode timing
    const gcfStart = performance.now();
    for (let i = 0; i < iterations; i++) encodeGeneric(data);
    const gcfEncodeMs = performance.now() - gcfStart;

    const toonStart = performance.now();
    for (let i = 0; i < iterations; i++) toonEncode(data);
    const toonEncodeMs = performance.now() - toonStart;

    // Decode timing
    const gcfDecStart = performance.now();
    for (let i = 0; i < iterations; i++) decodeGeneric(gcfStr);
    const gcfDecodeMs = performance.now() - gcfDecStart;

    const toonDecStart = performance.now();
    for (let i = 0; i < iterations; i++) toonDecode(toonStr);
    const toonDecodeMs = performance.now() - toonDecStart;

    const jsonTokens = estimateTokens(jsonStr);
    const gcfTokens = estimateTokens(gcfStr);
    const toonTokens = estimateTokens(toonStr);

    const gcfVsJsonPct = ((1 - gcfTokens / jsonTokens) * 100).toFixed(1);
    const gcfVsToonPct = ((1 - gcfTokens / toonTokens) * 100).toFixed(1);

    return {
        label,
        size: Array.isArray(data) ? data.length : 1,
        jsonBytes: jsonStr.length,
        jsonTokens,
        toonBytes: toonStr.length,
        toonTokens,
        gcfBytes: gcfStr.length,
        gcfTokens,
        gcfVsJsonSavings: `${gcfVsJsonPct}%`,
        gcfVsToonSavings: `${gcfVsToonPct}%`,
        gcfEncodeMs: Math.round(gcfEncodeMs * 100) / 100,
        toonEncodeMs: Math.round(toonEncodeMs * 100) / 100,
        gcfDecodeMs: Math.round(gcfDecodeMs * 100) / 100,
        toonDecodeMs: Math.round(toonDecodeMs * 100) / 100,
    };
}

// ── Run benchmarks ──────────────────────────────────────────

const results: BenchmarkResult[] = [];
const sizes = [5, 10, 25, 50, 100, 500];

console.log('='.repeat(72));
console.log('GCF vs TOON Benchmark — mcpfusion payloads');
console.log('='.repeat(72));
console.log('');

// User list responses (most common mcpfusion payload shape)
for (const n of sizes) {
    results.push(benchmark(`User list (${n} rows)`, makeUsers(n)));
}

// Action metadata (used in tool descriptions)
for (const n of [5, 10, 20]) {
    results.push(benchmark(`Action metadata (${n} actions)`, makeActionMetadata(n)));
}

// Tool responses (project list)
for (const n of [10, 50, 100]) {
    results.push(benchmark(`Tool response (${n} projects)`, makeToolResponses(n)));
}

// Nested config (single object)
results.push(benchmark('Nested config (single object)', makeNestedConfig()));

// ── Output ──────────────────────────────────────────────────

const header = [
    'Payload',
    'JSON tokens',
    'TOON tokens',
    'GCF tokens',
    'GCF vs JSON',
    'GCF vs TOON',
    'GCF enc (ms)',
    'TOON enc (ms)',
].join(' | ');

const separator = header.replace(/[^|]/g, '-');

const rows = results.map(r => [
    r.label.padEnd(35),
    String(r.jsonTokens).padStart(10),
    String(r.toonTokens).padStart(10),
    String(r.gcfTokens).padStart(10),
    r.gcfVsJsonSavings.padStart(10),
    r.gcfVsToonSavings.padStart(10),
    String(r.gcfEncodeMs).padStart(12),
    String(r.toonEncodeMs).padStart(12),
].join(' | '));

const output = [
    '='.repeat(72),
    'GCF vs TOON Benchmark Results — mcpfusion payloads',
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Iterations per test: 1000`,
    `Token estimation: Math.max(1, Math.floor(text.length / 4))`,
    '='.repeat(72),
    '',
    header,
    separator,
    ...rows,
    '',
    '--- Summary ---',
    '',
];

// Compute averages
const avgGcfVsJson = results.reduce((s, r) => s + parseFloat(r.gcfVsJsonSavings), 0) / results.length;
const avgGcfVsToon = results.reduce((s, r) => s + parseFloat(r.gcfVsToonSavings), 0) / results.length;
output.push(`Average GCF vs JSON token savings: ${avgGcfVsJson.toFixed(1)}%`);
output.push(`Average GCF vs TOON token savings: ${avgGcfVsToon.toFixed(1)}%`);

const gcfWins = results.filter(r => parseFloat(r.gcfVsToonSavings) > 0).length;
const toonWins = results.filter(r => parseFloat(r.gcfVsToonSavings) < 0).length;
const ties = results.filter(r => parseFloat(r.gcfVsToonSavings) === 0).length;
output.push(`GCF vs TOON: ${gcfWins} wins, ${ties} ties, ${toonWins} losses (out of ${results.length} tests)`);
output.push('');

const text = output.join('\n');
console.log(text);

writeFileSync(
    new URL('./results-2026-06-17.txt', import.meta.url),
    text,
    'utf-8',
);
console.log('Results written to benchmarks/results-2026-06-17.txt');
