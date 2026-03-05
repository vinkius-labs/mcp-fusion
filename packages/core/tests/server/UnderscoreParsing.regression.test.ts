/**
 * Regression tests for Bugs #4 and #5:
 * Underscore splitting incorrectly parses tool names with underscores.
 *
 * Bug #4: startServer.ts split by '_' to extract group/action for telemetry
 * topology. For 'user_accounts_list', group='user' action='accounts_list' — wrong.
 * Should be group='user_accounts' action='list'.
 *
 * Bug #5: ServerAttachment.ts same split('_') issue in route telemetry events.
 * Fixed by resolving group/action from the routing map instead of naive splitting.
 *
 * These tests verify the correct group/action resolution by testing the
 * exposition routing map lookup pattern used in the fix.
 */
import { describe, it, expect, vi } from 'vitest';
import { compileExposition } from '../../src/exposition/ExpositionCompiler.js';

/**
 * Minimal mock builder that simulates a grouped tool with underscores in its name.
 * Implements the InternalAction-based getActions() interface used by the exposition compiler.
 */
function createMockBuilder(name: string, actions: string[]) {
    const internalActions = actions.map(a => ({
        key: a,
        groupName: name,
        groupDescription: `${name} tool`,
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
            description: `${name} tool`,
            inputSchema: { type: 'object', properties: {} },
        }),
        getActions: () => internalActions,
        getDiscriminator: () => 'action',
        getCommonSchema: () => undefined,
        getSelectEnabled: () => false,
        execute: vi.fn(),
        getPresenter: () => undefined,
        getDescription: () => `${name} tool`,
        getSystemRules: () => undefined,
    };
}

describe('Underscore Parsing — Bug #4/#5 Regression', () => {
    it('routing map resolves correct group for tool with underscores in name', () => {
        const builder = createMockBuilder('user_accounts', ['list', 'create', 'delete']);
        const result = compileExposition([builder as any], 'flat', '_');

        // Flat name: 'user_accounts_list'
        const route = result.routingMap.get('user_accounts_list');
        expect(route).toBeDefined();
        expect(route!.builder.getName()).toBe('user_accounts');
        expect(route!.actionKey).toBe('list');
    });

    it('routing map resolves multi-underscore names correctly', () => {
        const builder = createMockBuilder('my_api_v2_users', ['get_by_id', 'search']);
        const result = compileExposition([builder as any], 'flat', '_');

        const route = result.routingMap.get('my_api_v2_users_get_by_id');
        expect(route).toBeDefined();
        expect(route!.builder.getName()).toBe('my_api_v2_users');
        expect(route!.actionKey).toBe('get_by_id');
    });

    it('simple name without underscores also resolves correctly', () => {
        const builder = createMockBuilder('billing', ['list', 'pay']);
        const result = compileExposition([builder as any], 'flat', '_');

        const route = result.routingMap.get('billing_list');
        expect(route).toBeDefined();
        expect(route!.builder.getName()).toBe('billing');
        expect(route!.actionKey).toBe('list');
    });

    it('telemetry group/action extraction via routing map vs naive split', () => {
        const builder = createMockBuilder('user_accounts', ['list', 'create']);
        const result = compileExposition([builder as any], 'flat', '_');

        const name = 'user_accounts_list';

        // OLD (buggy): naive split
        const parts = name.split('_');
        const naiveGroup = parts[0]!;
        const naiveAction = parts.slice(1).join('_');
        expect(naiveGroup).toBe('user');            // WRONG
        expect(naiveAction).toBe('accounts_list');  // WRONG

        // NEW (fixed): routing map lookup
        const route = result.routingMap.get(name);
        const fixedGroup = route ? route.builder.getName() : name;
        const fixedAction = route ? route.actionKey : name;
        expect(fixedGroup).toBe('user_accounts');   // CORRECT
        expect(fixedAction).toBe('list');            // CORRECT
    });

    it('topology map built with getName() groups actions correctly', () => {
        const builders = [
            createMockBuilder('user_accounts', ['list', 'create']),
            createMockBuilder('billing', ['pay', 'refund']),
            createMockBuilder('api_v2_health', ['check']),
        ];

        // Simulate the fixed topology builder (startServer.ts fix)
        const toolGroups = new Map<string, string[]>();
        for (const b of builders) {
            const group = b.getName();
            for (const actionKey of b.getActionNames()) {
                const list = toolGroups.get(group) ?? [];
                list.push(actionKey);
                toolGroups.set(group, list);
            }
        }

        expect(toolGroups.get('user_accounts')).toEqual(['list', 'create']);
        expect(toolGroups.get('billing')).toEqual(['pay', 'refund']);
        expect(toolGroups.get('api_v2_health')).toEqual(['check']);

        // The old buggy approach would produce:
        // 'user' → ['accounts_list', 'accounts_create']  (WRONG)
        expect(toolGroups.has('user')).toBe(false);
    });

    it('dot separator also resolves correctly', () => {
        const builder = createMockBuilder('user_accounts', ['list']);
        const result = compileExposition([builder as any], 'flat', '.');

        const route = result.routingMap.get('user_accounts.list');
        expect(route).toBeDefined();
        expect(route!.builder.getName()).toBe('user_accounts');
        expect(route!.actionKey).toBe('list');
    });

    it('fallback for unrecognized tool name returns name as-is', () => {
        const builder = createMockBuilder('billing', ['pay']);
        const result = compileExposition([builder as any], 'flat', '_');

        // Look up a tool name that's not in the routing map
        const route = result.routingMap.get('unknown_tool_name');
        const group = route ? route.builder.getName() : 'unknown_tool_name';
        const action = route ? route.actionKey : 'unknown_tool_name';

        expect(group).toBe('unknown_tool_name');
        expect(action).toBe('unknown_tool_name');
    });
});
