/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 420, height: 680, title: 'Nomenclate' })

const PROXY_URL = 'https://nomenclate-proxy.vercel.app/api/analyze'
const MAX_COMPONENTS = 50

type ComponentData = {
  id: string
  name: string
  type: 'COMPONENT' | 'COMPONENT_SET'
  pluginStatus: string
  pluginAudit: string
}

type AuditResult = {
  id: string
  currentName: string
  status: 'conform' | 'non-conform' | 'ambiguous'
  suggestedName?: string
  justification: string
}

type SelectedNodeInfo = {
  id: string
  name: string
  type: 'COMPONENT' | 'COMPONENT_SET'
  pluginStatus: string
  pluginAudit: string
}

const allNodes = figma.currentPage.findAll(
  (node) => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
)

const allComponents: ComponentData[] = allNodes.map((node) => ({
  id: node.id,
  name: node.name,
  type: node.type as 'COMPONENT' | 'COMPONENT_SET',
  pluginStatus: node.getPluginData('nomenclate-status'),
  pluginAudit: node.getPluginData('nomenclate-audit'),
}))

figma.ui.postMessage({
  type: 'COMPONENTS_LOADED',
  components: allComponents.slice(0, MAX_COMPONENTS),
  total: allComponents.length,
})

figma.on('selectionchange', () => {
  const selection: SelectedNodeInfo[] = []

  for (const node of figma.currentPage.selection) {
    if (node.type === 'COMPONENT_SET') {
      selection.push({
        id: node.id, name: node.name, type: 'COMPONENT_SET',
        pluginStatus: node.getPluginData('nomenclate-status'),
        pluginAudit: node.getPluginData('nomenclate-audit'),
      })
      for (const child of node.children) {
        if (child.type === 'COMPONENT') {
          selection.push({
            id: child.id, name: child.name, type: 'COMPONENT',
            pluginStatus: child.getPluginData('nomenclate-status'),
            pluginAudit: child.getPluginData('nomenclate-audit'),
          })
        }
      }
    } else if (node.type === 'COMPONENT') {
      selection.push({
        id: node.id, name: node.name, type: 'COMPONENT',
        pluginStatus: node.getPluginData('nomenclate-status'),
        pluginAudit: node.getPluginData('nomenclate-audit'),
      })
    }
  }

  figma.ui.postMessage({ type: 'SELECTION_CHANGED', selection })
})

figma.ui.onmessage = async (msg: {
  type: string
  convention?: string
  components?: ComponentData[]
  renames?: { id: string; newName: string }[]
  ids?: string[]
  results?: Array<{ id: string; status: string }>
}) => {
  if (msg.type === 'CLOSE') {
    figma.closePlugin()
    return
  }

  if (msg.type === 'AUDIT') {
    const toAudit = (msg.components ?? []).slice(0, MAX_COMPONENTS)
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      figma.ui.postMessage({ type: 'AUDIT_ERROR', message })
    }
  }

  if (msg.type === 'STORE_AUDIT') {
    for (const { id, status } of msg.results ?? []) {
      const node = figma.getNodeById(id)
      if (node) node.setPluginData('nomenclate-audit', status)
    }
  }

  if (msg.type === 'apply-rename') {
    const renames = msg.renames ?? []
    let applied = 0
    const failed: string[] = []
    const succeededIds: string[] = []

    for (const { id, newName } of renames) {
      const node = figma.getNodeById(id)
      if (!node) {
        failed.push(newName)
        continue
      }
      if (
        node.type === 'COMPONENT' &&
        node.parent?.type === 'COMPONENT_SET' &&
        node.name.includes('=') &&
        !newName.includes('=')
      ) {
        failed.push(newName)
        continue
      }
      node.name = newName
      node.setPluginData('nomenclate-status', 'renamed')
      succeededIds.push(id)
      applied++
    }

    figma.ui.postMessage({ type: 'RENAME_RESULT', applied, failed, succeededIds })
  }

  if (msg.type === 'select-remaining') {
    const ids = msg.ids ?? []
    const nodes: SceneNode[] = []
    for (const id of ids) {
      const node = figma.getNodeById(id)
      if (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
        nodes.push(node as SceneNode)
      }
    }
    figma.currentPage.selection = nodes
    if (nodes.length > 0) figma.viewport.scrollAndZoomIntoView(nodes)
  }
}
