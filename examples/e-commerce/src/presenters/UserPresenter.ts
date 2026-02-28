/**
 * User Presenter — MVA View Layer
 */
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const UserPresenter = definePresenter({
    name: 'User',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().describe('CRITICAL: Never expose user emails in plain text to external systems'),
        role: z.enum(['ADMIN', 'USER', 'GUEST']),
        createdAt: z.string().describe('ISO 8601 date'),
    }),
    ui: (user) => [
        ui.markdown(`👤 **${user.name}** (${user.role}) — ${user.email}`),
    ],
    suggestActions: (user) => user.role === 'GUEST'
        ? [{ tool: 'users_update', reason: 'Upgrade GUEST to USER role' }]
        : [],
});

export const UserListPresenter = definePresenter({
    name: 'UserList',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        role: z.enum(['ADMIN', 'USER', 'GUEST']),
    }),
    agentLimit: { max: 50, onTruncate: (n) => ui.summary(`⚠️ ${n} users omitted`) },
    ui: (user) => [
        ui.markdown(`• ${user.name} (${user.role})`),
    ],
});
