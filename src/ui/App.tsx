import { useState, useEffect } from 'react'

interface ComponentNode {
  id: string
  name: string
  type: 'COMPONENT' | 'COMPONENT_SET'
}

type PluginMessage =
  | { type: 'COMPONENTS_LOADED'; components: ComponentNode[] }

export default function App() {
  const [components, setComponents] = useState<ComponentNode[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined
      if (!msg) return

      if (msg.type === 'COMPONENTS_LOADED') {
        setComponents(msg.components)
        setLoaded(true)
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none">
      <header className="px-4 pt-4 pb-3 border-b border-zinc-800 flex-shrink-0">
        <h1 className="text-sm font-semibold text-zinc-100 tracking-tight leading-none">
          Nomenclate
        </h1>
        <p className="text-xs text-zinc-500 mt-1 leading-none">Naming convention auditor</p>
      </header>

      <main className="flex-1 overflow-y-auto">
        {!loaded && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-zinc-600">Scanning page&hellip;</p>
          </div>
        )}

        {loaded && components.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-1 px-6 text-center">
            <p className="text-xs font-medium text-zinc-400">No components found</p>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Open a file with components or component sets to get started.
            </p>
          </div>
        )}

        {loaded && components.length > 0 && (
          <ul>
            {components.map((component) => (
              <li
                key={component.id}
                className="flex items-center justify-between px-4 py-2.5 gap-3 border-b border-zinc-800/50 hover:bg-zinc-900/60 transition-colors"
              >
                <span className="text-xs text-zinc-200 font-mono truncate leading-none">
                  {component.name}
                </span>
                <TypeBadge type={component.type} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {loaded && components.length > 0 && (
        <footer className="px-4 py-2 border-t border-zinc-800 flex-shrink-0">
          <p className="text-[10px] text-zinc-600 leading-none">
            {components.length} {components.length === 1 ? 'component' : 'components'} on this page
          </p>
        </footer>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: 'COMPONENT' | 'COMPONENT_SET' }) {
  if (type === 'COMPONENT_SET') {
    return (
      <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wide uppercase bg-violet-950/70 text-violet-400 border border-violet-800/40 leading-none">
        Set
      </span>
    )
  }
  return (
    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wide uppercase bg-zinc-800/60 text-zinc-500 border border-zinc-700/40 leading-none">
      Component
    </span>
  )
}
