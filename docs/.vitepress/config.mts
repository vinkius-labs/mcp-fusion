import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "MCP Fusion",
  description: "Advanced structured framework for the Model Context Protocol.",
  base: '/mcp-fusion/',
  cleanUrls: true,
  appearance: 'force-dark',
  themeConfig: {
    logo: 'https://github.com/vinkius-Labs.png',
    
    search: {
      provider: 'local'
    },

    nav: [
      { text: 'Documentation', link: '/introduction' },
      { text: 'API', link: '/api-reference' },
      { text: 'GitHub', link: 'https://github.com/vinkius-labs/mcp-fusion' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Quickstart', link: '/quickstart' },
          { text: 'Migration Guide', link: '/migration' },
        ]
      },
      {
        text: 'Core Concepts',
        collapsed: false,
        items: [
          { text: 'Building Tools', link: '/building-tools' },
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
          { text: 'Advanced Configuration', link: '/advanced-configuration' },
          { text: 'Scaling & Optimization', link: '/scaling' },
          { text: 'Introspection', link: '/introspection' },
          { text: 'Architecture', link: '/architecture' },
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
