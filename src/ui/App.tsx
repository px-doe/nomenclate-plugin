import { useState, useEffect } from 'react'

interface ComponentNode {
  id: string
  name: string
  type: 'COMPONENT' | 'COMPONENT_SET'
  pluginStatus: string
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
  | { type: 'COMPONENTS_LOADED'; components: ComponentNode[]; total: number }
  | { type: 'SELECTION_ERROR'; message: string }
  | { type: 'AUDIT_RESULT'; results: AuditResult[] }
  | { type: 'AUDIT_ERROR'; message: string }
  | { type: 'RENAME_RESULT'; applied: number; failed: string[]; succeededIds: string[] }

const CONVENTION_OPTIONS: { value: Convention; label: string; available: boolean }[] = [
  { value: 'tailwind', label: 'Tailwind CSS', available: true },
  { value: 'material3', label: 'Material Design 3', available: false },
  { value: 'atlassian', label: 'Atlassian', available: false },
  { value: 'polaris', label: 'Polaris', available: false },
  { value: 'atomic', label: 'Atomic Design', available: false },
]

export default function App() {
  const [components, setComponents] = useState<ComponentNode[]>([])
  const [totalComponents, setTotalComponents] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [convention, setConvention] = useState<Convention>('tailwind')
  const [view, setView] = useState<View>('list')
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditResults, setAuditResults] = useState<AuditResult[]>([])
  const [auditError, setAuditError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [editedNames, setEditedNames] = useState<Record<string, string>>({})
  const [renameResult, setRenameResult] = useState<{ applied: number; failed: string[] } | null>(null)

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined
      if (!msg) return

      if (msg.type === 'COMPONENTS_LOADED') {
        setComponents(msg.components)
        setTotalComponents(msg.total)
        setLoaded(true)
      } else if (msg.type === 'SELECTION_ERROR') {
        setSelectionError(msg.message)
        setLoaded(true)
      } else if (msg.type === 'AUDIT_RESULT') {
        const results = msg.results
        const initialChecked: Record<string, boolean> = {}
        const initialNames: Record<string, string> = {}
        for (const r of results) {
          if (r.status !== 'conform') {
            initialChecked[r.id] = true
            initialNames[r.id] = r.suggestedName ?? r.currentName
          }
        }
        setChecked(initialChecked)
        setEditedNames(initialNames)
        setAuditResults(results)
        setIsAuditing(false)
        setView('results')
      } else if (msg.type === 'AUDIT_ERROR') {
        setAuditError(msg.message)
        setIsAuditing(false)
      } else if (msg.type === 'RENAME_RESULT') {
        setRenameResult({ applied: msg.applied, failed: msg.failed })
        if (msg.succeededIds.length > 0) {
          const succeeded = new Set(msg.succeededIds)
          setComponents((prev) =>
            prev.map((c) => succeeded.has(c.id) ? { ...c, pluginStatus: 'renamed' } : c)
          )
        }
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
    setRenameResult(null)
    setChecked({})
    setEditedNames({})
  }

  const handleApplySelected = () => {
    const renames = auditResults
      .filter((r) => r.status !== 'conform' && checked[r.id])
      .map((r) => ({ id: r.id, newName: editedNames[r.id] ?? r.suggestedName ?? r.currentName }))
    parent.postMessage({ pluginMessage: { type: 'apply-rename', renames } }, '*')
  }

  const handleSelectRemaining = () => {
    const renamedIds = new Set(components.filter((c) => c.pluginStatus === 'renamed').map((c) => c.id))
    const ids = auditResults
      .filter((r) => r.status !== 'conform' && !renamedIds.has(r.id))
      .map((r) => r.id)
    parent.postMessage({ pluginMessage: { type: 'select-remaining', ids } }, '*')
  }

  const handleApplyAll = () => {
    const newChecked = { ...checked }
    const renames: { id: string; newName: string }[] = []
    for (const r of auditResults) {
      if (r.status !== 'conform' && r.suggestedName) {
        newChecked[r.id] = true
        renames.push({ id: r.id, newName: editedNames[r.id] ?? r.suggestedName })
      }
    }
    setChecked(newChecked)
    parent.postMessage({ pluginMessage: { type: 'apply-rename', renames } }, '*')
  }

  const isCapped = totalComponents > components.length
  const hasRenameTargets = auditResults.some((r) => r.status !== 'conform')
  const selectedCount = Object.values(checked).filter(Boolean).length

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
            <p className="text-xs text-zinc-600">Reading selection&hellip;</p>
          </div>
        )}

        {loaded && (selectionError !== null || components.length === 0) && (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-xs font-medium text-zinc-400">
              {selectionError ?? 'No components in selection'}
            </p>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Select components or component sets on the canvas and reopen the plugin.
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
                  Auditing {components.length} of {totalComponents} selected (limit)
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
              {components.map((component) => {
                const isRenamed = component.pluginStatus === 'renamed'
                return (
                  <li
                    key={component.id}
                    className={`flex items-center justify-between px-4 py-2.5 gap-3 border-b border-zinc-800/50 hover:bg-zinc-900/60 transition-colors${isRenamed ? ' opacity-40' : ''}`}
                  >
                    <span className="text-xs text-zinc-200 font-mono truncate leading-none">
                      {component.name}
                    </span>
                    {isRenamed ? <RenamedBadge /> : <TypeBadge type={component.type} />}
                  </li>
                )
              })}
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
                  Audited {components.length} of {totalComponents} selected (limit)
                </p>
              )}
            </div>

            <ul className="flex-1 overflow-y-auto">
              {auditResults.map((result) => (
                <AuditResultItem
                  key={result.id}
                  result={result}
                  pluginStatus={components.find((c) => c.id === result.id)?.pluginStatus ?? ''}
                  checked={checked[result.id]}
                  editedName={editedNames[result.id]}
                  onCheckChange={(val) => setChecked((prev) => ({ ...prev, [result.id]: val }))}
                  onNameChange={(val) => setEditedNames((prev) => ({ ...prev, [result.id]: val }))}
                />
              ))}
            </ul>

            {hasRenameTargets && (
              <div className="flex-shrink-0 px-4 py-3 border-t border-zinc-800 flex flex-col gap-2">
                {renameResult && (
                  <p className="text-[10px] text-zinc-400 leading-tight">
                    {renameResult.applied} renamed
                    {renameResult.failed.length > 0 && (
                      <>, {renameResult.failed.length} failed: <span className="font-mono">{renameResult.failed.join(', ')}</span></>
                    )}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleApplySelected}
                    disabled={selectedCount === 0}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Apply selected ({selectedCount})
                  </button>
                  <button
                    onClick={handleApplyAll}
                    className="flex-1 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold py-2 rounded transition-colors"
                  >
                    Apply all
                  </button>
                </div>
                <button
                  onClick={handleSelectRemaining}
                  className="w-full text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded py-1.5 transition-colors"
                >
                  Select remaining in Figma
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {loaded && components.length > 0 && view === 'list' && (
        <footer className="px-4 py-2 border-t border-zinc-800 flex-shrink-0">
          <p className="text-[10px] text-zinc-600 leading-none">
            {components.length} {components.length === 1 ? 'component' : 'components'} selected
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

function AuditResultItem({
  result,
  pluginStatus,
  checked,
  editedName,
  onCheckChange,
  onNameChange,
}: {
  result: AuditResult
  pluginStatus: string
  checked?: boolean
  editedName?: string
  onCheckChange: (val: boolean) => void
  onNameChange: (val: string) => void
}) {
  const isIssue = result.status === 'non-conform' || result.status === 'ambiguous'
  const isRenamed = pluginStatus === 'renamed'

  return (
    <li className={`px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-900/60 transition-colors${isRenamed ? ' opacity-40' : ''}`}>
      <div className="flex items-start gap-2.5">
        {isIssue && !isRenamed ? (
          <input
            type="checkbox"
            checked={checked ?? false}
            onChange={(e) => onCheckChange(e.target.checked)}
            className="mt-0.5 flex-shrink-0 accent-zinc-400 cursor-pointer"
          />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs text-zinc-200 font-mono truncate leading-none">
              {result.currentName}
            </span>
            {isRenamed ? <RenamedBadge /> : <StatusBadge status={result.status} />}
          </div>
          {isIssue && !isRenamed && result.suggestedName && (
            <input
              type="text"
              value={editedName ?? result.suggestedName}
              onChange={(e) => onNameChange(e.target.value)}
              className="text-xs text-zinc-300 font-mono bg-zinc-800/60 border border-zinc-700/40 rounded px-2 py-1 focus:outline-none focus:border-zinc-500 w-full select-text"
            />
          )}
          <span className="text-[10px] text-zinc-600 leading-snug">
            {result.justification}
          </span>
        </div>
      </div>
    </li>
  )
}

function RenamedBadge() {
  return (
    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded tracking-wide uppercase bg-zinc-800/60 text-zinc-500 border border-zinc-700/40 leading-none">
      Renamed
    </span>
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
