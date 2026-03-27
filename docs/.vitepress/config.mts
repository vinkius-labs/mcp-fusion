import { defineConfig } from 'vitepress'
import { getPageHeadTags, getPageSEO } from './seo'
import typedocSidebar from '../api/typedoc-sidebar.json'

export default defineConfig({
  title: "Vurb.ts",
  description: "The AI-First DX for the Model Context Protocol: building scalable Agentic APIs with the MVA pattern.",
  base: '/',
  cleanUrls: true,
  appearance: 'force-dark',
  sitemap: {
    hostname: 'https://mcp-fusion.vinkius.com'
  },

  head: [
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
    ['meta', { name: 'apple-mobile-web-app-title', content: 'Vurb.ts' }],
    ['meta', { name: 'application-name', content: 'Vurb.ts' }],

    // ── JSON-LD: SoftwareSourceCode ──
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      'name': 'vurb-ts',
      'alternateName': 'Vurb.ts',
      'description': 'The AI-First DX for the Model Context Protocol. Introduces Presenters — a deterministic View layer for AI agents — with action consolidation, cognitive guardrails, structured perception packages, and self-healing errors.',
      'url': 'https://mcp-fusion.vinkius.com/',
      'codeRepository': 'https://github.com/vinkius-labs/vurb.ts',
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
        'mcp-fusion-oauth', 'mcp-fusion-jwt', 'mcp-fusion-api-key', 'mcp-fusion-testing',
        'MCP server framework', 'build MCP server', 'MCP tool builder',
        'MCP resource subscriptions', 'real-time AI agent notifications',
        'MCP resources', 'subscribable resources', 'push notifications MCP'
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
    logo: { src: 'https://site-assets.vinkius.com/vk/vurb-logo.png', width: 160, height: 36 },
    siteTitle: false,
    
    search: {
      provider: 'local'
    },

    nav: [
      { text: 'Create MCP-Server Now', link: '/quickstart-lightspeed' },
      { text: 'Deploy MCP Servers', link: 'https://vinkius.com' },
      { text: 'Blog', link: '/blog/' },
    ],

    sidebar: [
      // ── 1. GET STARTED ──────────────────────────────────
      {
        text: 'Get Started',
        collapsed: false,
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Quickstart', link: '/quickstart-lightspeed' },
          { text: 'Client Integrations', link: '/client-integrations' },
          { text: 'CLI Reference', link: '/governance/cli' },
        ]
      },

      // ── 2. CORE CONCEPTS ────────────────────────────────
      {
        text: 'Core Concepts',
        collapsed: false,
        items: [
          { text: 'MVA Pattern', link: '/mva-pattern' },
          { text: 'Building Tools', link: '/building-tools' },
          { text: 'Presenter', link: '/presenter' },
          { text: 'Middleware', link: '/middleware' },
          { text: 'Routing & Groups', link: '/routing' },
          { text: 'Error Handling', link: '/error-handling' },
        ]
      },

      // ── 3. FEATURES ─────────────────────────────────────
      {
        text: 'Features',
        collapsed: true,
        items: [
          { text: 'Agent Skills', link: '/skills' },
          { text: 'Prompts & Resources', link: '/prompts' },
          { text: 'State Sync', link: '/state-sync' },
          { text: 'DLP & Redaction', link: '/dlp-redaction' },
          { text: 'Sandbox Engine', link: '/sandbox' },
          { text: 'Testing', link: '/testing' },
        ]
      },

      // ── 4. DEPLOY & INTEGRATE ───────────────────────────
      {
        text: 'Deploy & Integrate',
        collapsed: true,
        items: [
          { text: 'Vinkius Cloud', link: '/cookbook/production-server' },
          { text: 'Vercel', link: '/vercel-adapter' },
          { text: 'Cloudflare Workers', link: '/cloudflare-adapter' },
          { text: 'AWS Lambda', link: '/aws-connector' },
          { text: 'Generators', link: '/openapi-gen' },
        ]
      },

      // ── 5. SECURITY ─────────────────────────────────────
      {
        text: 'Security',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/security/' },
          { text: 'Authentication', link: '/oauth' },
          { text: 'Credentials (BYOC)', link: '/credentials' },
          { text: 'Governance & Lockfile', link: '/governance/' },
          { text: 'Runtime Guards', link: '/runtime-guards' },
        ]
      },

      // ── API Reference (auto-generated by TypeDoc) ──────
      {
        text: 'API Reference',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/api/' },
          ...typedocSidebar,
        ]
      },

      // ── Blog ───────────────────────────────────────────
      {
        text: 'Blog',
        collapsed: true,
        items: [
          { text: 'All Posts', link: '/blog/' },
          { text: 'Introducing Vurb.ts', link: '/blog/posts/introducing-vurb-ts' },
          { text: 'Anatomy of an AI Platform Breach', link: '/blog/posts/anatomy-of-an-ai-platform-breach' },
          { text: 'MVA Pattern Deep Dive', link: '/blog/posts/mva-pattern-deep-dive' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vinkius-labs/vurb.ts' }
    ]
  }
})
