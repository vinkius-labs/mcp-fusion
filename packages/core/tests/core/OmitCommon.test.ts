import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder, success } from '../../src/core/index.js';
import type { ToolResponse } from '../../src/core/index.js';

// ============================================================================
// Helpers
// ============================================================================
const dummyHandler = async (_ctx: unknown, _args: Record<string, unknown>): Promise<ToolResponse> =>
    success('ok');

const echoHandler = async (_ctx: unknown, args: Record<string, unknown>): Promise<ToolResponse> =>
    success(JSON.stringify(args));

// ============================================================================
// omitCommon — Flat Mode
// ============================================================================

describe('omitCommon — Flat Mode', () => {
    it('should remove omitted common field from LLM schema for that action', () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({
                workspace_id: z.string().describe('Workspace'),
            }))
            .action({
                name: 'list',
                handler: dummyHandler,
            })
            .action({
                name: 'me',
                omitCommon: ['workspace_id'],
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const props = tool.inputSchema.properties as Record<string, any>;

        // workspace_id should still be in properties (used by 'list')
        expect(props.workspace_id).toBeDefined();

        // But NOT in global required (since 'me' omits it)
        expect(tool.inputSchema.required).not.toContain('workspace_id');

        // Annotation should say "Required for: list" (not "always required")
        expect(props.workspace_id.description).toContain('Required for: list');
        expect(props.workspace_id.description).not.toContain('always required');
    });

    it('should not validate omitted field for the omitting action', async () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .action({
                name: 'list',
                handler: echoHandler,
            })
            .action({
                name: 'me',
                omitCommon: ['workspace_id'],
                handler: echoHandler,
            });

        builder.buildToolDefinition();

        // 'me' should succeed WITHOUT workspace_id
        const meResult = await builder.execute(undefined as any, {
            action: 'me',
        });
        expect(meResult.isError).toBeUndefined();
        const meArgs = JSON.parse(meResult.content[0].text);
        expect(meArgs.workspace_id).toBeUndefined();

        // 'list' should FAIL without workspace_id
        const listResult = await builder.execute(undefined as any, {
            action: 'list',
        });
        expect(listResult.isError).toBe(true);
        expect(listResult.content[0].text).toContain('workspace_id');
    });

    it('should still validate action-specific schema when common is omitted', async () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .action({
                name: 'update',
                omitCommon: ['workspace_id'],
                schema: z.object({ display_name: z.string() }),
                handler: echoHandler,
            });

        builder.buildToolDefinition();

        // Missing display_name → validation error
        const result1 = await builder.execute(undefined as any, {
            action: 'update',
        });
        expect(result1.isError).toBe(true);
        expect(result1.content[0].text).toContain('display_name');

        // Valid — workspace_id not required, display_name provided
        const result2 = await builder.execute(undefined as any, {
            action: 'update',
            display_name: 'John',
        });
        expect(result2.isError).toBeUndefined();
    });

    it('should keep "(always required)" when no action omits the field', () => {
        const builder = new GroupedToolBuilder('projects')
            .commonSchema(z.object({
                workspace_id: z.string().describe('WS'),
            }))
            .action({ name: 'list', handler: dummyHandler })
            .action({ name: 'create', handler: dummyHandler });

        const tool = builder.buildToolDefinition();
        const props = tool.inputSchema.properties as Record<string, any>;

        expect(props.workspace_id.description).toContain('(always required)');
        expect(tool.inputSchema.required).toContain('workspace_id');
    });
});

// ============================================================================
// omitCommon — Group Mode
// ============================================================================

describe('omitCommon — Group Mode', () => {
    it('should support group-level omitCommon for all actions in the group', () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({
                workspace_id: z.string().describe('WS'),
            }))
            .group('profile', 'User profile', g => {
                g.omitCommon('workspace_id')
                 .action({ name: 'me', readOnly: true, handler: dummyHandler })
                 .action({ name: 'settings', readOnly: true, handler: dummyHandler });
            })
            .group('management', 'Admin', g => {
                g.action({ name: 'list', readOnly: true, handler: dummyHandler });
            });

        const tool = builder.buildToolDefinition();
        const props = tool.inputSchema.properties as Record<string, any>;

        // workspace_id used only by management.list
        expect(props.workspace_id.description).toContain('Required for: management.list');
        expect(props.workspace_id.description).not.toContain('always required');

        // Not in global required
        expect(tool.inputSchema.required).not.toContain('workspace_id');
    });

    it('should validate correctly with group-level omit', async () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .group('profile', 'Profile', g => {
                g.omitCommon('workspace_id')
                 .action({ name: 'me', handler: echoHandler });
            })
            .group('admin', 'Admin', g => {
                g.action({ name: 'list', handler: echoHandler });
            });

        builder.buildToolDefinition();

        // profile.me succeeds without workspace_id
        const meResult = await builder.execute(undefined as any, {
            action: 'profile.me',
        });
        expect(meResult.isError).toBeUndefined();

        // admin.list fails without workspace_id
        const listResult = await builder.execute(undefined as any, {
            action: 'admin.list',
        });
        expect(listResult.isError).toBe(true);
        expect(listResult.content[0].text).toContain('workspace_id');
    });

    it('should merge group-level and per-action omissions', async () => {
        const builder = new GroupedToolBuilder('platform')
            .commonSchema(z.object({
                workspace_id: z.string(),
                tenant_id: z.string(),
            }))
            .group('profile', 'Profile', g => {
                g.omitCommon('workspace_id')  // Group-level: omit workspace_id
                 .action({
                     name: 'me',
                     omitCommon: ['tenant_id'],  // Per-action: also omit tenant_id
                     handler: echoHandler,
                 })
                 .action({
                     name: 'settings',
                     handler: echoHandler,  // Only inherits group-level omit (workspace_id)
                 });
            });

        builder.buildToolDefinition();

        // profile.me: both workspace_id AND tenant_id omitted
        const meResult = await builder.execute(undefined as any, {
            action: 'profile.me',
        });
        expect(meResult.isError).toBeUndefined();

        // profile.settings: only workspace_id omitted, tenant_id still required
        const settingsResult = await builder.execute(undefined as any, {
            action: 'profile.settings',
        });
        expect(settingsResult.isError).toBe(true);
        expect(settingsResult.content[0].text).toContain('tenant_id');

        // profile.settings with tenant_id → success
        const settingsOk = await builder.execute(undefined as any, {
            action: 'profile.settings',
            tenant_id: 'acme',
        });
        expect(settingsOk.isError).toBeUndefined();
    });
});

// ============================================================================
// omitCommon — Schema & Annotation Fidelity
// ============================================================================

describe('omitCommon — Schema & Annotation Fidelity', () => {
    it('should produce correct per-field annotations with partial omit', () => {
        const builder = new GroupedToolBuilder('api')
            .commonSchema(z.object({
                workspace_id: z.string().describe('WS'),
                api_key: z.string().describe('Key'),
            }))
            .action({ name: 'list', handler: dummyHandler })
            .action({
                name: 'me',
                omitCommon: ['workspace_id'],
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const props = tool.inputSchema.properties as Record<string, any>;

        // api_key: not omitted by anyone → still "(always required)"
        expect(props.api_key.description).toContain('(always required)');
        expect(tool.inputSchema.required).toContain('api_key');

        // workspace_id: omitted by 'me' → "Required for: list" 
        expect(props.workspace_id.description).toContain('Required for: list');
        expect(tool.inputSchema.required).not.toContain('workspace_id');
    });

    it('should remove property entirely when ALL actions omit a common field', () => {
        const builder = new GroupedToolBuilder('internal')
            .commonSchema(z.object({
                internal_trace: z.string(),
                workspace_id: z.string(),
            }))
            .action({
                name: 'ping',
                omitCommon: ['internal_trace'],
                handler: dummyHandler,
            })
            .action({
                name: 'health',
                omitCommon: ['internal_trace'],
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const props = tool.inputSchema.properties as Record<string, any>;

        // internal_trace omitted by ALL actions → not in properties at all
        expect(props.internal_trace).toBeUndefined();

        // workspace_id still present
        expect(props.workspace_id).toBeDefined();
    });

    it('should handle omitting from multi-field common schema', async () => {
        const builder = new GroupedToolBuilder('multi')
            .commonSchema(z.object({
                org_id: z.string(),
                project_id: z.string(),
                user_id: z.string(),
            }))
            .action({
                name: 'dashboard',
                omitCommon: ['project_id', 'user_id'],
                handler: echoHandler,
            })
            .action({
                name: 'detail',
                handler: echoHandler,
            });

        builder.buildToolDefinition();

        // dashboard: only org_id required
        const result = await builder.execute(undefined as any, {
            action: 'dashboard',
            org_id: 'acme',
        });
        expect(result.isError).toBeUndefined();
        const args = JSON.parse(result.content[0].text);
        expect(args.org_id).toBe('acme');
        expect(args.project_id).toBeUndefined();
        expect(args.user_id).toBeUndefined();

        // detail: all three required
        const detailFail = await builder.execute(undefined as any, {
            action: 'detail',
            org_id: 'acme',
        });
        expect(detailFail.isError).toBe(true);
        expect(detailFail.content[0].text).toContain('project_id');
    });
});

// ============================================================================
// omitCommon — Edge Cases
// ============================================================================

describe('omitCommon — Edge Cases', () => {
    it('should handle omitting ALL common fields for an action', async () => {
        const builder = new GroupedToolBuilder('minimal')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .action({
                name: 'ping',
                omitCommon: ['workspace_id'],
                handler: echoHandler,
            });

        builder.buildToolDefinition();

        // Should succeed with zero args
        const result = await builder.execute(undefined as any, { action: 'ping' });
        expect(result.isError).toBeUndefined();
    });

    it('should ignore omitCommon for fields not in commonSchema', async () => {
        const builder = new GroupedToolBuilder('safe')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .action({
                name: 'list',
                omitCommon: ['nonexistent_field'],
                handler: echoHandler,
            });

        builder.buildToolDefinition();

        // workspace_id is still required (nonexistent_field is ignored)
        const result = await builder.execute(undefined as any, {
            action: 'list',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('workspace_id');
    });

    it('should work with omitCommon when no commonSchema is set', () => {
        // Defensive: omitCommon should be silently ignored if no common schema
        const builder = new GroupedToolBuilder('nocommon')
            .action({
                name: 'ping',
                omitCommon: ['workspace_id'],
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        expect(tool.name).toBe('nocommon');
        expect(tool.inputSchema.required).toEqual(['action']);
    });

    it('should work with empty omitCommon array', () => {
        const builder = new GroupedToolBuilder('empty_omit')
            .commonSchema(z.object({ workspace_id: z.string() }))
            .action({
                name: 'list',
                omitCommon: [],
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        // Empty array = no omission — workspace_id should be always required
        expect(tool.inputSchema.required).toContain('workspace_id');
    });

    it('should deduplicate merged group + per-action omit fields', async () => {
        const builder = new GroupedToolBuilder('dedup')
            .commonSchema(z.object({
                workspace_id: z.string(),
                tenant_id: z.string(),
            }))
            .group('test', 'Test', g => {
                // Group omits workspace_id, action also omits workspace_id → deduped
                g.omitCommon('workspace_id')
                 .action({
                     name: 'check',
                     omitCommon: ['workspace_id'],
                     handler: echoHandler,
                 });
            });

        builder.buildToolDefinition();

        // Still requires tenant_id, workspace_id omitted
        const result = await builder.execute(undefined as any, {
            action: 'test.check',
            tenant_id: 'acme',
        });
        expect(result.isError).toBeUndefined();
    });
});

// ============================================================================
// omitCommon — Metadata / Introspection
// ============================================================================

describe('omitCommon — Metadata & Introspection', () => {
    it('should reflect in previewPrompt that field is NOT always required', () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({
                workspace_id: z.string().describe('WS'),
            }))
            .action({ name: 'list', handler: dummyHandler })
            .action({
                name: 'me',
                omitCommon: ['workspace_id'],
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        const preview = builder.previewPrompt();

        // Preview should contain the tool name
        expect(preview).toContain('MCP Tool Preview: users');

        // workspace_id is still in properties (used by list), but should NOT be globally required
        expect(tool.inputSchema.required).toEqual(['action']);
        expect(preview).toContain('Required for: list');
    });

    it('should correctly report action metadata despite omitCommon', () => {
        const builder = new GroupedToolBuilder('users')
            .commonSchema(z.object({ workspace_id: z.string() }))
            .action({
                name: 'me',
                readOnly: true,
                omitCommon: ['workspace_id'],
                handler: dummyHandler,
            })
            .action({
                name: 'list',
                readOnly: true,
                handler: dummyHandler,
            });

        const meta = builder.getActionMetadata();
        expect(meta).toHaveLength(2);
        expect(meta[0].key).toBe('me');
        expect(meta[0].readOnly).toBe(true);
        expect(meta[1].key).toBe('list');
        expect(meta[1].readOnly).toBe(true);
    });
});

// ============================================================================
// Scenario — SaaS Multi-Tenant (Real-World)
// ============================================================================

describe('Scenario — SaaS Multi-Tenant with omitCommon', () => {
    it('should handle the classic profile.me + management.list split', async () => {
        type AppContext = { user: { id: string; workspace_id: string } };

        const resolveWorkspaceFromToken = async (
            ctx: AppContext, args: Record<string, unknown>, next: () => Promise<ToolResponse>,
        ) => {
            // Middleware injects workspace_id from the user context
            args.workspace_id = ctx.user.workspace_id;
            return next();
        };

        const builder = new GroupedToolBuilder<AppContext>('users')
            .description('User management')
            .commonSchema(z.object({
                workspace_id: z.string().describe('Workspace identifier'),
            }))
            .group('profile', 'Self-service profile', g => {
                g.omitCommon('workspace_id')
                 .use(resolveWorkspaceFromToken)
                 .action({
                     name: 'me',
                     readOnly: true,
                     handler: async (ctx, args) => {
                         // workspace_id was injected by middleware
                         return success({
                             id: ctx.user.id,
                             workspace: args.workspace_id,
                         });
                     },
                 });
            })
            .group('management', 'Admin operations', g => {
                g.action({
                     name: 'list',
                     readOnly: true,
                     schema: z.object({ role: z.string().optional() }),
                     handler: async (_ctx, args) => {
                         return success({
                             workspace: args.workspace_id,
                             role: args.role,
                         });
                     },
                 });
            });

        const tool = builder.buildToolDefinition();
        const props = tool.inputSchema.properties as Record<string, any>;

        // Schema: workspace_id is "Required for: management.list" (not always required)
        expect(props.workspace_id.description).toContain('Required for: management.list');
        expect(tool.inputSchema.required).not.toContain('workspace_id');

        // Execution: profile.me works WITHOUT workspace_id from LLM
        const ctx: AppContext = { user: { id: 'u_001', workspace_id: 'ws_abc' } };
        const meResult = await builder.execute(ctx, { action: 'profile.me' });
        expect(meResult.isError).toBeUndefined();
        const meData = JSON.parse(meResult.content[0].text);
        expect(meData.workspace).toBe('ws_abc');  // Injected by middleware

        // Execution: management.list REQUIRES workspace_id from LLM
        const listFail = await builder.execute(ctx, { action: 'management.list' });
        expect(listFail.isError).toBe(true);
        expect(listFail.content[0].text).toContain('workspace_id');

        const listOk = await builder.execute(ctx, {
            action: 'management.list',
            workspace_id: 'ws_abc',
            role: 'admin',
        });
        expect(listOk.isError).toBeUndefined();
        const listData = JSON.parse(listOk.content[0].text);
        expect(listData.workspace).toBe('ws_abc');
        expect(listData.role).toBe('admin');
    });
});
