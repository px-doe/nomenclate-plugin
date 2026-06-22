import { useState, useEffect, useRef } from 'react'

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
  | { type: 'AUDIT_RESULT'; results: AuditResult[] }
  | { type: 'AUDIT_ERROR'; message: string }
  | { type: 'RENAME_RESULT'; applied: number; failed: string[]; succeededIds: string[] }
  | { type: 'SELECTION_CHANGED' }

interface GroupedItem {
  node: ComponentNode
  result?: AuditResult
}

type Group =
  | { kind: 'set'; header: GroupedItem; children: GroupedItem[] }
  | { kind: 'standalone'; item: GroupedItem }

const CONVENTION_OPTIONS: { value: Convention; label: string; available: boolean }[] = [
  { value: 'tailwind', label: 'Tailwind', available: true },
  { value: 'material3', label: 'Material 3', available: false },
  { value: 'atlassian', label: 'Atlassian', available: false },
  { value: 'polaris', label: 'Polaris', available: false },
  { value: 'atomic', label: 'Atomic', available: false },
]

function buildGroups(components: ComponentNode[], results: AuditResult[]): Group[] {
  const resultMap = new Map(results.map((r) => [r.id, r]))
  const groups: Group[] = []
  let i = 0
  while (i < components.length) {
    const node = components[i]
    if (node.type === 'COMPONENT_SET') {
      const children: GroupedItem[] = []
      i++
      while (i < components.length && components[i].type === 'COMPONENT') {
        children.push({ node: components[i], result: resultMap.get(components[i].id) })
        i++
      }
      groups.push({ kind: 'set', header: { node, result: resultMap.get(node.id) }, children })
    } else {
      groups.push({ kind: 'standalone', item: { node, result: resultMap.get(node.id) } })
      i++
    }
  }
  return groups
}

function initAuditChecks(groups: Group[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const group of groups) {
    const id = group.kind === 'set' ? group.header.node.id : group.item.node.id
    result[id] = true
  }
  return result
}

export default function App() {
  const [components, setComponents] = useState<ComponentNode[]>([])
  const [totalComponents, setTotalComponents] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [convention, setConvention] = useState<Convention>('tailwind')
  const [view, setView] = useState<View>('list')
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditResults, setAuditResults] = useState<AuditResult[]>([])
  const [auditError, setAuditError] = useState<string | null>(null)
  const [checkedForAudit, setCheckedForAudit] = useState<Record<string, boolean>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [editedNames, setEditedNames] = useState<Record<string, string>>({})
  const [renameResult, setRenameResult] = useState<{ applied: number; failed: string[] } | null>(null)
  const [selectionChanged, setSelectionChanged] = useState(false)
  const resultsScrollRef = useRef<HTMLDivElement>(null)

  const listGroups = buildGroups(components, [])

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined
      if (!msg) return

      if (msg.type === 'COMPONENTS_LOADED') {
        setComponents(msg.components)
        setTotalComponents(msg.total)
        const groups = buildGroups(msg.components, [])
        setCheckedForAudit(initAuditChecks(groups))
        setLoaded(true)
      } else if (msg.type === 'AUDIT_RESULT') {
        const results = msg.results.map((r) => ({
          ...r,
          status: normalizeStatus(r.status as string),
        }))
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
        setSelectionChanged(false)
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
      } else if (msg.type === 'SELECTION_CHANGED') {
        setSelectionChanged(true)
      }
    }
  }, [])

  useEffect(() => {
    if (view === 'results') {
      // Give focus to the scroll container so Figma Desktop routes wheel events to it
      setTimeout(() => resultsScrollRef.current?.focus(), 50)
    }
  }, [view])

  const handleAudit = () => {
    const toAudit: ComponentNode[] = []
    for (const group of listGroups) {
      if (group.kind === 'set') {
        if (checkedForAudit[group.header.node.id]) {
          toAudit.push(group.header.node)
          group.children.forEach((c) => toAudit.push(c.node))
        }
      } else {
        if (checkedForAudit[group.item.node.id]) {
          toAudit.push(group.item.node)
        }
      }
    }
    setIsAuditing(true)
    setAuditError(null)
    parent.postMessage({ pluginMessage: { type: 'AUDIT', convention, components: toAudit } }, '*')
  }

  const handleBack = () => {
    setView('list')
    setAuditResults([])
    setAuditError(null)
    setRenameResult(null)
    setChecked({})
    setEditedNames({})
    setSelectionChanged(false)
  }

  const handleApplySelected = () => {
    const renames = auditResults
      .filter((r) => r.status !== 'conform' && checked[r.id])
      .map((r) => ({ id: r.id, newName: editedNames[r.id] ?? r.suggestedName ?? r.currentName }))
    parent.postMessage({ pluginMessage: { type: 'apply-rename', renames } }, '*')
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

  const handleSelectRemaining = () => {
    const renamedIds = new Set(components.filter((c) => c.pluginStatus === 'renamed').map((c) => c.id))
    const ids = auditResults
      .filter((r) => r.status !== 'conform' && !renamedIds.has(r.id))
      .map((r) => r.id)
    parent.postMessage({ pluginMessage: { type: 'select-remaining', ids } }, '*')
  }

  const checkedGroupCount = Object.values(checkedForAudit).filter(Boolean).length
  const hasRenameTargets = auditResults.some((r) => r.status !== 'conform')
  const selectedCount = Object.values(checked).filter(Boolean).length

  const auditedIds = new Set(auditResults.map((r) => r.id))
  const auditedComponents = components.filter((c) => auditedIds.has(c.id))
  const resultGroups = buildGroups(auditedComponents, auditResults)

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none">
      <header className="px-4 pt-4 pb-3 border-b border-zinc-800 flex-shrink-0">
        <h1 className="text-sm font-semibold text-zinc-100 tracking-tight leading-none">
          Nomenclate
        </h1>
        <p className="text-xs text-zinc-500 mt-1 leading-none">Naming convention auditor</p>
        {loaded && components.length > 0 && view === 'list' && (
          <p className="text-[10.5px] text-zinc-600 leading-[1.5] mt-2.5 pr-2">
            Select components, pick a{' '}
            <span className="text-violet-400/80">convention</span>
            , then <span className="text-zinc-400 font-medium">Audit naming</span> — AI checks each name and suggests corrections you can apply directly in Figma.
          </p>
        )}
      </header>

      <main className="flex-1 flex flex-col overflow-hidden min-h-0">

        {!loaded && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-zinc-600">Scanning page…</p>
          </div>
        )}

        {loaded && components.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-xs font-medium text-zinc-400">No components found</p>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Open a Figma file that contains components or component sets.
            </p>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {loaded && components.length > 0 && view === 'list' && (
          <>
            {/* Info bar */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <p className="text-[11px] text-zinc-500">
                <span className="text-zinc-300 font-medium">{components.length}</span>
                {totalComponents > components.length && (
                  <span className="text-amber-500"> of {totalComponents}</span>
                )}
                {' components · this page'}
              </p>
              <div className="relative">
                <select
                  value={convention}
                  onChange={(e) => setConvention(e.target.value as Convention)}
                  className="appearance-none bg-zinc-800 text-violet-400 text-[11px] font-medium pl-2.5 pr-6 py-1 rounded-full border border-zinc-700/60 cursor-pointer focus:outline-none hover:bg-zinc-700 transition-colors"
                >
                  {CONVENTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={!opt.available}>
                      {opt.label}{!opt.available ? ' (soon)' : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <svg className="w-2.5 h-2.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {auditError && (
              <div className="flex-shrink-0 mx-4 mt-3 bg-red-950/40 border border-red-800/50 rounded-xl px-3 py-2">
                <p className="text-[10px] text-red-400 leading-relaxed break-words">{auditError}</p>
              </div>
            )}

            {/* Component group cards */}
            <div className="flex-1 min-h-0 relative">
             <div className="absolute inset-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {listGroups.map((group) => {
                const groupId = group.kind === 'set' ? group.header.node.id : group.item.node.id
                const name = group.kind === 'set' ? group.header.node.name : group.item.node.name
                const variantCount = group.kind === 'set' ? group.children.length : 0
                const isSet = group.kind === 'set'

                return (
                  <label
                    key={groupId}
                    className="flex items-center gap-3 px-3 py-3 border border-zinc-800 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checkedForAudit[groupId] ?? false}
                      onChange={(e) =>
                        setCheckedForAudit((prev) => ({ ...prev, [groupId]: e.target.checked }))
                      }
                      className="flex-shrink-0 w-3.5 h-3.5 accent-violet-500 cursor-pointer"
                    />
                    {isSet ? <IconComponentSet size={16} /> : <IconComponent size={14} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-zinc-100 truncate leading-tight">
                        {name}
                      </p>
                      {variantCount > 0 && (
                        <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                          {variantCount} {variantCount === 1 ? 'variant' : 'variants'}
                        </p>
                      )}
                    </div>
                  </label>
                )
              })}
             </div>
            </div>

            {/* Audit button */}
            <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-zinc-800">
              <button
                onClick={handleAudit}
                disabled={isAuditing || checkedGroupCount === 0}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAuditing ? (
                  <>
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Auditing…
                  </>
                ) : checkedGroupCount < listGroups.length
                  ? `Audit naming (${checkedGroupCount} / ${listGroups.length})`
                  : 'Audit naming'
                }
              </button>
            </div>
          </>
        )}

        {/* ── RESULTS VIEW ── */}
        {view === 'results' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Results header — 2 rows */}
            <div className="flex-shrink-0 border-b border-zinc-800">
              <div className="flex items-center justify-between px-4 py-2.5">
                <button
                  onClick={handleBack}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <span className="text-[10px] font-medium text-violet-400 capitalize">{convention}</span>
              </div>
              <div className="flex items-center justify-between px-4 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <SummaryPill
                    count={auditResults.filter((r) => r.status === 'conform').length}
                    label="conform"
                    color="green"
                  />
                  <SummaryPill
                    count={auditResults.filter((r) => r.status === 'non-conform').length}
                    label="non-conform"
                    color="red"
                  />
                  {auditResults.some((r) => r.status === 'ambiguous') && (
                    <SummaryPill
                      count={auditResults.filter((r) => r.status === 'ambiguous').length}
                      label="ambiguous"
                      color="amber"
                    />
                  )}
                </div>
                <InfoTooltip />
              </div>
            </div>

            {/* Selection changed banner */}
            {selectionChanged && (
              <div className="flex-shrink-0 mx-4 mt-3 flex items-center gap-2 bg-amber-950/40 border border-amber-800/50 rounded-xl px-3 py-2.5">
                <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <p className="text-[11px] text-amber-400 leading-snug">
                  Selection changed — go back and re-audit
                </p>
              </div>
            )}

            {/* Result group cards — absolute/inset pattern forces exact pixel height on scroll context */}
            <div className="flex-1 min-h-0 relative">
              <div
                ref={resultsScrollRef}
                tabIndex={-1}
                className="absolute inset-0 overflow-y-auto touch-pan-y outline-none px-4 py-3 flex flex-col gap-3"
                onWheel={(e) => e.stopPropagation()}
              >
                {resultGroups.map((group) => (
                  <ResultGroupCard
                    key={group.kind === 'set' ? group.header.node.id : group.item.node.id}
                    group={group}
                    checked={checked}
                    editedNames={editedNames}
                    onCheckChange={(id, val) => setChecked((prev) => ({ ...prev, [id]: val }))}
                    onNameChange={(id, val) => setEditedNames((prev) => ({ ...prev, [id]: val }))}
                  />
                ))}
              </div>
            </div>

            {/* Apply footer */}
            {hasRenameTargets && (
              <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-zinc-800 flex flex-col gap-2">
                <p className="text-[10px] text-zinc-600 leading-snug">
                  Check the names you want to rename, edit suggestions if needed, then apply.
                </p>
                {renameResult && (
                  <p className="text-[10px] text-zinc-400 leading-tight">
                    {renameResult.applied} renamed
                    {renameResult.failed.length > 0 && (
                      <>, {renameResult.failed.length} failed:{' '}
                        <span className="font-mono">{renameResult.failed.join(', ')}</span>
                      </>
                    )}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleApplySelected}
                    disabled={selectedCount === 0}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Apply selected ({selectedCount})
                  </button>
                  <button
                    onClick={handleApplyAll}
                    className="flex-1 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold py-2 rounded-xl transition-colors"
                  >
                    Apply all
                  </button>
                </div>
                <button
                  onClick={handleSelectRemaining}
                  className="w-full text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded-xl py-1.5 transition-colors"
                >
                  Select remaining in Figma
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function ResultGroupCard({
  group,
  checked,
  editedNames,
  onCheckChange,
  onNameChange,
}: {
  group: Group
  checked: Record<string, boolean>
  editedNames: Record<string, string>
  onCheckChange: (id: string, val: boolean) => void
  onNameChange: (id: string, val: string) => void
}) {
  if (group.kind === 'standalone') {
    const { node, result } = group.item
    const isRenamed = node.pluginStatus === 'renamed'
    const isIssue = result?.status === 'non-conform' || result?.status === 'ambiguous'

    return (
      <div className={`border border-zinc-800 rounded-xl overflow-hidden${isRenamed ? ' opacity-50' : ''}`}>
        <VariantContent
          node={node}
          result={result}
          isRenamed={isRenamed}
          isIssue={isIssue}
          checked={checked[node.id]}
          editedName={editedNames[node.id]}
          onCheckChange={(val) => onCheckChange(node.id, val)}
          onNameChange={(val) => onNameChange(node.id, val)}
        />
      </div>
    )
  }

  const { header, children } = group
  const { node: setNode, result: setResult } = header
  const isSetRenamed = setNode.pluginStatus === 'renamed'

  return (
    <div className={`border border-zinc-800 rounded-xl overflow-hidden${isSetRenamed ? ' opacity-50' : ''}`}>
      {/* SET header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-zinc-900">
        <IconComponentSet size={16} />
        <span className="flex-1 text-[13px] font-semibold text-zinc-100 truncate leading-none">
          {setNode.name}
        </span>
        {setResult && (isSetRenamed ? <RenamedBadge /> : <StatusBadge status={setResult.status} />)}
      </div>

      {/* Variants */}
      {children.map((child) => {
        const { node, result } = child
        const isRenamed = node.pluginStatus === 'renamed'
        const isIssue = result?.status === 'non-conform' || result?.status === 'ambiguous'
        return (
          <div key={node.id} className={`border-t border-zinc-800/60${isRenamed ? ' opacity-50' : ''}`}>
            <VariantContent
              node={node}
              result={result}
              isRenamed={isRenamed}
              isIssue={isIssue}
              checked={checked[node.id]}
              editedName={editedNames[node.id]}
              onCheckChange={(val) => onCheckChange(node.id, val)}
              onNameChange={(val) => onNameChange(node.id, val)}
            />
          </div>
        )
      })}
    </div>
  )
}

function VariantContent({
  node,
  result,
  isRenamed,
  isIssue,
  checked,
  editedName,
  onCheckChange,
  onNameChange,
}: {
  node: ComponentNode
  result?: AuditResult
  isRenamed: boolean
  isIssue: boolean
  checked?: boolean
  editedName?: string
  onCheckChange: (val: boolean) => void
  onNameChange: (val: string) => void
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-3">
      {/* Checkbox */}
      <div className="pt-0.5 flex-shrink-0 w-3.5 flex justify-center">
        {isIssue && !isRenamed && (
          <input
            type="checkbox"
            checked={checked ?? false}
            onChange={(e) => onCheckChange(e.target.checked)}
            className="w-3.5 h-3.5 accent-violet-500 cursor-pointer"
          />
        )}
      </div>

      {/* Icon */}
      <div className="pt-0.5 flex-shrink-0">
        <IconComponent size={12} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.06em] text-zinc-600 leading-none mb-0.5">
              Current name
            </p>
            <p className="text-[12px] font-mono text-zinc-300 break-all leading-snug">
              {result?.currentName ?? node.name}
            </p>
          </div>
          <div className="flex-shrink-0 pt-0.5">
            {result && (isRenamed ? <RenamedBadge /> : <StatusBadge status={result.status} />)}
          </div>
        </div>

        {isIssue && !isRenamed && result?.suggestedName && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.06em] text-zinc-600 leading-none mb-0.5">
              Suggested
            </p>
            <input
              type="text"
              value={editedName ?? result.suggestedName}
              onChange={(e) => onNameChange(e.target.value)}
              className="text-[12px] font-mono font-medium text-zinc-200 bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500/50 w-full select-text"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function normalizeStatus(s: string): AuditResult['status'] {
  const v = (s ?? '').toLowerCase().replace(/_/g, '-')
  if (v === 'conform') return 'conform'
  if (v === 'non-conform') return 'non-conform'
  return 'ambiguous'
}

function SummaryPill({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: 'green' | 'red' | 'amber'
}) {
  if (count === 0) {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] leading-none bg-zinc-900 text-zinc-600 border border-zinc-800">
        {count} {label}
      </span>
    )
  }
  const styles = {
    green: { pill: 'bg-green-950/60 text-green-400 border-green-800/40', dot: 'bg-green-400' },
    red: { pill: 'bg-red-950/60 text-red-400 border-red-800/40', dot: 'bg-red-400' },
    amber: { pill: 'bg-amber-950/60 text-amber-400 border-amber-800/40', dot: 'bg-amber-400' },
  }[color]
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium leading-none border ${styles.pill}`}>
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${styles.dot}`} />
      {count} {label}
    </span>
  )
}

function InfoTooltip() {
  return (
    <div className="relative group flex items-center">
      <button className="w-4 h-4 rounded-full border border-zinc-700 text-zinc-600 text-[9px] font-medium flex items-center justify-center hover:border-zinc-500 hover:text-zinc-400 transition-colors leading-none">
        ?
      </button>
      <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-56 bg-zinc-800 border border-zinc-700 rounded-xl p-3 shadow-xl pointer-events-none">
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] leading-relaxed">
              <span className="text-green-400 font-medium">Conform</span>
              <span className="text-zinc-400"> — name fully matches all convention rules.</span>
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] leading-relaxed">
              <span className="text-red-400 font-medium">Non-conform</span>
              <span className="text-zinc-400"> — name clearly violates at least one rule.</span>
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] leading-relaxed">
              <span className="text-amber-400 font-medium">Ambiguous</span>
              <span className="text-zinc-400"> — the convention doesn't clearly cover this case.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function IconComponentSet({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <rect width="16" height="16" rx="4" fill="#7B47EB" />
      <rect x="3.5" y="3.5" width="3.5" height="3.5" rx="0.75" fill="white" fillOpacity="0.85" />
      <rect x="9" y="3.5" width="3.5" height="3.5" rx="0.75" fill="white" fillOpacity="0.85" />
      <rect x="3.5" y="9" width="3.5" height="3.5" rx="0.75" fill="white" fillOpacity="0.85" />
      <rect x="9" y="9" width="3.5" height="3.5" rx="0.75" fill="white" fillOpacity="0.85" />
    </svg>
  )
}

function IconComponent({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
      <path d="M6 0.5L8 2.5L6 4.5L4 2.5L6 0.5Z" fill="#9747FF" />
      <path d="M11.5 6L9.5 4L7.5 6L9.5 8L11.5 6Z" fill="#9747FF" />
      <path d="M6 11.5L8 9.5L6 7.5L4 9.5L6 11.5Z" fill="#9747FF" />
      <path d="M0.5 6L2.5 4L4.5 6L2.5 8L0.5 6Z" fill="#9747FF" />
    </svg>
  )
}

function RenamedBadge() {
  return (
    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md tracking-wide uppercase bg-zinc-800/60 text-zinc-500 border border-zinc-700/40 leading-none whitespace-nowrap">
      Renamed
    </span>
  )
}

function StatusBadge({ status }: { status: AuditResult['status'] }) {
  if (status === 'conform') {
    return (
      <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md tracking-wide uppercase bg-green-950/70 text-green-400 border border-green-800/40 leading-none whitespace-nowrap">
        Conform
      </span>
    )
  }
  if (status === 'non-conform') {
    return (
      <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md tracking-wide uppercase bg-red-950/70 text-red-400 border border-red-800/40 leading-none whitespace-nowrap">
        Non-conform
      </span>
    )
  }
  return (
    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md tracking-wide uppercase bg-amber-950/70 text-amber-400 border border-amber-800/40 leading-none whitespace-nowrap">
      Ambiguous
    </span>
  )
}
