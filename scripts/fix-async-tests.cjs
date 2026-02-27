const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'packages', 'core', 'tests', 'introspection');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

for (const file of files) {
    const fp = path.join(dir, file);
    let content = fs.readFileSync(fp, 'utf-8');
    const orig = content;

    // 1. Make ALL it() callbacks async (they pretty much all use async functions now)
    content = content.replace(/it\('([^']+)',\s*\(\)\s*=>/g, "it('$1', async () =>");

    // 2. Make ALL helper functions that could directly or transitively call sha256 async
    // This broader list catches makeSurface, makeContract, makeAction, etc.
    const helperFns = [
        'createBaseContract', 'createContract', 'makeContract', 'makeToolContract',
        'makeAction', 'makeSurface', 'makeToolContracts'
    ];
    for (const fn of helperFns) {
        const re = new RegExp(`function ${fn}\\(`, 'g');
        content = content.replace(re, `async function ${fn}(`);
    }

    // 3. Add await before assignments to now-async functions
    const asyncFns = [
        'compileContracts', 'computeServerDigest', 'computeDigest',
        'generateLockfile', 'checkLockfile', 'materializeContract', 'materializeBehavior',
        ...helperFns
    ];
    for (const fn of asyncFns) {
        // Match "= functionName(" but not "= await functionName("
        const assignRe = new RegExp(`= (?!await )${fn}\\(`, 'g');
        content = content.replace(assignRe, `= await ${fn}(`);
    }

    // 4. Add await before ALL sha256 calls that don't already have it
    content = content.replace(/(?<!await )sha256\(/g, 'await sha256(');

    // 5. Handle inline calls that are NOT assignments but need await:
    //    e.g. "actions: { run: makeAction() }" or "surface: makeSurface(...)"
    for (const fn of helperFns) {
        // property: functionName(
        const propRe = new RegExp(`(:\\s*)(?!await )${fn}\\(`, 'g');
        content = content.replace(propRe, `$1await ${fn}(`);
    }

    // 6. Handle spread of async functions: "...makeContract(" -> "...(await makeContract("
    // and fix ".surface" access etc
    for (const fn of helperFns) {
        content = content.replace(new RegExp(`\\.\\.\\.${fn}\\(`, 'g'), `...(await ${fn}(`);
        // Add closing paren for the spread await wrapper - tricky, skip for now
    }

    // 7. Fix 'await await' duplicates
    content = content.replace(/await await /g, 'await ');
    
    // 8. Fix 'async async function' duplicates
    content = content.replace(/async async function/g, 'async function');

    if (content !== orig) {
        fs.writeFileSync(fp, content);
        console.log('Fixed: ' + file);
    }
}
console.log('Done');
