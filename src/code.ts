/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 420, height: 520, title: 'Nomenclate' })

type ComponentData = {
  id: string
  name: string
  type: 'COMPONENT' | 'COMPONENT_SET'
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

figma.ui.onmessage = (msg: { type: string }) => {
  if (msg.type === 'CLOSE') {
    figma.closePlugin()
  }
}
