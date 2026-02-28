import { defineConfig } from 'vitepress'
import { getPageHeadTags, getPageSEO } from './seo'
import typedocSidebar from '../api/typedoc-sidebar.json'

export default defineConfig({
  title: "MCP Fusion",
  description: "The AI-First DX for the Model Context Protocol: building scalable Agentic APIs with the MVA pattern.",
  base: '/',
  cleanUrls: true,
  appearance: 'force-dark',
  sitemap: {
    hostname: 'https://mcp-fusion.vinkius.com'
  },

  head: [
    // ── Logo + title layout fix (in head to beat VitePress scoped styles) ──
    ['style', {}, `
      .VPNavBarTitle .title {
        display: grid !important;
        grid-template-columns: 36px auto !important;
        grid-template-rows: auto auto !important;
        align-items: center !important;
        align-content: center !important;
        gap: 2px 10px !important;
      }
      .VPNavBarTitle .title img,
      .VPNavBarTitle .title .VPImage {
        grid-row: 1 / span 2 !important;
        grid-column: 1 !important;
        height: 36px !important;
        width: 36px !important;
        min-width: 36px !important;
        flex-shrink: 0 !important;
        object-fit: contain !important;
        margin: 0 !important;
      }
      .VPNavBarTitle .title > span {
        grid-column: 2 !important;
        grid-row: 1 !important;
        align-self: end !important;
      }
      .VPNavBarTitle .title .nav-subtitle {
        grid-column: 2 !important;
        grid-row: 2 !important;
        align-self: start !important;
      }
    `],

    // ── Google Analytics ──
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-346DSQJMFD' }],
    ['script', {}, "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-346DSQJMFD');"],

    // ── Favicons ──
    ['link', { rel: 'icon', type: 'image/x-icon', href: 'https://site-assets.vinkius.com/vk/favicon/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: 'https://site-assets.vinkius.com/vk/favicon/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '96x96', href: 'https://site-assets.vinkius.com/vk/favicon/favicon-96x96.png' }],

    // ── PWA & Apple ──
    ['meta', { name: 'theme-color', content: '#000000' }],
    ['meta', { name: 'msapplication-TileColor', content: '#30363D' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'MCP Fusion' }],
    ['meta', { name: 'application-name', content: 'MCP Fusion' }],

    // ── JSON-LD: SoftwareSourceCode ──
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      'name': 'mcp-fusion',
      'alternateName': 'MCP Fusion',
      'description': 'The AI-First DX for the Model Context Protocol. Introduces Presenters — a deterministic View layer for AI agents — with action consolidation, cognitive guardrails, structured perception packages, and self-healing errors.',
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
        'tool routing', 'Zod validation', 'tRPC-style client',
        'Cursor MCP', 'Claude Desktop MCP', 'Claude Code MCP',
        'Windsurf MCP', 'Cline MCP', 'VS Code Copilot MCP',
        'Vercel AI SDK MCP', 'LangChain MCP server', 'LlamaIndex MCP backend',
        'Vercel MCP server', 'Cloudflare Workers MCP', 'AWS Lambda MCP',
        'OpenAPI to MCP', 'Prisma to MCP', 'n8n MCP',
        'mcp-fusion-vercel', 'mcp-fusion-cloudflare', 'mcp-fusion-aws',
        'mcp-fusion-openapi-gen', 'mcp-fusion-prisma-gen', 'mcp-fusion-n8n',
        'mcp-fusion-oauth', 'mcp-fusion-testing',
        'MCP server framework', 'build MCP server', 'MCP tool builder'
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

  transformPageData(pageData) {
    const seo = getPageSEO(pageData.relativePath);
    if (seo) {
      pageData.title = seo.title;
      pageData.titleTemplate = ':title';
      pageData.description = seo.description;
    }
  },

  transformHead({ pageData }) {
    return getPageHeadTags(pageData);
  },

  themeConfig: {
    logo: { src: 'https://site-assets.vinkius.com/vk/icon-v-black-min.png', width: 36, height: 36 },
    
    search: {
      provider: 'local'
    },

    nav: [
      { text: 'Create MCP-Server Now', link: '/quickstart-lightspeed' },
      { text: 'API Reference', link: '/api/' },
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
          { text: 'Client Integrations', link: '/client-integrations' },
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
          { text: 'Sandbox Engine', link: '/sandbox' },
          { text: 'DLP Redaction — GDPR', link: '/dlp-redaction' },
          { text: 'FSM State Gate', link: '/fsm-state-gate' },
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
              { text: 'Transactional Workflows', link: '/cookbook/transactional-workflows' },
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

      // ── Common Issues ───────────────────────────────────
      {
        text: 'Common Issues',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/common-issues/' },
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
