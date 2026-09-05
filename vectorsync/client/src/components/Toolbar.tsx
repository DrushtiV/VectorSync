import { useRef } from 'react';
import { Tool } from './CanvasStage';

interface ToolDef {
  id: Tool;
  label: string;
  icon: JSX.Element;
  shortcut: string;
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none' };

const TOOLS: ToolDef[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'V',
    icon: (
      <svg {...iconProps}><path d="M3 2.5L14.5 8.2 9.4 9.6 8 14.7 3 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
    ),
  },
  {
    id: 'rectangle',
    label: 'Rectangle',
    shortcut: 'R',
    icon: <svg {...iconProps}><rect x="3" y="4" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" /></svg>,
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    shortcut: 'O',
    icon: <svg {...iconProps}><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4" /></svg>,
  },
  {
    id: 'triangle',
    label: 'Triangle',
    shortcut: 'T',
    icon: <svg {...iconProps}><path d="M9 3.5L15 14.5H3L9 3.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>,
  },
  {
    id: 'arrow',
    label: 'Arrow',
    shortcut: 'A',
    icon: <svg {...iconProps}><path d="M3 9H14M14 9L10 5M14 9L10 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  {
    id: 'text',
    label: 'Text',
    shortcut: 'X',
    icon: <svg {...iconProps}><path d="M4 4H14M9 4V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  },
  {
    id: 'connector',
    label: 'Connector',
    shortcut: 'C',
    icon: <svg {...iconProps}><path d="M3 14L7 10M11 6L15 2M7 10L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="3" cy="14" r="1.5" fill="currentColor" /><circle cx="15" cy="2" r="1.5" fill="currentColor" /></svg>,
  },
  { id: 'diamond', label: 'Diamond', shortcut: 'D', icon: <svg {...iconProps}><path d="M9 2L15 9 9 16 3 9 9 2Z" stroke="currentColor" strokeWidth="1.4" /></svg> },
  { id: 'star', label: 'Star', shortcut: 'S', icon: <svg {...iconProps}><path d="M9 2.5L11 6.5 15.5 7 12.2 10.1 13 14.5 9 12.4 5 14.5 5.8 10.1 2.5 7 7 6.5 9 2.5Z" stroke="currentColor" strokeWidth="1.2" /></svg> },
  { id: 'polygon', label: 'Polygon', shortcut: 'P', icon: <svg {...iconProps}><path d="M5 3H13L16 9 13 15H5L2 9 5 3Z" stroke="currentColor" strokeWidth="1.4" /></svg> },
  { id: 'pill', label: 'Pill', shortcut: 'I', icon: <svg {...iconProps}><rect x="2" y="5" width="14" height="8" rx="4" stroke="currentColor" strokeWidth="1.4" /></svg> },
  { id: 'sticky', label: 'Sticky note', shortcut: 'N', icon: <svg {...iconProps}><path d="M3 2.5H15V12L11.5 15.5H3V2.5Z" stroke="currentColor" strokeWidth="1.4" /><path d="M11 15V12H14" stroke="currentColor" strokeWidth="1.2" /></svg> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <svg {...iconProps}><path d="M3 14L15 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg> },
  { id: 'title', label: 'Title box', shortcut: 'Y', icon: <svg {...iconProps}><path d="M3 4H15M9 4V14M6 14H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
];

interface Props {
  tool: Tool;
  onChange: (t: Tool) => void;
  onImageSelected: (file: File) => void;
}

export function Toolbar({ tool, onChange, onImageSelected }: Props) {
  const imageInput = useRef<HTMLInputElement>(null);
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
            title={`${t.label} (${t.shortcut})`}
          >
            {t.icon}
          </button>
        ))}
        <button className="tool-btn image-tool" title="Insert image" onClick={() => imageInput.current?.click()}>
          <svg {...iconProps}><rect x="2.5" y="3" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><circle cx="6.5" cy="7" r="1.2" fill="currentColor" /><path d="M3.5 13L7.5 9.5 10 11.5 12 9.5 15.5 13" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImageSelected(file); event.currentTarget.value = ''; }} />
      </div>
    </div>
  );
}
