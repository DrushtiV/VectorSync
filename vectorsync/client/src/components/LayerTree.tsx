import { CanvasNode, ElementId } from '../shared/types';

interface Props {
  nodes: CanvasNode[];
  selectedIds: ElementId[];
  onSelect: (id: ElementId, additive: boolean) => void;
  onDelete: (id: ElementId) => void;
  onReorder: (sourceId: ElementId, targetId: ElementId) => void;
  onGroup: () => void;
}

const TYPE_GLYPH: Record<string, string> = {
  rectangle: '▭',
  ellipse: '◯',
  triangle: '△',
  arrow: '→',
  text: 'T',
  path: '✎',
  connector: '↗',
  group: '▦',
  diamond: '◇',
  star: '★',
  polygon: '⬡',
  pill: '▱',
  sticky: '▤',
  image: '▧',
  line: '／',
  title: 'H',
};

export function LayerTree({ nodes, selectedIds, onSelect, onDelete, onReorder, onGroup }: Props) {
  const ordered = [...nodes].sort((a, b) => b.zIndex - a.zIndex);
  const childIds = new Set(nodes.flatMap((node) => node.childrenIds ?? []));
  const roots = ordered.filter((node) => !childIds.has(node.id));
  const renderRow = (n: CanvasNode, nested = false) => (
    <div key={n.id}>
      <div
        className={`layer-row ${selectedIds.includes(n.id) ? 'selected' : ''}`}
        style={nested ? { paddingLeft: 28 } : undefined}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', n.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const sourceId = e.dataTransfer.getData('text/plain') as ElementId;
          if (sourceId && sourceId !== n.id) onReorder(sourceId, n.id);
        }}
        onClick={(e) => onSelect(n.id, e.shiftKey)}
      >
        <span className="layer-glyph">{TYPE_GLYPH[n.type] ?? '◆'}</span>
        <span className="layer-name">{n.name}</span>
        <span className="layer-z">Z {n.zIndex}</span>
        <button
          className="layer-delete"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(n.id);
          }}
        >
          ×
        </button>
      </div>
      {n.childrenIds?.map((childId) => {
        const child = nodes.find((node) => node.id === childId);
        return child ? renderRow(child, true) : null;
      })}
    </div>
  );

  return (
    <div className="panel-section layer-panel">
      <div className="layer-heading">
        <div className="panel-title">Layers</div>
        <button className="group-btn" title="Group selected layers" disabled={selectedIds.length < 2} onClick={onGroup}>Group</button>
      </div>
      <div className="layer-list">
        {ordered.length === 0 && <div className="empty-hint">Draw a shape to see it here.</div>}
        {roots.map((node) => renderRow(node))}
      </div>
    </div>
  );
}
