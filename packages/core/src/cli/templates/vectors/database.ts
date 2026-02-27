/**
 * Database Vector — Prisma schema + DB tool templates
 * @module
 */

/** Generate `prisma/schema.prisma` */
export function prismaSchema(): string {
    return `// Prisma Schema — Database-Driven MCP Server
//
// The @vinkius-core/mcp-fusion-prisma-gen generator reads annotations
// and auto-generates Presenters + ToolBuilders with:
// - Field-level security (/// @fusion.hide)
// - Tenant isolation
// - OOM protection

generator client {
    provider = "prisma-client-js"
}

generator fusion {
    provider = "@vinkius-core/mcp-fusion-prisma-gen"
}

datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
}

model User {
    id        String   @id @default(cuid())
    email     String   @unique
    name      String

    /// @fusion.hide — Stripped by the Egress Firewall before reaching the LLM
    password  String

    role      String   @default("USER")
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    posts     Post[]
}

model Post {
    id        String   @id @default(cuid())
    title     String
    content   String?
    published Boolean  @default(false)
    createdAt DateTime @default(now())

    author    User     @relation(fields: [authorId], references: [id])
    authorId  String
}
`;
}

/** Generate `src/tools/db/users.ts` */
export function dbUsersToolTs(): string {
    return `/**
 * Database Users Tool — Prisma-Driven CRUD
 *
 * Example tool that queries the database via Prisma.
 * The Presenter strips the 'password' field before
 * it reaches the LLM context.
 */
import { f } from '../../fusion.js';
import { success } from '@vinkius-core/mcp-fusion';

export default f.tool({
    name: 'db.list_users',
    description: 'List users from the database',
    readOnly: true,
    input: {
        take: { type: 'number', min: 1, max: 50, optional: true, description: 'Max results' },
    },
    handler: async ({ input, ctx }) => {
        // TODO: Replace with your Prisma client
        // const users = await ctx.db.user.findMany({ take: input.take ?? 10 });
        // return users;

        return success({
            hint: 'Connect your Prisma client in src/context.ts to enable database queries.',
            example: 'const users = await ctx.db.user.findMany({ take: 10 })',
        });
    },
});
`;
}
