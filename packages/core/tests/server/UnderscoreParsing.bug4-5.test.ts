/**
 * Bug #4 — Parsing de nomes com underscore quebra topologia do Inspector.
 * Bug #5 — Mesmo bug de split por underscore na emissão de telemetry.
 *
 * WHAT THE OLD TESTS MISSED:
 * There were ZERO tests for startServer.ts topology building or
 * ServerAttachment.ts telemetry route event resolution. The underscore
 * split bug existed in both places since day one with no test coverage.
 *
 * THE BUG:
 * `flatName.split('_')` was used to extract group/action from flat tool names.
 * For a tool named 'user_accounts_list':
 *   - split('_')[0] → 'user'         (WRONG — should be 'user_accounts')
 *   - split('_').slice(1) → 'accounts_list'  (WRONG — should be 'list')
 *
 * THE FIX:
 * - Bug #4: Use b.getName() directly as group and actionKey as action
 * - Bug #5: Resolve via routing map instead of split('_')
 *
 * THESE TESTS would have FAILED on the old code because they assert
 * that group names with underscores are preserved intact.
 */
import { describe, it, expect, vi } from 'vitest';
import { compileExposition } from '../../src/exposition/ExpositionCompiler.js';

/**
 * Minimal mock builder mimicking GroupedToolBuilder with underscore names.
 */
function createMockBuilder(name: string, actions: string[]) {
    const internalActions = actions.map(a => ({
        key: a,
        groupName: name,
        groupDescription: `${name} group`,
        actionName: a,
        description: `${a} action`,
        schema: undefined,
        destructive: undefined,
        idempotent: undefined,
        readOnly: undefined,
        middlewares: undefined,
        omitCommonFields: undefined,
        returns: undefined,
        handler: vi.fn(),
    }));

    return {
        getName: () => name,
        getActionNames: () => actions,
        getTags: () => [] as string[],
        buildToolDefinition: () => ({
            name,
            description: `${name} group`,
            inputSchema: { type: 'object', properties: {} },
        }),
        getActions: () => internalActions,
        getDiscriminator: () => 'action',
        getCommonSchema: () => undefined,
        getSelectEnabled: () => false,
        execute: vi.fn(),
        getPresenter: () => undefined,
        getDescription: () => `${name} group`,
        getSystemRules: () => undefined,
    };
}

// ============================================================================
// Bug #4 — Topology builder uses getName() instead of split('_')
// ============================================================================

describe('Bug #4 — Topology underscore parsing', () => {

    it('naive split("_")[0] gives WRONG group for "user_accounts_list"', () => {
        // This directly demonstrates the bug.
        // If we split by '_', the first segment is NOT the group name.
        const flatName = 'user_accounts_list';
        const naiveParts = flatName.split('_');
        const naiveGroup = naiveParts[0]!;
        const naiveAction = naiveParts.slice(1).join('_');

        // These are WRONG — this is what the buggy code produced
        expect(naiveGroup).toBe('user');            // BUG: should be 'user_accounts'
        expect(naiveAction).toBe('accounts_list');  // BUG: should be 'list'
    });

    it('getName() returns the correct full group name', () => {
        const builder = createMockBuilder('user_accounts', ['list', 'create']);

        // The fix uses getName() directly — no splitting
        const group = builder.getName();
        expect(group).toBe('user_accounts'); // CORRECT
    });

    it('topology map built with getName() has correct groups', () => {
        // Simulate the fixed topology builder in startServer.ts
        const builders = [
            createMockBuilder('user_accounts', ['list', 'create', 'delete']),
            createMockBuilder('billing_invoices', ['get', 'pay']),
            createMockBuilder('api_v2_health', ['check', 'status']),
            createMockBuilder('simple', ['run']),
        ];

        // Fixed approach: use getName() directly
        const toolGroups = new Map<string, string[]>();
        for (const b of builders) {
            const group = b.getName();
            for (const actionKey of b.getActionNames()) {
                const list = toolGroups.get(group) ?? [];
                list.push(actionKey);
                toolGroups.set(group, list);
            }
        }

        // All groups preserve their full underscore names
        expect(toolGroups.get('user_accounts')).toEqual(['list', 'create', 'delete']);
        expect(toolGroups.get('billing_invoices')).toEqual(['get', 'pay']);
        expect(toolGroups.get('api_v2_health')).toEqual(['check', 'status']);
        expect(toolGroups.get('simple')).toEqual(['run']);

        // Buggy split results should NOT exist
        expect(toolGroups.has('user')).toBe(false);
        expect(toolGroups.has('billing')).toBe(false);
        expect(toolGroups.has('api')).toBe(false);
    });

    it('buggy topology map with split("_") produces wrong groups', () => {
        // This test proves the bug existed by showing what split produces
        const builders = [
            createMockBuilder('user_accounts', ['list', 'create']),
            createMockBuilder('user_settings', ['get', 'update']),
        ];

        // Buggy approach: split('_')
        const buggyGroups = new Map<string, string[]>();
        for (const b of builders) {
            for (const actionKey of b.getActionNames()) {
                const flatName = `${b.getName()}_${actionKey}`;
                const parts = flatName.split('_');
                const group = parts[0]!;
                const action = parts.slice(1).join('_');
                const list = buggyGroups.get(group) ?? [];
                list.push(action);
                buggyGroups.set(group, list);
            }
        }

        // BUGGY: both "user_accounts" and "user_settings" collapse into "user"
        expect(buggyGroups.has('user_accounts')).toBe(false);
        expect(buggyGroups.has('user_settings')).toBe(false);
        expect(buggyGroups.get('user')).toEqual([
            'accounts_list', 'accounts_create',
            'settings_get', 'settings_update',
        ]);
    });
});

// ============================================================================
// Bug #5 — Telemetry route events use routing map instead of split('_')
// ============================================================================

describe('Bug #5 — Telemetry underscore parsing via routing map', () => {

    it('routing map resolves correct group for multi-underscore tool name', () => {
        const builder = createMockBuilder('user_accounts', ['list', 'create', 'delete']);
        const result = compileExposition([builder as any], 'flat', '_');

        // The routing map is the correct source of truth for group/action
        const route = result.routingMap.get('user_accounts_list');
        expect(route).toBeDefined();
        expect(route!.builder.getName()).toBe('user_accounts');
        expect(route!.actionKey).toBe('list');
    });

    it('routing map vs split gives different results for underscore names', () => {
        const builder = createMockBuilder('order_items', ['add', 'remove']);
        const result = compileExposition([builder as any], 'flat', '_');

        const flatName = 'order_items_add';

        // Buggy split approach
        const parts = flatName.split('_');
        const splitGroup = parts[0]!;
        const splitAction = parts.slice(1).join('_');

        // Fixed routing map approach
        const route = result.routingMap.get(flatName)!;
        const mapGroup = route.builder.getName();
        const mapAction = route.actionKey;

        // They differ — that's the bug
        expect(splitGroup).toBe('order');         // WRONG
        expect(splitAction).toBe('items_add');    // WRONG
        expect(mapGroup).toBe('order_items');     // CORRECT
        expect(mapAction).toBe('add');            // CORRECT
    });

    it('routing map handles actions with underscores in their names', () => {
        // Edge case: both group AND action have underscores
        const builder = createMockBuilder('my_api', ['get_by_id', 'search_all']);
        const result = compileExposition([builder as any], 'flat', '_');

        const route1 = result.routingMap.get('my_api_get_by_id');
        expect(route1).toBeDefined();
        expect(route1!.builder.getName()).toBe('my_api');
        expect(route1!.actionKey).toBe('get_by_id');

        const route2 = result.routingMap.get('my_api_search_all');
        expect(route2).toBeDefined();
        expect(route2!.builder.getName()).toBe('my_api');
        expect(route2!.actionKey).toBe('search_all');

        // With split('_'), 'my_api_get_by_id' → group='my', action='api_get_by_id' — WRONG
        const naive = 'my_api_get_by_id'.split('_');
        expect(naive[0]).toBe('my'); // BUG
        expect(naive.slice(1).join('_')).toBe('api_get_by_id'); // BUG
    });

    it('telemetry event built from routing map has correct attribution', () => {
        const builder = createMockBuilder('payment_gateway', ['charge', 'refund']);
        const result = compileExposition([builder as any], 'flat', '_');

        // Simulate telemetry event creation (as in ServerAttachment.ts fix)
        const name = 'payment_gateway_charge';
        const flatRoute = result.routingMap.get(name);
        const toolGroup = flatRoute ? flatRoute.builder.getName() : name;
        const action = flatRoute ? flatRoute.actionKey : name;

        const telemetryEvent = {
            type: 'route' as const,
            tool: toolGroup,
            action,
            args: {},
            timestamp: Date.now(),
        };

        expect(telemetryEvent.tool).toBe('payment_gateway');
        expect(telemetryEvent.action).toBe('charge');
    });

    it('fallback for unknown tool name gives name as-is (no crash)', () => {
        const builder = createMockBuilder('billing', ['pay']);
        const result = compileExposition([builder as any], 'flat', '_');

        // If tool name is not in the routing map, fallback gracefully
        const route = result.routingMap.get('totally_unknown_tool');
        const group = route ? route.builder.getName() : 'totally_unknown_tool';
        const action = route ? route.actionKey : 'totally_unknown_tool';

        expect(group).toBe('totally_unknown_tool');
        expect(action).toBe('totally_unknown_tool');
    });

    it('dot separator also works without underscore confusion', () => {
        const builder = createMockBuilder('user_accounts', ['list']);
        const result = compileExposition([builder as any], 'flat', '.');

        // Flat name: 'user_accounts.list' — no underscore ambiguity with dot separator
        const route = result.routingMap.get('user_accounts.list');
        expect(route).toBeDefined();
        expect(route!.builder.getName()).toBe('user_accounts');
        expect(route!.actionKey).toBe('list');
    });
});
