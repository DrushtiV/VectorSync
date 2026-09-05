import { CanvasNode } from '../shared/types';

interface Props {
  node: CanvasNode | null;
  onChange: (patch: Partial<CanvasNode>) => void;
}

function boundedNumber(value: string, min: number, max: number): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

export function Inspector({ node, onChange }: Props) {
  if (!node) {
    return (
      <div className="panel-section">
        <div className="panel-title">Inspector</div>
        <div className="empty-hint">Select a shape to edit its properties.</div>
      </div>
    );
  }

  return (
    <div className="panel-section">
      <div className="panel-title">Inspector</div>

      <div className="field-grid">
        <label>X</label>
        <input
          type="number"
          value={Math.round(node.position.x)}
          onChange={(e) => { const value = boundedNumber(e.target.value, -1000000, 1000000); if (value !== null) onChange({ position: { ...node.position, x: value } }); }}
        />
        <label>Y</label>
        <input
          type="number"
          value={Math.round(node.position.y)}
          onChange={(e) => { const value = boundedNumber(e.target.value, -1000000, 1000000); if (value !== null) onChange({ position: { ...node.position, y: value } }); }}
        />
        <label>W</label>
        <input
          type="number"
          value={Math.round(node.size.x)}
          onChange={(e) => { const value = boundedNumber(e.target.value, 0, 1000000); if (value !== null) onChange({ size: { ...node.size, x: value } }); }}
        />
        <label>H</label>
        <input
          type="number"
          value={Math.round(node.size.y)}
          onChange={(e) => { const value = boundedNumber(e.target.value, 0, 1000000); if (value !== null) onChange({ size: { ...node.size, y: value } }); }}
        />
        <label>Rotation</label>
        <input
          type="number"
          value={Math.round(node.rotation)}
          onChange={(e) => { const value = boundedNumber(e.target.value, -36000, 36000); if (value !== null) onChange({ rotation: value }); }}
        />
        <label>Opacity</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={node.opacity}
          onChange={(e) => { const value = boundedNumber(e.target.value, 0, 1); if (value !== null) onChange({ opacity: value }); }}
        />
        {(node.type === 'rectangle' || node.type === 'pill') && (
          <>
            <label>Radius</label>
            <input
              type="number"
              min={0}
              max={500}
              value={Math.round(node.cornerRadius ?? (node.type === 'pill' ? Math.min(node.size.x, node.size.y) / 2 : 8))}
              onChange={(e) => { const value = boundedNumber(e.target.value, 0, 500); if (value !== null) onChange({ cornerRadius: value }); }}
            />
          </>
        )}
        {(node.type === 'polygon' || node.type === 'star') && (
          <>
            <label>Points</label>
            <input
              type="number"
              min={3}
              max={24}
              value={node.sides ?? 6}
              onChange={(e) => { const value = boundedNumber(e.target.value, 3, 24); if (value !== null) onChange({ sides: Math.round(value) }); }}
            />
          </>
        )}
      </div>

      <div className="panel-title" style={{ marginTop: 18 }}>Fill</div>
      <div className="color-row">
        <input type="color" value={node.fillColor} onChange={(e) => onChange({ fillColor: e.target.value })} />
        <span className="color-hex">{node.fillColor}</span>
      </div>

      <div className="panel-title" style={{ marginTop: 18 }}>Stroke</div>
      <div className="color-row">
        <input type="color" value={node.strokeColor} onChange={(e) => onChange({ strokeColor: e.target.value })} />
        <input
          type="number"
          className="stroke-width"
          min={0}
          max={20}
          value={node.strokeWidth}
          onChange={(e) => { const value = boundedNumber(e.target.value, 0, 20); if (value !== null) onChange({ strokeWidth: value }); }}
        />
      </div>

      {node.type !== 'image' && node.type !== 'group' && (
        <>
          <div className="panel-title" style={{ marginTop: 18 }}>Text</div>
          <textarea
            className="text-input"
            maxLength={10000}
            placeholder={node.type === 'sticky' ? 'Write a note...' : 'Add a label...'}
            value={node.text ?? ''}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <div className="field-grid text-controls">
            <label>Font</label>
            <select value={node.textFont ?? 'Inter'} onChange={(e) => onChange({ textFont: e.target.value })}>
              <option>Inter</option>
              <option>Georgia</option>
              <option>Arial</option>
              <option>monospace</option>
            </select>
            <label>Size</label>
            <input
              type="number"
              min={6}
              max={240}
              value={node.textSize ?? (node.type === 'text' ? Math.max(12, node.size.y) : 14)}
              onChange={(e) => { const value = boundedNumber(e.target.value, 6, 240); if (value !== null) onChange({ textSize: value }); }}
            />
            <label>Align</label>
            <select value={node.textAlign ?? 'center'} onChange={(e) => onChange({ textAlign: e.target.value as 'left' | 'center' | 'right' })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
            <label>Colour</label>
            <input type="color" value={node.textColor ?? (node.type === 'sticky' ? '#6B5520' : node.fillColor)} onChange={(e) => onChange({ textColor: e.target.value })} />
            <label>Placement</label>
            <select value={node.textPosition ?? 'inside'} onChange={(e) => onChange({ textPosition: e.target.value as 'inside' | 'above' | 'below' })}>
              <option value="inside">Inside</option>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
            {(node.type === 'arrow' || node.type === 'line' || node.type === 'connector') && (
              <>
                <label>Offset</label>
                <input
                  type="number"
                  min={-1000}
                  max={1000}
                  value={node.textOffset ?? 0}
                  onChange={(e) => { const value = boundedNumber(e.target.value, -1000, 1000); if (value !== null) onChange({ textOffset: value }); }}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
