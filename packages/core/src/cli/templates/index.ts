/**
 * Templates — Barrel Export
 *
 * Re-exports all template generators from their focused modules.
 * @module
 */

// Config (package.json, tsconfig, etc.)
export { packageJson, tsconfig, gitignore, envExample } from './config.js';

// Core source (fusion.ts, context.ts, server.ts)
export { fusionTs, contextTs, serverTs } from './core.js';

// Tools
export { healthToolTs, echoToolTs } from './tools.js';

// Presenter
export { systemPresenterTs } from './presenter.js';

// Prompt
export { greetPromptTs } from './prompt.js';

// Middleware
export { authMiddlewareTs } from './middleware.js';

// Testing
export { vitestConfig, testSetupTs, systemTestTs } from './testing.js';

// README
export { readme } from './readme.js';

// Cursor integration
export { cursorMcpJson } from './cursor.js';

// Vector-specific
export { prismaSchema, dbUsersToolTs, n8nConnectorTs, openapiYaml, openapiSetupMd, oauthSetupTs, oauthMiddlewareTs } from './vectors/index.js';
