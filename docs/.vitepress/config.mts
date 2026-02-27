import { defineConfig } from 'vitepress'
import { getPageHeadTags } from './seo'

export default defineConfig({
  title: "MCP Fusion",
  description: "The MVA (Model-View-Agent) framework for building scalable Agentic APIs over the Model Context Protocol.",
  base: '/',
  cleanUrls: true,
  appearance: 'force-dark',

  head: [
    // ── Google Analytics ──
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-346DSQJMFD' }],
    ['script', {}, "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-346DSQJMFD');"],

    // ── Open Graph ──
    ['meta', { property: 'og:title', content: 'mcp-fusion — The MVA Framework for MCP Servers' }],
    ['meta', { property: 'og:description', content: 'A TypeScript framework with a Structured Perception Layer for AI agents. MVA (Model-View-Agent) architecture with Presenters, cognitive guardrails, and structured perception packages.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://mcp-fusion.vinkius.com/' }],
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
      'url': 'https://mcp-fusion.vinkius.com/',
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
        'url': 'https://github.com/renatomarinho'
      },
      'publisher': {
        '@type': 'Organization',
        'name': 'Vinkius Labs',
        'url': 'https://github.com/vinkius-labs',
        'logo': 'https://site-assets.vinkius.com/vk/icon-v-black-min.png'
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
    logo: 'https://site-assets.vinkius.com/vk/icon-v-black-min.png',
    
    search: {
      provider: 'local'
    },

    nav: [
      { text: 'Documentation', link: '/introduction' },
      { text: 'Enterprise', link: '/enterprise-quickstart' },
      { text: 'MVA Architecture', link: '/mva/' },
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
          { text: 'Quickstart — Lightspeed', link: '/quickstart-lightspeed' },
          { text: 'Quickstart — Traditional', link: '/quickstart' },
          { text: 'Enterprise Quickstart', link: '/enterprise-quickstart' },
          { text: 'DX Guide', link: '/dx-guide' },
          { text: 'Migration Guide', link: '/migration' },
        ]
      },

      // ── MVA Architecture ───────────────────────────────
      {
        text: 'MVA Architecture',
        collapsed: true,
        items: [
          { text: 'The MVA Pattern', link: '/mva-pattern' },
          { text: 'MVA At a Glance', link: '/mva/' },
          { text: 'Theory & Axioms', link: '/mva/theory' },
          { text: 'MVA vs MVC', link: '/mva/mva-vs-mvc' },
          { text: 'Comparison', link: '/comparison' },
          { text: 'Architecture Internals', link: '/architecture' },
        ]
      },

      // ── Capability Governance ──────────────────────────
      {
        text: 'Capability Governance',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/governance/' },
          { text: 'Capability Lockfile', link: '/governance/capability-lockfile' },
          { text: 'Surface Integrity', link: '/governance/surface-integrity' },
          { text: 'Contract Diffing', link: '/governance/contract-diffing' },
          { text: 'Zero-Trust Attestation', link: '/governance/zero-trust-attestation' },
          { text: 'Blast Radius Analysis', link: '/governance/blast-radius' },
          { text: 'Token Economics', link: '/governance/token-economics' },
          { text: 'Semantic Probing', link: '/governance/semantic-probe' },
          { text: 'Self-Healing Context', link: '/governance/self-healing' },
          { text: 'CLI Reference', link: '/governance/cli' },
        ]
      },

      // ── Tools & Routing ────────────────────────────────
      {
        text: 'Tools & Routing',
        collapsed: true,
        items: [
          { text: 'Building Tools', link: '/building-tools' },
          { text: 'Routing & Groups', link: '/routing' },
          { text: 'Tool Exposition', link: '/tool-exposition' },
          { text: 'Error Handling', link: '/error-handling' },
          { text: 'Result Monad', link: '/result-monad' },
        ]
      },

      // ── Presenter ──────────────────────────────────────
      {
        text: 'Presenter',
        collapsed: true,
        items: [
          { text: 'Presenter Guide', link: '/presenter' },
          { text: 'Anatomy & Lifecycle', link: '/mva/presenter-anatomy' },
          { text: 'Perception Package', link: '/mva/perception-package' },
          { text: 'Affordances', link: '/mva/affordances' },
          { text: 'Context Tree-Shaking', link: '/mva/context-tree-shaking' },
          { text: 'Cognitive Guardrails', link: '/mva/cognitive-guardrails' },
          { text: 'Select Reflection', link: '/mva/select-reflection' },
          { text: 'Convention', link: '/mva-convention' },
        ]
      },

      // ── Prompts & Resources ────────────────────────────
      {
        text: 'Prompts & Resources',
        collapsed: true,
        items: [
          { text: 'Prompt Engine', link: '/prompts' },
          { text: 'Dynamic Manifest', link: '/dynamic-manifest' },
          { text: 'State Sync', link: '/state-sync' },
        ]
      },

      // ── Framework ──────────────────────────────────────
      {
        text: 'Framework',
        collapsed: true,
        items: [
          { text: 'Context & State', link: '/context' },
          { text: 'Middleware', link: '/middleware' },
          { text: 'FusionClient', link: '/fusion-client' },
          { text: 'Cancellation', link: '/cancellation' },
          { text: 'Runtime Guards', link: '/runtime-guards' },
          { text: 'Advanced Configuration', link: '/advanced-configuration' },
        ]
      },

      // ── Cookbook ────────────────────────────────────────
      {
        text: 'Cookbook',
        collapsed: true,
        items: [
          { text: 'Examples', link: '/examples' },
          { text: 'Cost & Hallucination', link: '/cost-and-hallucination' },
        ]
      },

      // ── Production ─────────────────────────────────────
      {
        text: 'Production',
        collapsed: true,
        items: [
          { text: 'Observability', link: '/observability' },
          { text: 'Tracing', link: '/tracing' },
          { text: 'Introspection', link: '/introspection' },
          { text: 'Performance', link: '/performance' },
          { text: 'Scaling', link: '/scaling' },
        ]
      },

      // ── Enterprise ─────────────────────────────────────
      {
        text: 'Enterprise',
        collapsed: true,
        items: [
          { text: 'Security & Auth', link: '/enterprise/security' },
          { text: 'Observability & Audit', link: '/enterprise/observability' },
          { text: 'Multi-Tenancy', link: '/enterprise/multi-tenancy' },
        ]
      },

      // ── Testing ────────────────────────────────────────
      {
        text: 'Testing',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/testing' },
          { text: 'Quick Start', link: '/testing/quickstart' },
          { text: 'Command-Line Runner', link: '/testing/command-line' },
          { text: 'Fixtures', link: '/testing/fixtures' },
          { text: 'Assertions', link: '/testing/assertions' },
          { text: 'Test Doubles', link: '/testing/test-doubles' },
          { text: 'Egress Firewall', link: '/testing/egress-firewall' },
          { text: 'System Rules', link: '/testing/system-rules' },
          { text: 'UI Blocks', link: '/testing/ui-blocks' },
          { text: 'Middleware Guards', link: '/testing/middleware-guards' },
          { text: 'OOM Guard', link: '/testing/oom-guard' },
          { text: 'Error Handling', link: '/testing/error-handling' },
          { text: 'Raw Response', link: '/testing/raw-response' },
          { text: 'CI/CD Integration', link: '/testing/ci-cd' },
          { text: 'Convention', link: '/testing/convention' },
        ]
      },

      // ── Generators ─────────────────────────────────────
      {
        text: 'Generators',
        collapsed: true,
        items: [
          { text: 'OpenAPI Generator', link: '/openapi-gen' },
          { text: 'Prisma Generator', link: '/prisma-gen' },
          { text: 'n8n Connector', link: '/n8n-connector' },
          { text: 'AWS Connector', link: '/aws-connector' },
          { text: 'OAuth', link: '/oauth' },
        ]
      },

      // ── Adapters ────────────────────────────────────────
      {
        text: 'Adapters',
        collapsed: true,
        items: [
          { text: 'Cloudflare Workers', link: '/cloudflare-adapter' },
          { text: 'Vercel', link: '/vercel-adapter' },
        ]
      },

      // ── Reference ──────────────────────────────────────
      {
        text: 'Reference',
        collapsed: true,
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
