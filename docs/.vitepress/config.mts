import { defineConfig } from 'vitepress'
import { getPageHeadTags } from './seo'
import typedocSidebar from '../api/typedoc-sidebar.json'

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
      { text: 'API', link: '/api/' },
      {
        text: '⭐ Star on GitHub',
        link: 'https://github.com/vinkius-labs/mcp-fusion'
      }
    ],

    sidebar: [
      // ── Getting Started ────────────────────────────────
      {
        text: 'Get Started',
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
        text: 'Tool Building',
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
        text: 'View Layer',
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
        text: 'Prompt Engine',
        collapsed: true,
        items: [
          { text: 'Prompt Engine', link: '/prompts' },
          { text: 'Dynamic Manifest', link: '/dynamic-manifest' },
          { text: 'State Sync', link: '/state-sync' },
        ]
      },

      // ── Framework ──────────────────────────────────────
      {
        text: 'Core Framework',
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

      // ── Code Recipes ──────────────────────────────────
      {
        text: 'Code Recipes',
        collapsed: true,
        items: [
          { text: 'Cost & Hallucination', link: '/cost-and-hallucination' },
          {
            text: 'Getting Started',
            collapsed: true,
            items: [
              { text: 'CRUD Operations', link: '/cookbook/crud' },
              { text: 'Request Lifecycle', link: '/cookbook/request-lifecycle' },
              { text: 'HMR Dev Server', link: '/cookbook/hmr-dev-server' },
              { text: 'Production Server', link: '/cookbook/production-server' },
            ]
          },
          {
            text: 'Presenter & MVA',
            collapsed: true,
            items: [
              { text: 'MVA Presenter', link: '/cookbook/mva-presenter' },
              { text: 'Presenter Composition', link: '/cookbook/presenter-composition' },
              { text: 'Custom Responses', link: '/cookbook/custom-responses' },
              { text: 'Context-Aware Rules', link: '/cookbook/context-aware-rules' },
              { text: 'Context Tree-Shaking', link: '/cookbook/context-tree-shaking' },
              { text: 'Select Reflection', link: '/cookbook/select-reflection' },
              { text: 'Agentic Affordances', link: '/cookbook/agentic-affordances' },
              { text: 'Cognitive Guardrails', link: '/cookbook/cognitive-guardrails' },
            ]
          },
          {
            text: 'Tool Building',
            collapsed: true,
            items: [
              { text: 'Hierarchical Groups', link: '/cookbook/hierarchical-groups' },
              { text: 'Functional Groups', link: '/cookbook/functional-groups' },
              { text: 'Tool Exposition', link: '/cookbook/tool-exposition' },
              { text: 'Error Handling', link: '/cookbook/error-handling' },
              { text: 'Result Monad', link: '/cookbook/result-monad' },
              { text: 'Streaming', link: '/cookbook/streaming' },
              { text: 'Cancellation', link: '/cookbook/cancellation' },
              { text: 'Auth Middleware', link: '/cookbook/auth-middleware' },
              { text: 'Prompts', link: '/cookbook/prompts' },
              { text: 'Runtime Guards', link: '/cookbook/runtime-guards' },
              { text: 'Self-Healing Context', link: '/cookbook/self-healing-context' },
              { text: 'TOON Encoding', link: '/cookbook/toon' },
            ]
          },
          {
            text: 'Governance',
            collapsed: true,
            items: [
              { text: 'Capability Lockfile', link: '/cookbook/capability-lockfile' },
              { text: 'Contract Diffing', link: '/cookbook/contract-diffing' },
              { text: 'Blast Radius', link: '/cookbook/blast-radius' },
              { text: 'Token Economics', link: '/cookbook/token-economics' },
              { text: 'Semantic Probe', link: '/cookbook/semantic-probe' },
              { text: 'Zero-Trust Attestation', link: '/cookbook/zero-trust-attestation' },
            ]
          },
          {
            text: 'Production',
            collapsed: true,
            items: [
              { text: 'Observability', link: '/cookbook/observability' },
              { text: 'Tracing', link: '/cookbook/tracing' },
              { text: 'Introspection', link: '/cookbook/introspection' },
              { text: 'State Sync', link: '/cookbook/state-sync' },
              { text: 'Testing', link: '/cookbook/testing' },
            ]
          },
        ]
      },

      // ── Production ─────────────────────────────────────
      {
        text: 'Production Ops',
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
        text: 'Enterprise Ready',
        collapsed: true,
        items: [
          { text: 'Security & Auth', link: '/enterprise/security' },
          { text: 'Observability & Audit', link: '/enterprise/observability' },
          { text: 'Multi-Tenancy', link: '/enterprise/multi-tenancy' },
        ]
      },

      // ── Testing ────────────────────────────────────────
      {
        text: 'Test Suite',
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
        text: 'Data Connectors',
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
        text: 'Deploy Targets',
        collapsed: true,
        items: [
          { text: 'Cloudflare Workers', link: '/cloudflare-adapter' },
          { text: 'Vercel', link: '/vercel-adapter' },
        ]
      },

      // ── API Reference (auto-generated by TypeDoc) ─────
      {
        text: 'API Reference',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/api/' },
          ...typedocSidebar,
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vinkius-labs/mcp-fusion' }
    ]
  }
})
