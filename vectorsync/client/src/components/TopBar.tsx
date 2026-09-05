import { ConnectionStatus } from '../crdt/CRDTStore';
import { PresenceState } from '../shared/types';

interface Props {
  status: ConnectionStatus;
  peers: PresenceState[];
  selfName: string;
  selfColor: string;
  onExport: (format: 'svg' | 'png' | 'pdf') => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Live',
  reconnecting: 'Reconnecting…',
  disconnected: 'Offline',
};

export function TopBar({ status, peers, selfName, selfColor, onExport }: Props) {
  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        VectorSync
      </div>

      <div className={`status-chip status-${status}`}>
        <span className="status-dot" />
        {STATUS_LABEL[status]}
      </div>

      <div className="peer-activity" aria-label="Active collaborators">
        {peers.slice(0, 3).map((peer) => (
          <span key={peer.clientId} title={`${peer.name} is using ${peer.activeTool}`}>
            {peer.name}: {peer.activeTool}
          </span>
        ))}
      </div>

      <div className="peer-stack">
        {peers.slice(0, 5).map((p) => (
          <div key={p.clientId} className="avatar" style={{ background: p.color }} title={`${p.name} - ${p.activeTool}`}>
            {p.name.slice(0, 1).toUpperCase()}
          </div>
        ))}
        {peers.length > 5 && <div className="avatar avatar-more">+{peers.length - 5}</div>}
        <div className="avatar avatar-self" style={{ background: selfColor }} title={`${selfName} (you)`}>
          {selfName.slice(0, 1).toUpperCase()}
        </div>
        <button className="export-btn" title="Export SVG" onClick={() => onExport('svg')}>SVG</button>
        <button className="export-btn" title="Export PNG" onClick={() => onExport('png')}>PNG</button>
        <button className="export-btn" title="Export PDF" onClick={() => onExport('pdf')}>PDF</button>
      </div>
    </div>
  );
}
