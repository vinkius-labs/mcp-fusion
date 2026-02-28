/**
 * Echo Tool — Connectivity Testing (Fluent API)
 *
 * Demonstrates:
 * - f.query() with .withString() typed parameter
 * - .handle(input, ctx) — input.message is typed as string
 * - Implicit success() wrapping — return raw data, framework wraps it
 */
import { f } from '../../fusion.js';

export default f.query('system.echo')
    .describe('Echo a message back (connectivity test)')
    .withString('message', 'Message to echo back')
    .handle(async (input) => {
        return {
            echo: input['message'],
            receivedAt: new Date().toISOString(),
        };
    });
