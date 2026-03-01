/**
 * Test Setup — In-Memory MVA Emulator
 *
 * Creates a FusionTester that runs the full pipeline
 * (Zod → Middleware → Handler → Egress Firewall)
 * without any network transport.
 *
 * 2ms per test. $0.00 in tokens. Zero servers.
 */
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';
import { ToolRegistry, autoDiscover } from '@vinkius-core/mcp-fusion';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AppContext } from '../src/context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registry = new ToolRegistry<AppContext>();
await autoDiscover(registry, join(__dirname, '..', 'src', 'tools'));

export const tester = createFusionTester(registry, {
    contextFactory: () => ({
        role: 'ADMIN' as const,
        tenantId: 'test-tenant',
    }),
});
