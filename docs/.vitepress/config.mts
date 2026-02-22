import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "MCP Fusion",
  description: "The MVA (Model-View-Agent) framework for building scalable Agentic APIs over the Model Context Protocol.",
  base: '/mcp-fusion/',
  cleanUrls: true,
  appearance: 'force-dark',
  themeConfig: {
    logo: 'https://github.com/vinkius-Labs.png',
    
    search: {
      provider: 'local'
    },

    nav: [
      { text: 'The MVA Manifesto', link: '/mva-pattern' },
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
          { text: 'Quickstart', link: '/quickstart' },
          { text: 'Cookbook & Examples', link: '/examples' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Migration Guide', link: '/migration' },
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
          { text: 'Advanced Configuration', link: '/advanced-configuration' },
          { text: 'Introspection', link: '/introspection' },
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
