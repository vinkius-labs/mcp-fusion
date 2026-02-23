import { defineConfig } from 'vitepress'
import { getPageHeadTags } from './seo'

export default defineConfig({
  title: "MCP Fusion",
  description: "The MVA (Model-View-Agent) framework for building scalable Agentic APIs over the Model Context Protocol.",
  base: '/mcp-fusion/',
  cleanUrls: true,
  appearance: 'force-dark',

  head: [
    // ── Open Graph ──
    ['meta', { property: 'og:title', content: 'mcp-fusion — The MVA Framework for MCP Servers' }],
    ['meta', { property: 'og:description', content: 'The first framework with a Structured Perception Layer for your data — not guess. MVA (Model-View-Agent) architecture with Presenters, cognitive guardrails, and structured perception packages.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://vinkius-labs.github.io/mcp-fusion/' }],
    ['meta', { property: 'og:site_name', content: 'mcp-fusion' }],

    // ── Twitter Card ──
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'mcp-fusion — MVA Framework for MCP Servers' }],
    ['meta', { name: 'twitter:description', content: 'Stop dumping raw JSON. Build MCP servers with structured perception packages — validated data, domain rules, charts, and action affordances.' }],

    // ── JSON-LD: SoftwareSourceCode ──
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      'name': 'mcp-fusion',
      'alternateName': 'MCP Fusion',
      'description': 'The MVA (Model-View-Agent) framework for building scalable Agentic APIs over the Model Context Protocol. Introduces Presenters — a deterministic View layer for AI agents — with action consolidation, cognitive guardrails, structured perception packages, and self-healing errors.',
      'url': 'https://vinkius-labs.github.io/mcp-fusion/',
      'codeRepository': 'https://github.com/vinkius-labs/mcp-fusion',
      'programmingLanguage': 'TypeScript',
      'runtimePlatform': 'Node.js',
      'license': 'https://opensource.org/licenses/Apache-2.0',
      'applicationCategory': 'DeveloperApplication',
      'keywords': [
        'MCP', 'Model Context Protocol', 'MVA', 'Model-View-Agent',
        'AI agents', 'LLM tools', 'TypeScript framework',
        'Presenter pattern', 'action consolidation', 'agentic HATEOAS',
        'cognitive guardrails', 'structured perception', 'self-healing errors',
        'tool routing', 'Zod validation', 'tRPC-style client'
      ],
      'author': {
        '@type': 'Person',
        'name': 'Renato Marinho',
        'url': 'https://github.com/vinkius-labs'
      },
      'publisher': {
        '@type': 'Organization',
        'name': 'Vinkius Labs',
        'url': 'https://github.com/vinkius-labs',
        'logo': 'https://github.com/vinkius-Labs.png'
      },
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD',
        'availability': 'https://schema.org/InStock'
      },
      'operatingSystem': 'Cross-platform',
      'softwareRequirements': 'Node.js >= 18, TypeScript >= 5.7',
      'version': '1.0.0'
    })],

  ],

  transformHead({ pageData }) {
    return getPageHeadTags(pageData.relativePath);
  },

  themeConfig: {
    logo: 'https://github.com/vinkius-Labs.png',
    
    search: {
      provider: 'local'
    },

    nav: [
      { text: 'MVA Architecture', link: '/mva/' },
      { text: 'Documentation', link: '/introduction' },
      { text: 'Examples', link: '/examples' },
      { text: 'API', link: '/api-reference' },
      { text: 'GitHub', link: 'https://github.com/vinkius-labs/mcp-fusion' }
    ],

    sidebar: [
      // ── Getting Started ────────────────────────────────
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Quickstart', link: '/quickstart' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Cookbook & Examples', link: '/examples' },
          { text: 'Migration Guide', link: '/migration' },
        ]
      },

      // ── MVA Architecture ───────────────────────────────
      {
        text: 'MVA Architecture',
        collapsed: false,
        items: [
          { text: 'The MVA Manifesto', link: '/mva-pattern' },
          { text: 'MVA At a Glance', link: '/mva/' },
          { text: 'The Theory Behind MVA', link: '/mva/theory' },
          { text: 'MVA vs MVC', link: '/mva/mva-vs-mvc' },
          { text: 'Without MVA vs With MVA', link: '/comparison' },
          { text: 'Cost & Hallucination', link: '/cost-and-hallucination' },
        ]
      },

      // ── MCP Primitives ─────────────────────────────────
      {
        text: 'Tools',
        collapsed: false,
        items: [
          { text: 'Building Tools', link: '/building-tools' },
          { text: 'Routing & Groups', link: '/routing' },
          { text: 'Tool Exposition', link: '/tool-exposition' },
          { text: 'Error Handling', link: '/error-handling' },
          { text: 'Result Monad', link: '/result-monad' },
        ]
      },
      {
        text: 'Prompts',
        collapsed: false,
        items: [
          { text: 'Prompt Engine', link: '/prompts' },
          { text: 'MVA-Driven Prompts (fromView)', link: '/prompts#mva-driven-prompts-—-fromview' },
          { text: 'PromptRegistry & Routing', link: '/prompts#promptregistry-—-registration-routing' },
          { text: 'Schema-Informed Coercion', link: '/prompts#schema-informed-coercion' },
          { text: 'Server Integration', link: '/prompts#server-integration' },
        ]
      },

      // ── Presenter (MVA View) ───────────────────────────
      {
        text: 'Presenter',
        collapsed: false,
        items: [
          { text: 'Presenter (MVA View)', link: '/presenter' },
          { text: 'Anatomy of the Presenter', link: '/mva/presenter-anatomy' },
          { text: 'Perception Package', link: '/mva/perception-package' },
          { text: 'Agentic Affordances', link: '/mva/affordances' },
          { text: 'Context Tree-Shaking', link: '/mva/context-tree-shaking' },
          { text: 'Cognitive Guardrails', link: '/mva/cognitive-guardrails' },
        ]
      },

      // ── Framework ──────────────────────────────────────
      {
        text: 'Framework',
        collapsed: false,
        items: [
          { text: 'State & Context', link: '/context' },
          { text: 'Middleware', link: '/middleware' },
          { text: 'FusionClient', link: '/fusion-client' },
          { text: 'Dynamic Manifest', link: '/dynamic-manifest' },
          { text: 'Advanced Configuration', link: '/advanced-configuration' },
        ]
      },

      // ── Production ─────────────────────────────────────
      {
        text: 'Production',
        collapsed: false,
        items: [
          { text: 'State Sync', link: '/state-sync' },
          { text: 'Cancellation', link: '/cancellation' },
          { text: 'Runtime Guards', link: '/runtime-guards' },
          { text: 'Observability', link: '/observability' },
          { text: 'Tracing', link: '/tracing' },
          { text: 'Introspection', link: '/introspection' },
          { text: 'Scaling & Optimization', link: '/scaling' },
          { text: 'Performance', link: '/performance' },
          { text: 'Testing', link: '/testing' },
        ]
      },

      // ── Reference ──────────────────────────────────────
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'API Reference', link: '/api-reference' },
          { text: 'Response Helpers', link: '/api-reference#response-helpers' },
          { text: 'Tool Builders', link: '/api-reference#tool-builders' },
          { text: 'Middleware', link: '/api-reference#middleware' },
          { text: 'Streaming Progress', link: '/api-reference#streaming-progress' },
          { text: 'Result Monad', link: '/api-reference#result-monad' },
          { text: 'FusionClient', link: '/api-reference#fusionclient' },
          { text: 'ToolRegistry', link: '/api-reference#toolregistry' },
          { text: 'Observability', link: '/api-reference#observability' },
          { text: 'State Sync', link: '/api-reference#state-sync' },
          { text: 'Prompt Engine', link: '/api-reference#prompt-engine' },
          { text: 'Domain Models', link: '/api-reference#domain-model-classes' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vinkius-labs/mcp-fusion' }
    ]
  }
})
