// Pre-commit hook logic (CommonJS).
// Called by .githooks/pre-commit shell wrapper.
'use strict';

const { execSync } = require('node:child_process');

function run(cmd, label) {
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch {
        console.error('');
        console.error(`ERROR: ${label}`);
        console.error('');
        process.exit(1);
    }
}

function git(cmd) {
    return execSync(cmd, { encoding: 'utf8' }).trim();
}

// ── 1. Lock file sync check ──────────────────────────────

const stagedFiles = git('git diff --cached --name-only --diff-filter=ACM');
const stagedPackageJsons = stagedFiles
    .split('\n')
    .filter((f) => f.endsWith('package.json'));

if (stagedPackageJsons.length > 0) {
    const allStaged = git('git diff --cached --name-only');
    const hasLockFile = allStaged
        .split('\n')
        .some((f) => f === 'package-lock.json');

    if (!hasLockFile) {
        console.error('');
        console.error(
            'ERROR: package.json was modified but package-lock.json is not staged.',
        );
        console.error('');
        console.error('Modified package.json files:');
        for (const f of stagedPackageJsons) {
            console.error(`  - ${f}`);
        }
        console.error('');
        console.error("Run 'npm install' and stage the lock file:");
        console.error('  npm install && git add package-lock.json');
        console.error('');
        process.exit(1);
    }
}

// ── 2. Build ──────────────────────────────────────────────

console.log('[pre-commit] Building core...');
run('npm run build -w packages/core', 'Core build failed. Fix build errors before committing.');

console.log('[pre-commit] Building satellite packages...');
run('npm run build -ws --if-present', 'Satellite build failed. Fix build errors before committing.');

// ── 3. Tests ──────────────────────────────────────────────

console.log('[pre-commit] Running tests...');
run('npm test', 'Tests failed. Fix the failing tests before committing.');

console.log('[pre-commit] All checks passed.');
