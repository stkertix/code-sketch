# Code Sketch

Visual diagram editor for developers, system analysts, and engineers. Drag shapes on a canvas (draw.io-style) or import Mermaid syntax into editable nodes.

## Features

- **Canvas editing** — drag & drop shapes, connect with edges, pan/zoom, undo/redo, duplicate, align
- **Diagram modes** — Flowchart, Architecture, Entity Relation (ERD), UML Class
- **Groups** — group containers in every mode; nodes snap into groups when dropped inside
- **Mermaid import / export** — paste or upload `.mmd` / Markdown; export canvas back to Mermaid (`.mmd` download or copy). Supported: `flowchart`/`graph`, `erDiagram` (both map `subgraph` → group), `classDiagram` (subset), architecture as flowchart
- **Local files** — save/open `.codesketch.json`, export PNG/SVG/Mermaid, autosave draft to `localStorage`
- **Inspector** — edit labels, colors, attributes/methods, edge type / endpoint markers
- **Themes** — dark and light mode (toolbar toggle; preference saved locally)
- **Line grid** — optional canvas grid (hidden in PNG/SVG export)

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- [React Flow](https://reactflow.dev/) (`@xyflow/react`)
- Zustand, Mermaid, html-to-image
- [Flaticon Uicons](https://www.flaticon.com/uicons) (interface icons)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Keyboard shortcuts

| Shortcut                             | Action             |
| ------------------------------------ | ------------------ |
| `⌘/Ctrl + Z`                         | Undo               |
| `⌘/Ctrl + Y` or `⌘/Ctrl + Shift + Z` | Redo               |
| `⌘/Ctrl + D`                         | Duplicate selected |
| `⌘/Ctrl + A`                         | Select all         |
| `⌘/Ctrl + Shift + L`                 | Auto layout        |
| `⌘/Ctrl + ]`                         | Bring to front     |
| `⌘/Ctrl + [`                         | Send to back       |
| `Delete` / `Backspace`               | Delete selected    |
| `Escape`                             | Leave text field   |
| Middle / right mouse drag            | Pan canvas         |
| Trackpad / scroll                    | Pan canvas         |
| Pinch                                | Zoom               |
| `Space` + drag                       | Pan canvas         |

## Source layout

Code is grouped by scope / responsibility:

```
src/
  app/                 Application shell
    App.tsx
    shell/             Toolbar + shared Icon
    theme/             Theme preference store
    ui/                UI chrome prefs (e.g. grid toggle)

  canvas/              Editing surface
    DiagramCanvas.tsx
    useKeyboardShortcuts.ts
    nodes/             Node views
    edges/             Edge views, markers, orthogonal routing

  diagram/             Domain model & state
                       (types, store, document, history, grid,
                        grouping, auto-layout, entity attributes)

  panels/              Side panels
    palette/           Shape palette + definitions
    inspector/         Property panel

  io/                  Import / export
    image.ts           PNG / SVG
    mermaid/           Mermaid import + export

  styles/              Global CSS / design tokens
```

## Project file format

Projects are saved as JSON (`.codesketch.json`) with:

```ts
{
  version: 1,
  name: string,
  diagramType: 'flowchart' | 'architecture' | 'erd' | 'uml',
  nodes: Node[],
  edges: Edge[],
  viewport: { x, y, zoom }
}
```

## Out of scope (MVP)

Auth, cloud sync, realtime collaboration, bidirectional Mermaid sync, full UML coverage, and a desktop shell are not included yet.

## Credits

Interface icons by [Flaticon Uicons](https://www.flaticon.com/uicons) (`@flaticon/flaticon-uicons`).

## License

Private / unpublished — all rights reserved unless otherwise stated.
