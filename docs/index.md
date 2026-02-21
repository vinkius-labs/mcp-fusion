---
layout: home

hero:
  name: "The TypeScript framework for MCP."
  text: ""
  tagline: "Build production-grade MCP servers with zero boilerplate. Slash LLM context window limits through intelligent routing, prevent tool-calling errors, and guarantee transparent type safety."
  actions:
    - theme: brand
      text: Get Started
      link: /introduction
    - theme: alt
      text: Documentation
      link: /quickstart

  # Vercel-style subtle text under buttons
  textAfterActions: "100% Open Source. Built by Vinkius Labs."
---

<!-- Vinkius Bento Custom Diagramming -->
<div class="vinkius-bento-grid">
<div class="bento-hero">
<h2 class="bento-title">Three pillars.<br><span class="text-dim">One framework.</span></h2>
<p class="bento-desc">Code, scale, and route — without boilerplate. Every feature reads from the same core principles: deep type safety, execution efficiency, and LLM-native abstractions.</p>
<div class="bento-tags">
<span class="bento-tag">TYPESCRIPT</span>
<span class="bento-tag">ZOD</span>
<span class="bento-tag active">MCP FUSION</span>
<span class="bento-tag">COMPRESSION</span>
</div>

<div class="bento-code-section">
<div class="bento-code-header">
<div class="bento-dots"><span></span><span></span><span></span></div>
<p class="bento-code-title">Write beautifully typed tools without the boilerplate.</p>
</div>
<div class="bento-code-box">

```typescript
import { createTool, success } from "@vinkius-core/mcp-fusion";
import { z } from "zod";

// 1. Fully typed, zero-boilerplate tool definition
export const deployProjectTool = createTool("deploy_project")
  .description("Deploys a new architecture instance.")
  .schema(z.object({
    projectId: z.string().uuid(),
    region: z.enum(["us-east-1", "eu-west-1"])
  }))
  .action({
    name: "deploy",
    description: "Launch the environment",
    handler: async (ctx, args) => {
      // 2. 'args' is perfectly inferred! No generic 'any'
      const { projectId, region } = args;
      const url = await DeployService.trigger(projectId, region);
      
      // 3. Simple, predictable pattern
      return success(`Instance deployed at: ${url}`);
    }
  });
```

</div>
<div class="bento-cli-box">
<span class="cli-prompt">~</span>
<span class="cli-text">npm install <span>@vinkius-core/mcp-fusion</span> zod</span>
</div>
</div>

<div class="bento-footer">
<span>SYS_INTEGRITY</span>
<span>100%</span>
</div>
</div>
<div class="bento-features">
<div class="bento-cell">
<div class="cell-eyebrow">// CORE</div>
<h3 class="cell-title">Absolute Type Safety <span class="cell-badge">Zod</span></h3>
<p class="cell-desc">Define schemas effortlessly. The engine deeply infers handler types and prevents LLM errors at the edge.</p>
<a href="/building-tools" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// ROUTING</div>
<h3 class="cell-title">Hierarchical Routing <span class="cell-badge">Scale</span></h3>
<p class="cell-desc">Eliminate flat-API token bloat. Nest hundreds of operations into highly structured sub-namespaces.</p>
<a href="/routing" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// OPTIMIZATION</div>
<h3 class="cell-title">Payload Compression <span class="cell-badge">TOON</span></h3>
<p class="cell-desc">Natively transpile heavy Markdown descriptions into tabular, highly dense TOON structures LLMs adore.</p>
<a href="/advanced-configuration" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// SECURITY</div>
<h3 class="cell-title">Scoped Middleware <span class="cell-badge">Runtime</span></h3>
<p class="cell-desc">Attach global, group, or per-action level middlewares compiled perfectly transparently at build time.</p>
<a href="/middleware" class="cell-link">EXPLORE &rarr;</a>
</div>
</div>
</div>
