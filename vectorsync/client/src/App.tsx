import { useEffect, useMemo, useState } from 'react';
import { CRDTCanvasStore } from './crdt/CRDTStore';
import { useConnectionStatus, useNodes, usePeers, usePermissions, useRole } from './hooks/useCRDTStore';
import { CanvasStage, Tool } from './components/CanvasStage';
import { Toolbar } from './components/Toolbar';
import { LayerTree } from './components/LayerTree';
import { Inspector } from './components/Inspector';
import { TopBar } from './components/TopBar';
import { CanvasNode, ElementId, asElementId } from './shared/types';
import { downloadExport } from './canvas/export';
import { PermissionPanel } from './components/PermissionPanel';
import { WorkspaceSummary } from './components/WorkspaceSummary';
import { ExportFormat } from './canvas/export';

const ADJECTIVES = ['Amber', 'Coral', 'Violet', 'Cobalt', 'Slate', 'Ivory', 'Cedar', 'Ochre'];
const ANIMALS = ['Falcon', 'Otter', 'Lynx', 'Heron', 'Fox', 'Wren', 'Marlin', 'Ibex'];

function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a} ${b}`;
}

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8787';
const FILL_PALETTE = ['#7CD4FD', '#84ADFF', '#9E77ED', '#F97066', '#F79009', '#3CCB7F'];

export default function App() {
  const [displayName] = useState(() => sessionStorage.getItem('vs-name') ?? randomName());
  useEffect(() => sessionStorage.setItem('vs-name', displayName), [displayName]);

  const store = useMemo(() => new CRDTCanvasStore(WS_URL, displayName), [displayName]);
  useEffect(() => () => store.destroy(), [store]);

  const nodes = useNodes(store);
  const peers = usePeers(store);
  const status = useConnectionStatus(store);
  const role = useRole(store);
  const permissions = usePermissions(store);

  const [tool, setTool] = useState<Tool>('select');
  const [selectedIds, setSelectedIds] = useState<ElementId[]>([]);
  const [fillColor, setFillColor] = useState(FILL_PALETTE[0]);

  useEffect(() => {
    store.updatePresence({ activeTool: tool });
  }, [store, tool]);

  const selectedNode = nodes.find((n) => n.id === selectedIds[0]) ?? null;

  const handleReorder = (sourceId: ElementId, targetId: ElementId) => {
    const ordered = [...nodes].sort((a, b) => b.zIndex - a.zIndex);
    const sourceIndex = ordered.findIndex((node) => node.id === sourceId);
    const targetIndex = ordered.findIndex((node) => node.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = ordered.splice(sourceIndex, 1);
    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    ordered.splice(adjustedTargetIndex, 0, source);
    ordered.forEach((node, index) => store.upsertNode({ ...node, zIndex: ordered.length - index }));
  };

  const handleGroup = () => {
    if (selectedIds.length < 2) return;
    const group: Omit<CanvasNode, 'clock' | 'clientId'> = {
      id: asElementId(`${store.clientId}-group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
      type: 'group', position: { x: 0, y: 0 }, size: { x: 0, y: 0 }, rotation: 0,
      fillColor: '#ffffff', strokeColor: '#ffffff', strokeWidth: 0, opacity: 1,
      name: `Group ${nodes.filter((node) => node.type === 'group').length + 1}`,
      zIndex: Math.max(...nodes.map((node) => node.zIndex), 0) + 1,
      childrenIds: selectedIds,
    };
    store.upsertNode(group);
    nodes.filter((node) => selectedIds.includes(node.id)).forEach((node) => {
      store.upsertNode({ ...node, sectionId: group.id });
    });
    setSelectedIds([group.id]);
  };

  const handleExport = (format: ExportFormat) => {
    void downloadExport(nodes, format).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Export failed');
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, Tool> = { v: 'select', r: 'rectangle', o: 'ellipse', t: 'triangle', a: 'arrow', x: 'text', c: 'connector', d: 'diamond', s: 'star', p: 'polygon', i: 'pill', n: 'sticky', y: 'title' };
      if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.length) {
        selectedIds.forEach((id) => store.deleteNode(id));
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, store]);

  return (
    <div className="app-shell">
      <TopBar status={status} peers={peers} selfName={displayName} selfColor={store.color} onExport={handleExport} />

      <div className="workspace">
        <aside className="left-rail">
          <Toolbar
            tool={tool}
            onChange={setTool}
            onImageSelected={(file) => {
              if (file.size > 2 * 1024 * 1024) return;
              const reader = new FileReader();
              reader.onload = () => {
                const id = asElementId(`${store.clientId}-image-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
                store.upsertNode({
                  id, type: 'image', position: { x: 80, y: 80 }, size: { x: 260, y: 180 }, rotation: 0,
                  fillColor: '#ffffff', strokeColor: '#2a2b33', strokeWidth: 1, opacity: 1,
                  imageUrl: String(reader.result), name: `Image ${nodes.filter((node) => node.type === 'image').length + 1}`,
                  zIndex: Date.now(),
                });
                setSelectedIds([id]);
              };
              reader.readAsDataURL(file);
            }}
          />
          <WorkspaceSummary nodes={nodes} status={status} />
          <div className="swatch-row">
            {FILL_PALETTE.map((c) => (
              <button
                key={c}
                className={`swatch ${fillColor === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setFillColor(c)}
              />
            ))}
          </div>
          <LayerTree
            nodes={nodes}
            selectedIds={selectedIds}
            onReorder={handleReorder}
            onGroup={handleGroup}
            onSelect={(id, additive) =>
              setSelectedIds(additive ? (selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]) : [id])
            }
            onDelete={(id) => {
              store.deleteNode(id);
              setSelectedIds((prev) => prev.filter((x) => x !== id));
            }}
          />
        </aside>

        <main className="canvas-area">
          <CanvasStage
            store={store}
            tool={tool}
            onToolUsed={() => setTool('select')}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            fillColor={fillColor}
          />
        </main>

        <aside className="right-rail">
          <Inspector node={selectedNode} onChange={(patch) => selectedNode && store.upsertNode({ ...selectedNode, ...patch })} />
          <PermissionPanel
            groups={nodes.filter((node) => node.type === 'group')}
            role={role}
            getPermission={(sectionId) => permissions.find((permission) => permission.sectionId === sectionId)?.role === 'viewer' ? 'viewer' : 'editor'}
            onChange={(sectionId, nextRole) => store.setPermission(sectionId, nextRole)}
          />
        </aside>
      </div>
    </div>
  );
}
