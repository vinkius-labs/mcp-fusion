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
    ['meta', { property: 'og:description', content: 'The first framework where AI agents perceive, understand, and act on your data — not guess. MVA (Model-View-Agent) architecture with Presenters, cognitive guardrails, and structured perception packages.' }],
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
      {
        text: 'Foundation',
        collapsed: false,
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'The MVA Manifesto', link: '/mva-pattern' },
          { text: 'Without MVA vs With MVA', link: '/comparison' },
          { text: 'Cost & Hallucination', link: '/cost-and-hallucination' },
          { text: 'Quickstart', link: '/quickstart' },
          { text: 'Cookbook & Examples', link: '/examples' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Migration Guide', link: '/migration' },
        ]
      },
      {
        text: 'MVA Architecture',
        collapsed: false,
        items: [
          { text: 'MVA At a Glance', link: '/mva/' },
          { text: 'The Theory Behind MVA', link: '/mva/theory' },
          { text: 'MVA vs MVC', link: '/mva/mva-vs-mvc' },
          { text: 'Anatomy of the Presenter', link: '/mva/presenter-anatomy' },
          { text: 'Perception Package', link: '/mva/perception-package' },
          { text: 'Agentic Affordances', link: '/mva/affordances' },
          { text: 'Context Tree-Shaking', link: '/mva/context-tree-shaking' },
          { text: 'Cognitive Guardrails', link: '/mva/cognitive-guardrails' },
        ]
      },
      {
        text: 'Core Concepts',
        collapsed: false,
        items: [
          { text: 'Building Tools', link: '/building-tools' },
          { text: 'Presenter (MVA View)', link: '/presenter' },
          { text: 'Routing & Groups', link: '/routing' },
          { text: 'State & Context', link: '/context' },
          { text: 'Error Handling', link: '/error-handling' },
          { text: 'Result Monad', link: '/result-monad' },
        ]
      },
      {
        text: 'Advanced Guides',
        collapsed: false,
        items: [
          { text: 'Middleware', link: '/middleware' },
          { text: 'FusionClient', link: '/fusion-client' },
          { text: 'State Sync', link: '/state-sync' },
          { text: 'Observability', link: '/observability' },
          { text: 'Scaling & Optimization', link: '/scaling' },
          { text: 'Performance', link: '/performance' },
          { text: 'Advanced Configuration', link: '/advanced-configuration' },
          { text: 'Introspection', link: '/introspection' },
          { text: 'Dynamic Manifest', link: '/dynamic-manifest' },
          { text: 'Testing', link: '/testing' },
        ]
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'API Reference', link: '/api-reference' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vinkius-labs/mcp-fusion' }
    ]
  }
})
