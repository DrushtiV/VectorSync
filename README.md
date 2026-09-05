# VectorSync — Real-Time Collaborative Vector Canvas

A Figma-style multiplayer vector canvas: draw shapes, drag them around, watch everyone else's cursor and edits appear live, and never worry about two people clobbering each other's work — conflicts resolve automatically via a CRDT, no locks required.

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Toolbar + Layers (left rail)  │  Infinite Canvas Viewport (pan / zoom / draw / drag / select)  │  Inspector (right)  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Image/ Video Preview

<img width="720" height="765" alt="Diagram_Demo" src="https://github.com/user-attachments/assets/f7f4f4cd-0f01-475a-9f01-8c6270b8221c" />

The following embed can be used on a site or documentation page that supports HTML video:

```html
<video controls width="100%" preload="metadata">
  <source src="assest/demo.mp4" type="video/mp4" />
  Your browser does not support embedded video.
</video>
```

The `assest` directory is included in the repository for these future media assets.

## 1. What's inside

```text
vectorsync/
├── client/                  React + TypeScript + Vite frontend
│   ├── src/
│   │   ├── shared/types.ts       Wire protocol shared with the server
│   │   ├── crdt/CRDTStore.ts     LWW-Map CRDT + WebSocket sync engine
│   │   ├── spatial/RTree.ts      R-Tree spatial index for viewport culling
│   │   ├── canvas/                Camera, connectors, rendering, export worker, and hit-testing
│   │   ├── components/            Toolbar, LayerTree, Inspector, permissions, CanvasStage, TopBar
│   │   ├── hooks/useCRDTStore.ts  React bindings (useSyncExternalStore)
│   │   ├── App.tsx / main.tsx
│   │   └── styles/index.css
│   ├── index.html, vite.config.ts, package.json, tsconfig.json
│   └── .env.example
├── assest/                   Product preview and demo media assets
├── server/                   Node.js WebSocket relay
│   ├── src/index.ts          Fan-out relay + LWW convergence store
│   └── package.json, tsconfig.json
├── package.json               Root workspace orchestration (npm workspaces)
└── README.md                  You are here
```

---

## 2. Architecture summary

**Conflict resolution — Last-Write-Wins CRDT.** Every shape (`CanvasNode`) carries a Lamport clock and the id of the client that wrote it. When two
clients edit the same shape concurrently, both the browser and the relay server run the *same* merge rule:

```text
higher clock always wins; a tie is broken by comparing client id strings.
```

This rule is commutative, associative, and idempotent, so every replica converges to identical state no matter what order messages arrive in — the
textbook definition of a state-based CRDT (CvRDT). The server is not an authority; it's a relay that also happens to keep a merged snapshot so late
joiners can catch up instantly.

**Viewport culling — R-Tree.** `client/src/spatial/RTree.ts` implements a compact bulk-loaded R-Tree. On every node-set change the tree is rebuilt
(cheap — well under a millisecond for thousands of shapes) and the render loop queries only the bounding box currently visible in the camera, giving
`O(log n)` culling instead of iterating the entire scene graph every frame.

**Render loop.** `CanvasStage.tsx` drives a `requestAnimationFrame` loop over a plain 2D `<canvas>`: clear → draw grid → apply the camera matrix → query
the R-Tree for visible nodes → draw shapes → draw selection handles → draw peer cursors in screen space. Because only visible nodes are drawn and the
R-Tree query is fast, the loop stays smooth even with large scenes.

**Sync transport.** A single WebSocket connection per client. Mutations (`NODE_MUTATED`, `NODE_DELETED`) and ephemeral presence (`PRESENCE_UPDATE` —
cursor position, current selection) travel over the same socket, JSON-encoded. The relay fans every message out to all other connected clients and keeps a
converged snapshot in memory for `WELCOME` payloads sent to new joiners.

**Presence overlay.** Cursor positions are broadcast on every pointer move and rendered directly onto the canvas (not as separate DOM nodes), so remote
cursors move in the exact same coordinate space and at the same frame rate as the shapes themselves.

**Local-first editing.** Client snapshots are stored in IndexedDB and local mutations are queued while the relay is unavailable. Queued mutations are
replayed after reconnection and merged through the same LWW rule.

**Dynamic connectors and hierarchy.** Connector nodes calculate straight or orthographic paths from live source and target shapes. Groups store child
IDs, layer ordering is synchronized through CRDT mutations, and the Layers panel supports nested display and drag reordering.

**Export pipeline.** SVG, high-resolution PNG, and vector PDF exports run in a dedicated Web Worker so large documents do not block the editor UI.

**Section permissions.** Document owners can mark grouped canvas sections as `Can edit` or `View only`. The client and relay both enforce the selected
permission before accepting mutations.

---

## 3. Prerequisites

| Requirement | Minimum version | Check with |
| --- | --- | --- |
| Node.js | 18.x or newer | `node -v` |
| npm | 9.x or newer (ships with Node 18+) | `npm -v` |

No database, no Docker, no cloud account needed — everything runs locally.

If you don't have Node.js installed:

- **macOS**: `brew install node` (requires [Homebrew](https://brew.sh)), or download from [nodejs.org](https://nodejs.org)
- **Windows**: download the installer from [nodejs.org](https://nodejs.org)
- **Linux (Debian/Ubuntu)**: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`

---

## 4. Installation

From the **project root** (the folder containing this README):

```bash
# 1. Install dependencies for both the client and server in one shot (this project uses npm workspaces, so one install covers everything)
npm install
```

That's it — `npm install` at the root resolves `client/` and `server/` as
workspaces and installs both.

---

## 5. Running the project

### Option A — one command, both processes (recommended)

```bash
npm run dev
```

This starts:

- the WebSocket relay server on `ws://localhost:8787`
- the Vite dev server on `http://localhost:5173`

Open `http://localhost:5173` in two or more browser windows (or share the
URL with a teammate on the same network — see §7) to see live collaboration.

### Option B — run each process separately (two terminals)

```bash
# Terminal 1 — WebSocket relay
npm run dev:server

# Terminal 2 — frontend
npm run dev:client
```

### Option C — production build + run

```bash
# Build both packages
npm run build

# Start the compiled relay server
npm run start:server

# In another terminal, preview the production client build
npm run preview:client
```

---

## 6. Configuration

The client reads the relay's address from an environment variable. Defaults to `ws://localhost:8787`, which works out of the box for local development.

To point the client at a different server (e.g. a deployed relay):

```bash
cd client
cp .env.example .env
# edit .env:
# VITE_WS_URL=wss://your-server-domain.com
```

To change the server's port:

```bash
PORT=9000 npm run dev:server
# ...and update client/.env to VITE_WS_URL=ws://localhost:9000
```

---

## 7. Testing multiplayer sync locally

1. Run `npm run dev`.
2. Open `http://localhost:5173` in two browser windows (or one normal + one incognito window, so each gets a distinct session identity).
3. Draw a shape in one window — it appears instantly in the other.
4. Move your cursor — the other window shows a live, named, colored cursor.
5. Drag the *same* shape in both windows at once — thanks to the LWW CRDT, both converge to one consistent final position with no crash and no duplicate shapes.

To test across two physical devices on the same Wi-Fi network, find your machine's LAN IP (`ipconfig` on Windows, `ifconfig`/`ip a` on macOS/Linux),
then set `client/.env`:

```bash
VITE_WS_URL=ws://<your-lan-ip>:8787
```

and open `http://<your-lan-ip>:5173` on the other device.

---

## 8. Using the app

| Tool | Shortcut | Action |
| --- | --- | --- |
| Select | `V` | Click to select, drag to move, Shift-click to multi-select |
| Rectangle | `R` | Click on canvas to place |
| Ellipse | `O` | Click on canvas to place |
| Triangle | `T` | Click on canvas to place |
| Arrow | `A` | Click on canvas to place |
| Text | `X` | Click on canvas to place, edit content in the Inspector |
| Diamond | `D` | Click on canvas to place |
| Star | `S` | Click on canvas to place |
| Polygon | `P` | Click on canvas to place, adjust points in the Inspector |
| Pill | `I` | Click on canvas to place |
| Sticky note | `N` | Click on canvas to place, edit note text in the Inspector |
| Line | `L` | Click on canvas to place |
| Image | toolbar image button | Select an image file to insert it into the canvas |
| Smart connector | `C` | Select two shapes, then create an orthographic connector |
| Delete | `Backspace` / `Delete` | Removes the selected shape(s) |
| Pan | scroll, or `Alt` + drag | Move the camera |
| Zoom | `Ctrl`/`Cmd` + scroll | Zoom toward the cursor |

The **left rail** shows your tools, fill-color swatches, and a live layer list. The **right rail** (Inspector) edits position, size, rotation,
opacity, fill, and stroke for the current selection — every change syncs to all connected peers immediately.

Connect two selected shapes with the `C` connector tool; connectors use live endpoints and orthogonal routing. Use `Group` in the Layers panel
to create a shared group, drag layers to reorder them, and use the `SVG`, `PNG`, or `PDF` buttons in the top bar to export the current canvas.

The workspace is local-first: edits are cached in IndexedDB and queued while the relay is unavailable, then replayed when the connection returns.
The top bar also supports vector `PDF` export. Group sections expose `View only` or `Can edit` access controls for the document owner.

The shape toolbar includes rectangles, rounded rectangles, circles/ellipses, triangles, straight lines and arrows, text boxes, smart orthographic
connectors, diamonds, stars, polygons, pills, sticky notes, and image insertion. Select a polygon or star to adjust its point count in the Inspector.
Use the `Y` title box tool to place a diagram title; edit its text, font, size, alignment, and colour in the Inspector.

---

## 9. Troubleshooting

**"Reconnecting…" never turns into "Live"**
The relay server isn't running, or the client is pointed at the wrong URL. Confirm `npm run dev:server` is running and that `client/.env`'s `VITE_WS_URL` matches the port it printed (`ws://localhost:8787` by default).

**Port already in use**
Another process is bound to 8787 or 5173. Either stop it, or run the server on a different port (`PORT=8788 npm run dev:server`) and update `client/.env` accordingly; for the client, pass `--port` to Vite (`npm run dev:client -- --port 5174`).

**`npm install` fails with an engine warning**
Update Node.js to 18 or newer (see §3).

**Shapes from another tab don't disappear when I close it**
This is expected — deletion is explicit (via the Delete key or layer "×" button). Closing a tab only removes that user's presence cursor, not their
shapes; nothing is lost when someone disconnects.

---

## 10. Extending the project

- **Binary wire protocol**: replace the JSON payloads in `shared/types.ts` and the socket handlers with FlatBuffers/Protobuf to cut bandwidth on
  high-frequency cursor streams.
- **Offscreen worker rendering**: move `RTree` queries and hit-testing into a dedicated Web Worker via `OffscreenCanvas.transferControlToOffscreen()`
  to keep the main thread free for very large scenes.
- **Persistence**: the relay currently keeps state in memory only; swap the `Map`-based store in `server/src/index.ts` for a persisted store (SQLite,
  Redis, or a file snapshot on an interval) to survive server restarts.
- **Undo/redo**: the CRDT clock already gives you a natural history — snapshot `CanvasNode` versions per id to implement per-user undo stacks.

---
