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
 * Database Users Tool — Prisma-Driven CRUD (Fluent API)
 *
 * Demonstrates:
 * - f.query() with .withOptionalNumber() typed parameter
 * - .handle(input, ctx) — input.take is typed as number | undefined
 * - Implicit success() wrapping
 */
import { f } from '../../fusion.js';

export default f.query('db.list_users')
    .describe('List users from the database')
    .withOptionalNumber('take', 'Max results (1-50)')
    .handle(async (input, ctx) => {
        // TODO: Replace with your Prisma client
        // const users = await ctx.db.user.findMany({ take: input.take ?? 10 });
        // return users;

        return {
            hint: 'Connect your Prisma client in src/context.ts to enable database queries.',
            example: 'const users = await ctx.db.user.findMany({ take: 10 })',
        };
    });
`;
}

