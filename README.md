# nomenclate-plugin

Figma plugin that audits design system naming conventions and suggests AI-powered renamings based on Tailwind, Material 3, Atlassian, Polaris, and Atomic Design.

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- Figma Desktop

### Setup

```bash
npm install
```

### Build

```bash
# Watch mode — rebuilds on every file change
npm run dev

# Single production build
npm run build

# Type check all configs
npm run typecheck
```

Build output goes to `dist/`:

| File | Description |
|---|---|
| `dist/code.js` | Sandbox code (Figma main thread) |
| `dist/index.html` | Plugin UI (iframe, all assets inlined) |

### Loading the plugin in Figma Desktop

1. Run `npm run dev` to start the watch build.
2. Open Figma Desktop.
3. Go to **Plugins → Development → Import plugin from manifest…**
4. Select `manifest.json` from this repository root.
5. The plugin will appear under **Plugins → Development → Nomenclate**.
6. Open any Figma file and run the plugin — it lists all components and component sets on the current page.

Each time you reopen the plugin, Figma reloads the files from disk, so changes from watch mode are picked up automatically.

## Project structure

```
src/
  code.ts          Figma sandbox: traverses the document tree, sends data to the UI
  ui/
    index.html     Vite HTML entry point
    main.tsx       React mount
    App.tsx        Root UI component
    styles.css     Tailwind CSS imports
dist/              Build output (git-ignored)
manifest.json      Figma plugin manifest
vite.config.ts     Vite config — builds UI, then compiles code.ts via esbuild
tailwind.config.ts Tailwind configuration
```

## License

MIT
