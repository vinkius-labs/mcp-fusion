---
title: "Raw Response Testing"
description: "Protocol-level MCP transport inspection — verify the wire format without a server."
---

# Raw Response

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

The `MvaTestResult.rawResponse` field gives you direct access to the raw MCP `ToolResponse` object — the exact data structure that would be sent over the wire to the MCP client.

This is useful for:

- Protocol compliance testing
- Verifying XML formatting
- Asserting content block structure
- Proving Symbol invisibility

## MCP Protocol Shape

Every successful response has a `content` array of text blocks:

```typescript
describe('Raw Response Shape', () => {
    it('has content array on success', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        const raw = result.rawResponse as {
            content: Array<{ type: string; text: string }>;
        };

        expect(raw.content).toBeInstanceOf(Array);
        expect(raw.content.length).toBeGreaterThan(0);
        expect(raw.content[0].type).toBe('text');
    });

    it('has isError flag on error response', async () => {
        const result = await tester.callAction('db_user', 'handler_error');

        const raw = result.rawResponse as { isError?: boolean };
        expect(raw.isError).toBe(true);
    });
});
```

## Symbol Invisibility

The critical property of the Symbol Backdoor: `JSON.stringify` ignores Symbol keys. This proves that MVA metadata never leaks to the MCP transport:

```typescript
import { MVA_META_SYMBOL } from '@vinkius-core/mcp-fusion';

describe('Symbol Invisibility', () => {
    it('JSON.stringify does NOT include MVA metadata', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });
        const json = JSON.stringify(result.rawResponse);

        // Transport layer sees none of this
        expect(json).not.toContain('mva-meta');
        expect(json).not.toContain('systemRules');
        expect(json).not.toContain('uiBlocks');
    });

    it('Symbol IS accessible in memory', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        const meta = (result.rawResponse as any)[MVA_META_SYMBOL];
        expect(meta).toBeDefined();
        expect(meta.data).toBeDefined();
        expect(meta.systemRules).toBeInstanceOf(Array);
        expect(meta.uiBlocks).toBeInstanceOf(Array);
    });
});
```

## Content Block Inspection

For tools with Presenters, the response contains structured XML blocks:

```typescript
describe('Content Block Inspection', () => {
    it('contains data block', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });
        const raw = result.rawResponse as { content: Array<{ text: string }> };

        const dataText = raw.content.find(c => c.text.includes('<data>'));
        expect(dataText).toBeDefined();
    });

    it('contains system_rules block when Presenter has rules', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });
        const raw = result.rawResponse as { content: Array<{ text: string }> };

        const rulesText = raw.content.find(c => c.text.includes('<system_rules>'));
        expect(rulesText).toBeDefined();
    });
});
```

## Concurrent Response Isolation

Verify that parallel calls produce independent raw responses:

```typescript
describe('Concurrent Response Isolation', () => {
    it('parallel calls produce independent responses', async () => {
        const [r1, r2, r3] = await Promise.all([
            tester.callAction('db_user', 'find_many', { take: 1 }),
            tester.callAction('health', 'check'),
            tester.callAction('analytics', 'list', { limit: 2 }),
        ]);

        expect(r1.rawResponse).not.toBe(r2.rawResponse);
        expect(r2.rawResponse).not.toBe(r3.rawResponse);
    });
});
```
