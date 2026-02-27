const fs = require('fs');
const path = require('path');

const seoPath = 'docs/.vitepress/seo.ts';
let seoContent = fs.readFileSync(seoPath, 'utf-8');

const regex = /'((?:[^']|\\')+\.md)':/g;
let match;
const seoPages = new Set();
while ((match = regex.exec(seoContent)) !== null) {
  seoPages.add(match[1]);
}

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'api' || file === 'node_modules' || file.startsWith('.')) continue;
    const name = dir + '/' + file;
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else if (name.endsWith('.md')) {
      const relPath = path.relative('docs', name).replace(/\\/g, '/');
      files.push(relPath);
    }
  }
  return files;
}

const allMdFiles = getFiles('docs');
const missing = allMdFiles.filter(i => !seoPages.has(i));

if (missing.length === 0) {
    console.log('No missing pages!');
    process.exit(0);
}

function convertToTitle(str) {
    return str.replace(/-/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
}

let newContent = '';
for (const page of missing) {
    let title = '';
    const parts = page.replace('.md', '').split('/');
    if (parts.length > 1) {
       title = convertToTitle(parts[parts.length - 2]) + ' : ' + convertToTitle(parts[parts.length - 1]);
    } else {
       title = convertToTitle(parts[0]);
    }

    newContent += '\n  // ═══════════════════════════════════════════════════════\n';
    newContent += '  // ' + page.toUpperCase() + '\n';
    newContent += '  // ═══════════════════════════════════════════════════════\n';
    newContent += '  \'' + page + '\': {\n';
    newContent += '    title: \'' + title + ' - MCP Fusion Documentation\',\n';
    newContent += '    description: \'Documentation for ' + title + ' in the MCP Fusion framework.\',\n';
    newContent += '    faqs: [],\n';
    newContent += '  },\n';
}

const insertIdx = seoContent.lastIndexOf('};\n\n// ═══════════════════════════════════════════════════════');
if (insertIdx !== -1) {
    seoContent = seoContent.slice(0, insertIdx) + newContent + '\n' + seoContent.slice(insertIdx);
    fs.writeFileSync(seoPath, seoContent, 'utf-8');
    console.log('Successfully injected ' + missing.length + ' pages into seo.ts.');
} else {
    console.log('Could not find the insertion point');
}
