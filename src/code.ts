/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 420, height: 520, title: 'Nomenclate' })

const PROXY_URL = 'https://nomenclate-proxy.vercel.app/api/analyze'
const MAX_COMPONENTS = 50

type ComponentData = {
  id: string
  name: string
  type: 'COMPONENT' | 'COMPONENT_SET'
}

type AuditResult = {
  id: string
  currentName: string
  status: 'conform' | 'non-conform' | 'ambiguous'
  suggestedName?: string
  justification: string
}

const nodes = figma.currentPage.findAll(
  (node) => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
)

const components: ComponentData[] = nodes.map((node) => ({
  id: node.id,
  name: node.name,
  type: node.type as 'COMPONENT' | 'COMPONENT_SET',
}))

figma.ui.postMessage({ type: 'COMPONENTS_LOADED', components })

figma.ui.onmessage = async (msg: {
  type: string
  convention?: string
  components?: ComponentData[]
}) => {
  if (msg.type === 'CLOSE') {
    figma.closePlugin()
    return
  }

  if (msg.type === 'AUDIT') {
    const allComponents = msg.components ?? []
    const toAudit = allComponents.slice(0, MAX_COMPONENTS)
    const convention = msg.convention ?? 'tailwind'

    try {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ convention, components: toAudit }),
      })

      if (!response.ok) {
        let errorText: string
        try {
          errorText = await response.text()
        } catch {
          errorText = response.statusText
        }
        figma.ui.postMessage({
          type: 'AUDIT_ERROR',
          message: `HTTP ${response.status}: ${errorText}`,
        })
        return
      }

      const results: AuditResult[] = await response.json()
      figma.ui.postMessage({ type: 'AUDIT_RESULT', results })
    } catch (err) {
      figma.ui.postMessage({
        type: 'AUDIT_ERROR',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
