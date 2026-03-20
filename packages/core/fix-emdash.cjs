// Fix em-dash (—, U+2014) → double dash (--) in eslint-disable comments
const fs = require('fs');
const path = require('path');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(f => {
        const p = path.join(dir, f.name);
        return f.isDirectory() ? walk(p) : (p.endsWith('.ts') ? [p] : []);
    });
}

const EM_DASH = '\u2014';
let total = 0;

walk('src').forEach(f => {
    const old = fs.readFileSync(f, 'utf8');
    if (!old.includes(EM_DASH)) return;

    // Replace em-dash with double-dash only inside eslint-disable comments
    // The regex matches the entire comment line and replaces — with --
    const neo = old.replace(
        /(\/\/ eslint-disable[^\n]*)\u2014([^\n]*)/g,
        (match, before, after) => before + '--' + after
    );

    if (neo !== old) {
        fs.writeFileSync(f, neo, 'utf8');
        const n = (old.match(/\u2014/g) || []).length;
        total += n;
        console.log('Fixed', n, 'em-dash(es) in', f.replace(/.*src./, ''));
    }
});

console.log('Total em-dashes fixed:', total);
