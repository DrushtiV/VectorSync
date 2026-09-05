import { ConnectionStatus } from '../crdt/CRDTStore';
import { CanvasNode } from '../shared/types';

interface Props {
  nodes: CanvasNode[];
  status: ConnectionStatus;
}

export function WorkspaceSummary({ nodes, status }: Props) {
  const groups = nodes.filter((node) => node.type === 'group').length;
  const connectors = nodes.filter((node) => node.type === 'connector').length;
  return (
    <div className="panel-section workspace-summary">
      <div className="panel-title">Workspace</div>
      <div className="summary-grid">
        <span>Objects</span><strong>{nodes.length}</strong>
        <span>Groups</span><strong>{groups}</strong>
        <span>Connectors</span><strong>{connectors}</strong>
        <span>Viewport</span><strong>R-Tree</strong>
      </div>
      <div className={`sync-note sync-${status}`}>
        {status === 'connected' ? 'Synced live' : 'Saved locally; waiting to sync'}
      </div>
    </div>
  );
}
