// Node-level CSS stub for tests (X-10). Packages loaded outside Vite (for example
// `payload-markdown/server` and `@payloadcms/ui`) import CSS files as side effects; Node
// cannot load them, so they resolve to an empty module.
//
// Node 24 runs this as a synchronous hook (module.registerHooks). Node 22's synchronous hooks
// break CommonJS `require` inside packages such as next/navigation ("Cannot read properties of
// undefined (reading 'exports')"), so there it uses an off-thread ESM loader (module.register),
// which only sees `import`, and the CSS side effects are always ESM imports.
import * as nodeModule from 'node:module'

const CSS_PATTERN = /\.(css|scss)(\?.*)?$/
const [major] = process.versions.node.split('.').map(Number)

if (major >= 24 && typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    load(url, context, nextLoad) {
      if (CSS_PATTERN.test(url)) {
        return { format: 'module', shortCircuit: true, source: 'export default {}' }
      }

      return nextLoad(url, context)
    },
  })
} else {
  const loader = `
    export async function load(url, context, nextLoad) {
      if (${CSS_PATTERN}.test(url)) {
        return { format: 'module', shortCircuit: true, source: 'export default {}' }
      }
      return nextLoad(url, context)
    }
  `

  nodeModule.register(`data:text/javascript,${encodeURIComponent(loader)}`)
}
