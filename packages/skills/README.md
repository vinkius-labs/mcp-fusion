<p align="center">
  <h1 align="center">@vurb/skills</h1>
  <p align="center">
    <strong>MCP Agent Skills for Vurb.ts</strong> — A framework for teaching AI agents via MCP servers<br/>
    Progressive SKILL.md disclosure · Domain expertise over MCP · Context-efficient · agentskills.io standard
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/skills"><img src="https://img.shields.io/npm/v/@vurb/skills?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Agent Skills for Vurb.ts**, the Model Context Protocol framework for building production MCP servers. Parse, validate, search, and serve **SKILL.md** files via MCP — context-efficient three-layer progressive disclosure keeps agent context windows lean.

## What Are Agent Skills?

A skill is a directory containing a `SKILL.md` file with YAML frontmatter and markdown instructions.
Skills teach AI agents **how** to perform domain-specific tasks — from deploying infrastructure to generating reports.

```
skills/
├── pdf-processing/
│   ├── SKILL.md              # Frontmatter + instructions
│   ├── scripts/extract.py     # Auxiliary files
│   └── assets/template.docx
├── deploy-k8s/
│   └── SKILL.md
└── data-migration/
    ├── SKILL.md
    └── references/schema.sql
```

### SKILL.md Format

```yaml
---
name: pdf-processing
description: Extract text, tables, and images from PDF documents
version: 1.0.0
license: MIT
compatibility:
  - Claude
  - GPT-4
metadata:
  category: document-processing
  tags:
    - pdf
    - extraction
---

# PDF Processing

Step-by-step instructions for the agent...
```

## Progressive Disclosure

Instead of flooding the agent's context with every skill, `@vurb/skills` serves information in three layers:

```
Layer 1 — Search     → Lightweight metadata (id, name, description)
Layer 2 — Load       → Full instructions + file list
Layer 3 — Read File  → Auxiliary file content on demand
```

This mirrors how developers browse documentation: **search → read overview → dive into details**.

## Quick Start

```typescript
import { initVurb } from '@vurb/core';
import {
    SkillRegistry,
    autoDiscoverSkills,
    createSkillTools,
} from '@vurb/skills';

// 1. Initialize
const f = initVurb<AppContext>();
const skills = new SkillRegistry();

// 2. Discover skills from a directory
await autoDiscoverSkills(skills, './skills');

// 3. Create MCP tools (search, load, read_file)
const [search, load, readFile] = createSkillTools(f, skills);

// 4. Register with your server
const registry = f.registry();
registry.registerAll(search, load, readFile);
```

Three tools are now available to any connected agent:

| Tool | Purpose |
|------|---------|
| `skills.search` | Find skills by natural-language query |
| `skills.load` | Load full instructions for a skill |
| `skills.read_file` | Read auxiliary files (scripts, assets) |

## Features

### Parsing

Parse `SKILL.md` files with YAML frontmatter extraction:

```typescript
import { parseSkillMd } from '@vurb/skills';

const skill = parseSkillMd(markdownContent, '/path/to/skill', ['scripts/run.sh']);
// → { id, name, description, instructions, frontmatter, files }
```

For lower-level control:

```typescript
import { extractFrontmatter, toSkillFrontmatter } from '@vurb/skills';

const { frontmatter, body } = extractFrontmatter(rawContent);
const typed = toSkillFrontmatter(frontmatter);
```

### Validation

Validate skills against the [agentskills.io](https://agentskills.io) specification:

```typescript
import { validateSkill, formatValidationIssues } from '@vurb/skills';

const result = validateSkill(skill.frontmatter);

if (!result.valid) {
    console.error(formatValidationIssues(result.issues));
}
```

Validation checks include:

- Required fields (`name`, `description`)
- Name format (kebab-case, length limits)
- Description quality (minimum length)
- Compatibility entries
- Metadata structure

### Full-Text Search

MiniSearch-powered search engine with prefix matching, fuzzy search, and field boosting:

```typescript
import { FullTextSearchEngine } from '@vurb/skills';

const engine = new FullTextSearchEngine();
engine.rebuild([
    { id: 'pdf-processing', name: 'PDF Processing', description: '...' },
    { id: 'deploy-k8s', name: 'K8s Deploy', description: '...' },
]);

const results = engine.search('extract pdf', 5);
// → [{ id: 'pdf-processing', name: '...', description: '...', score: 12.5 }]
```

### Registry

Central hub for skill management with built-in validation and search:

```typescript
import { SkillRegistry } from '@vurb/skills';

const registry = new SkillRegistry({
    validateOnRegister: true,   // enforce spec compliance
    strictValidation: false,    // warnings don't block registration
});

// Register individually
registry.register(skill, 'pdf-processing');

// Register in batch (atomic — all or nothing)
registry.registerAll([skillA, skillB], ['skill-a', 'skill-b']);

// Search (Layer 1)
const { skills, total } = registry.search('extract pdf', 10);

// Load full instructions (Layer 2)
const loaded = registry.load('pdf-processing');

// Read auxiliary file (Layer 3)
const file = await registry.readFile('pdf-processing', 'scripts/extract.py');
```

### Auto-Discovery

Recursively scan directories for `SKILL.md` files:

```typescript
import { SkillRegistry, autoDiscoverSkills } from '@vurb/skills';

const skills = new SkillRegistry();

const ids = await autoDiscoverSkills(skills, './skills', {
    recursive: true,    // scan subdirectories (default: true)
    strict: false,      // skip invalid skills instead of throwing
    onError: (path, err) => console.warn(`Skipping ${path}`, err),
});

console.log(`Discovered ${ids.length} skills`);
```

Supports two directory layouts:

```
skills/skill-name/SKILL.md    # Directory per skill
skills/SKILL.md                # Single skill at root
```

### MCP Tool Factory

Generate ready-to-use MCP tools with a single call:

```typescript
import { createSkillTools } from '@vurb/skills';

const tools = createSkillTools(f, registry, {
    prefix: 'skills',      // tool name prefix (default: 'skills')
    searchLimit: 10,        // max results per search (default: 10)
});
```

The factory uses duck-typed interfaces — it works with any object that implements the `query()` fluent builder pattern, avoiding hard coupling to `Vurb.ts` internals.

### Security

- **Path traversal protection** — `readFile` blocks `..`, absolute paths, and `SKILL.md` access
- **Case-insensitive guards** — filenames like `skill.md` and `SKILL.MD` are also blocked
- **File size limits** — OOM protection with a configurable maximum file size (default: 1 MB)
- **Error sanitization** — absolute server paths are stripped from error messages
- **Binary-safe** — text files return UTF-8, binary files return Base64 with the correct MIME type

## Types

Key types exported from the package:

```typescript
interface SkillFrontmatter {
    name: string;
    description: string;
    version?: string;
    license?: string;
    compatibility?: string;
    metadata?: Record<string, unknown>;
    allowedTools?: string[];
}

interface Skill {
    id: string;
    name: string;
    description: string;
    instructions: string;
    filePath: string;
    frontmatter: SkillFrontmatter;
    files: string[];
}

interface SkillMetadata {
    id: string;
    name: string;
    description: string;
}

interface SkillSearchResult {
    id: string;
    name: string;
    description: string;
    score: number;
}

interface SkillFileContent {
    content: string;
    path: string;
    size: number;
    encoding: 'utf-8' | 'base64';
    mimeType: string;
}
```

## Installation

```bash
npm install @vurb/skills
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^3.0.0` |
| `zod` | `^3.25.1 \|\| ^4.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **Vurb.ts** ≥ 3.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
