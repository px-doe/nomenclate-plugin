import { useState, useEffect } from 'react'

interface ComponentNode {
  id: string
  name: string
  type: 'COMPONENT' | 'COMPONENT_SET'
}

interface AuditResult {
  id: string
  currentName: string
  status: 'conform' | 'non-conform' | 'ambiguous'
  suggestedName?: string
  justification: string
}

type Convention = 'tailwind' | 'material3' | 'atlassian' | 'polaris' | 'atomic'
type View = 'list' | 'results'

type PluginMessage =
  | { type: 'COMPONENTS_LOADED'; components: ComponentNode[] }
  | { type: 'AUDIT_RESULT'; results: AuditResult[] }
  | { type: 'AUDIT_ERROR'; message: string }

const CONVENTION_OPTIONS: { value: Convention; label: string; available: boolean }[] = [
  { value: 'tailwind', label: 'Tailwind CSS', available: true },
  { value: 'material3', label: 'Material Design 3', available: false },
  { value: 'atlassian', label: 'Atlassian', available: false },
  { value: 'polaris', label: 'Polaris', available: false },
  { value: 'atomic', label: 'Atomic Design', available: false },
]

const MAX_AUDIT = 50

export default function App() {
  const [components, setComponents] = useState<ComponentNode[]>([])
  const [loaded, setLoaded] = useState(false)
  const [convention, setConvention] = useState<Convention>('tailwind')
  const [view, setView] = useState<View>('list')
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditResults, setAuditResults] = useState<AuditResult[]>([])
  const [auditError, setAuditError] = useState<string | null>(null)

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined
      if (!msg) return

      if (msg.type === 'COMPONENTS_LOADED') {
        setComponents(msg.components)
        setLoaded(true)
      } else if (msg.type === 'AUDIT_RESULT') {
        setAuditResults(msg.results)
        setIsAuditing(false)
        setView('results')
      } else if (msg.type === 'AUDIT_ERROR') {
        setAuditError(msg.message)
        setIsAuditing(false)
      }
    }
  }, [])

  const handleAudit = () => {
    setIsAuditing(true)
    setAuditError(null)
    parent.postMessage(
      { pluginMessage: { type: 'AUDIT', convention, components } },
      '*'
    )
  }

  const handleBack = () => {
    setView('list')
    setAuditResults([])
    setAuditError(null)
  }

  const isCapped = components.length > MAX_AUDIT

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none">
      <header className="px-4 pt-4 pb-3 border-b border-zinc-800 flex-shrink-0">
        <h1 className="text-sm font-semibold text-zinc-100 tracking-tight leading-none">
          Nomenclate
        </h1>
        <p className="text-xs text-zinc-500 mt-1 leading-none">Naming convention auditor</p>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {!loaded && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-zinc-600">Scanning page&hellip;</p>
          </div>
        )}

        {loaded && components.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-xs font-medium text-zinc-400">No components found</p>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Open a file with components or component sets to get started.
            </p>
          </div>
        )}

        {loaded && components.length > 0 && view === 'list' && (
          <>
            <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-zinc-800 flex flex-col gap-2">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider leading-none">
                Naming Convention
              </label>
              <div className="relative">
                <select
                  value={convention}
                  disabled={isAuditing}
                  onChange={(e) => setConvention(e.target.value as Convention)}
                  className="w-full appearance-none bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 px-3 py-2 pr-8 focus:outline-none focus:border-zinc-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {CONVENTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={!opt.available}>
                      {opt.label}{!opt.available ? ' — Coming soon' : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                  <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {isCapped && (
                <p className="text-[10px] text-amber-500 leading-tight">
                  Auditing {MAX_AUDIT} out of {components.length} components (limit)
                </p>
              )}

              {auditError && (
                <div className="bg-red-950/40 border border-red-800/50 rounded px-3 py-2">
                  <p className="text-[10px] text-red-400 leading-relaxed break-words">{auditError}</p>
                </div>
              )}

              <button
                onClick={handleAudit}
                disabled={isAuditing || components.length === 0}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAuditing ? (
                  <>
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Auditing&hellip;
                  </>
                ) : 'Audit naming'}
              </button>
            </div>

            <ul className="flex-1 overflow-y-auto">
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
          </>
        )}

        {view === 'results' && (
          <>
            <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-zinc-800 flex flex-col gap-2">
              <button
                onClick={handleBack}
                className="self-start text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <AuditSummary results={auditResults} />
              {isCapped && (
                <p className="text-[10px] text-amber-500 leading-tight">
                  Audited {MAX_AUDIT} out of {components.length} components (limit)
                </p>
              )}
            </div>

            <ul className="flex-1 overflow-y-auto">
              {auditResults.map((result) => (
                <AuditResultItem key={result.id} result={result} />
              ))}
            </ul>
          </>
        )}
      </main>

      {loaded && components.length > 0 && view === 'list' && (
        <footer className="px-4 py-2 border-t border-zinc-800 flex-shrink-0">
          <p className="text-[10px] text-zinc-600 leading-none">
            {components.length} {components.length === 1 ? 'component' : 'components'} on this page
          </p>
        </footer>
      )}
    </div>
  )
}

function AuditSummary({ results }: { results: AuditResult[] }) {
  const conform = results.filter((r) => r.status === 'conform').length
  const nonConform = results.filter((r) => r.status === 'non-conform').length
  const ambiguous = results.filter((r) => r.status === 'ambiguous').length

  return (
    <p className="text-[10px] text-zinc-500 leading-relaxed">
      <span className="text-green-400 font-medium">{conform} conform</span>
      {' · '}
      <span className="text-red-400 font-medium">{nonConform} non-conform</span>
      {' · '}
      <span className="text-amber-400 font-medium">{ambiguous} ambiguous</span>
      {' out of '}{results.length} {results.length === 1 ? 'component' : 'components'}
    </p>
  )
}

function AuditResultItem({ result }: { result: AuditResult }) {
  const isIssue = result.status === 'non-conform' || result.status === 'ambiguous'

  return (
    <li className="px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-900/60 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="text-xs text-zinc-200 font-mono truncate leading-none">
            {result.currentName}
          </span>
          {isIssue && result.suggestedName && (
            <span className="text-xs text-zinc-500 font-mono truncate leading-none">
              &rarr; {result.suggestedName}
            </span>
          )}
          <span className="text-[10px] text-zinc-600 leading-snug mt-0.5">
            {result.justification}
          </span>
        </div>
        <StatusBadge status={result.status} />
      </div>
    </li>
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

function StatusBadge({ status }: { status: AuditResult['status'] }) {
  if (status === 'conform') {
    return (
      <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wide uppercase bg-green-950/70 text-green-400 border border-green-800/40 leading-none">
        Conform
      </span>
    )
  }
  if (status === 'non-conform') {
    return (
      <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wide uppercase bg-red-950/70 text-red-400 border border-red-800/40 leading-none">
        Non-conform
      </span>
    )
  }
  return (
    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wide uppercase bg-amber-950/70 text-amber-400 border border-amber-800/40 leading-none">
      Ambiguous
    </span>
  )
}
