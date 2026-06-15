import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))

function buildFigmaSandbox(): Plugin {
  return {
    name: 'build-figma-sandbox',
    buildStart() {
      this.addWatchFile(resolve(__dirname, 'src/code.ts'))
    },
    async closeBundle() {
      const html = readFileSync(resolve(__dirname, 'dist/index.html'), 'utf-8')
      await esbuild.build({
        entryPoints: [resolve(__dirname, 'src/code.ts')],
        bundle: true,
        outfile: resolve(__dirname, 'dist/code.js'),
        define: { __html__: JSON.stringify(html) },
        target: 'es6',
        platform: 'browser',
        logLevel: 'info',
      })
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/ui'),
  plugins: [react(), viteSingleFile(), buildFigmaSandbox()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
  },
})
