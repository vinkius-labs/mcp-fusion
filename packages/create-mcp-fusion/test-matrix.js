import { execSync } from 'child_process';
import { rmSync, existsSync } from 'fs';
import { resolve } from 'path';

const matrix = [
    ['my-server-flat-stdio', 'flat', 'stdio', true],
    ['my-server-flat-sse', 'flat', 'sse', true],
    ['my-server-grouped-stdio', 'grouped', 'stdio', true],
    ['my-server-grouped-sse', 'grouped', 'sse', true]
];

for (const [name, exposition, transport, testing] of matrix) {
    console.log(`\n===========================================`);
    console.log(`TESTING: ${name} (Exp: ${exposition}, Trans: ${transport}, Test: ${testing})`);
    console.log(`===========================================\n`);

    const targetDir = resolve('.', name);
    if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
    }

    try {
        console.log('-> Scaffolding natively via function call...');
        
        // Use the index directly via exec to simulate the real environment, but bypassing prompts
        // Wait, index uses interactive prompts. We can't easily bypass them without modifying index.ts
        // Let's write a quick script that calls scaffold() directly.
    } catch (e) {
        console.error('Failed:', e);
        process.exit(1);
    }
}
