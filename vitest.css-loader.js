// Node-level CSS stub for tests (X-10). Packages loaded outside Vite (for example
// `@valkyrianlabs/payload-markdown/server` and `@payloadcms/ui`) import CSS files as
// side effects; Node cannot load them, so they resolve to an empty module.
import { registerHooks } from 'node:module'

registerHooks({
  load(url, context, nextLoad) {
    if (/\.(css|scss)(\?.*)?$/.test(url)) {
      return { format: 'module', shortCircuit: true, source: 'export default {}' }
    }

    return nextLoad(url, context)
  },
})
