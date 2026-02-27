import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-title-after': () => h('div', { class: 'nav-subtitle' }, [
        h('strong', 'AI-First'),
        ' DX for the Model Context Protocol.'
      ])
    })
  },
  enhanceApp({ app }) {
    // any custom vue components can go here
  }
}
